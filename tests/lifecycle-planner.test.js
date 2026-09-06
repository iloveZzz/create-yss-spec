"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifySyncOperations } = require("../src/template/sync-planner");
const { classifyAttachOperations } = require("../src/template/attach-planner");
const { buildSyncPlanFromRuntime } = require("../src/template/sync-planner-runtime");

function op(relativePath, extra = {}) {
  return {
    relativePath,
    targetPath: `/project/${relativePath}`,
    desiredHash: "desired",
    ...extra,
  };
}

test("sync manual customization conflict is never forceable", () => {
  const operation = op("CONTEXT.md", {
    ownership: "managed-customizable",
    mergeStrategy: "manual",
  });
  const result = classifySyncOperations({
    managedFiles: { "CONTEXT.md": { contentHash: "baseline" } },
    desiredOperations: [operation],
    getPathKind: () => "file",
    getFileHash: () => "local",
  });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.forceableConflicts.length, 0);
  assert.match(result.conflicts[0].reason, /必须人工处理/);
});

test("sync replace-with-force customization remains forceable", () => {
  const operation = op("README.md", {
    ownership: "managed-customizable",
    mergeStrategy: "replace-with-force",
  });
  const result = classifySyncOperations({
    managedFiles: { "README.md": { contentHash: "baseline" } },
    desiredOperations: [operation],
    getPathKind: () => "file",
    getFileHash: () => "local",
  });

  assert.equal(result.forceableConflicts.length, 1);
});

test("attach manual customization conflict is never forceable", () => {
  const result = classifyAttachOperations({
    desiredOperations: [
      op("DESIGN.md", {
        ownership: "managed-customizable",
        mergeStrategy: "manual",
      }),
    ],
    getPathKind: () => "file",
    getFileHash: () => "local",
  });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.forceableConflicts.length, 0);
});

test("generated lifecycle fields are exposed in machine plan", () => {
  const result = buildSyncPlanFromRuntime({
    targetDir: "/project",
    metadata: { managedFiles: {} },
    desiredOperations: [op("yss-project.yaml")],
    migration: { operations: [], legacy: [], conflicts: [], unsafe: [] },
    getUnmanagedReason: () => null,
    getPathKind: () => "missing",
    getFileHash: () => null,
  });

  const change = result.plan.changes.find((item) => item.path === "yss-project.yaml");
  assert.equal(change.ownership, "generated");
  assert.equal(change.generatorId, "repository-identity");
  assert.equal(change.generatorVersion, 1);
});
