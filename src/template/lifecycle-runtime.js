"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { applyOwnershipToOperations } = require("./ownership-runtime");
const {
  validateCustomizationPolicy,
  resolveCustomizationStrategy,
  validateGeneratorPolicy,
  resolveGenerator,
} = require("./lifecycle-policy");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const MANIFEST_PATH = path.join(PACKAGE_ROOT, "template.manifest.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

const CUSTOMIZATION_POLICY = validateCustomizationPolicy(
  manifest.customizationPolicy || {
    version: 1,
    defaultStrategy: "replace-with-force",
    rules: [],
  },
);
const GENERATOR_POLICY = validateGeneratorPolicy(
  manifest.generatorPolicy || { version: 1, rules: [] },
);

function applyLifecycleToOperations(operations = []) {
  return applyOwnershipToOperations(operations).map((operation) => {
    if (operation.ownership === "managed-customizable") {
      return {
        ...operation,
        mergeStrategy:
          operation.mergeStrategy ||
          resolveCustomizationStrategy(
            operation.relativePath,
            CUSTOMIZATION_POLICY,
          ),
      };
    }

    if (operation.ownership === "generated") {
      const generator = resolveGenerator(operation.relativePath, GENERATOR_POLICY);
      return generator
        ? {
            ...operation,
            generatorId: operation.generatorId || generator.generatorId,
            generatorVersion:
              operation.generatorVersion || generator.generatorVersion,
          }
        : operation;
    }

    return operation;
  });
}

function decoratePlanWithLifecycle(plan, desiredOperations = []) {
  const operations = applyLifecycleToOperations(desiredOperations);
  const byPath = new Map(
    operations.map((operation) => [operation.relativePath, operation]),
  );

  const decorate = (item) => {
    const operation = byPath.get(item.path);
    if (!operation) return item;
    const result = { ...item };
    if (operation.mergeStrategy) result.mergeStrategy = operation.mergeStrategy;
    if (operation.generatorId) result.generatorId = operation.generatorId;
    if (operation.generatorVersion) {
      result.generatorVersion = operation.generatorVersion;
    }
    return result;
  };

  return {
    ...plan,
    changes: (plan.changes || []).map(decorate),
    conflicts: (plan.conflicts || []).map(decorate),
    unsafe: (plan.unsafe || []).map(decorate),
  };
}

module.exports = {
  CUSTOMIZATION_POLICY,
  GENERATOR_POLICY,
  applyLifecycleToOperations,
  decoratePlanWithLifecycle,
};
