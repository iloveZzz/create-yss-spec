"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_OWNERSHIP_POLICY,
  validateOwnershipPolicy,
  resolveOwnership,
  ownershipWriteViolation,
  isTemplateManagedOwnership,
} = require("./ownership-policy");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const MANIFEST_PATH = path.join(PACKAGE_ROOT, "template.manifest.json");

function loadOwnershipPolicy() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return validateOwnershipPolicy(
    manifest.ownershipPolicy || DEFAULT_OWNERSHIP_POLICY,
  );
}

const OWNERSHIP_POLICY = loadOwnershipPolicy();

function resolveTemplateOwnership(relativePath) {
  return resolveOwnership(relativePath, OWNERSHIP_POLICY);
}

function applyOwnershipToOperations(operations = []) {
  return operations.map((operation) => ({
    ...operation,
    ownership:
      operation.ownership || resolveTemplateOwnership(operation.relativePath),
  }));
}

function ownershipAwareUnmanagedReason(operation, fallback = null) {
  const violation = ownershipWriteViolation(operation);
  if (violation) return violation;
  return typeof fallback === "function" ? fallback(operation) : null;
}

function assertWritableTemplateOperations(operations = []) {
  for (const operation of applyOwnershipToOperations(operations)) {
    const violation = ownershipWriteViolation(operation);
    if (violation) throw new Error(violation);
  }
}

function decoratePlanWithOwnership(plan, desiredOperations = []) {
  const operations = applyOwnershipToOperations(desiredOperations);
  const ownershipByPath = new Map(
    operations.map((operation) => [operation.relativePath, operation.ownership]),
  );
  const ownershipFor = (item) =>
    ownershipByPath.get(item.path) || resolveTemplateOwnership(item.path);

  return {
    ...plan,
    changes: (plan.changes || []).map((item) => ({
      ...item,
      ownership: item.ownership || ownershipFor(item),
    })),
    conflicts: (plan.conflicts || []).map((item) => ({
      ...item,
      ownership: item.ownership || ownershipFor(item),
    })),
    unsafe: (plan.unsafe || []).map((item) => ({
      ...item,
      ownership: item.ownership || ownershipFor(item),
    })),
  };
}

function summarizeOwnership(operations = []) {
  const summary = Object.fromEntries(
    [
      "managed",
      "managed-customizable",
      "generated",
      "user-owned",
      "protected",
    ].map((name) => [name, 0]),
  );
  for (const operation of applyOwnershipToOperations(operations)) {
    summary[operation.ownership] += 1;
  }
  return summary;
}

function templateManagedOperations(operations = []) {
  return applyOwnershipToOperations(operations).filter((operation) =>
    isTemplateManagedOwnership(operation.ownership),
  );
}

module.exports = {
  PACKAGE_ROOT,
  OWNERSHIP_POLICY,
  loadOwnershipPolicy,
  resolveTemplateOwnership,
  applyOwnershipToOperations,
  ownershipAwareUnmanagedReason,
  assertWritableTemplateOperations,
  decoratePlanWithOwnership,
  summarizeOwnership,
  templateManagedOperations,
};
