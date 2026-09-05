"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSyncPlanFromRuntime,
} = require("../src/template/sync-planner-runtime");

function op(relativePath, desiredHash) {
  return {
    relativePath,
    targetPath: `/project/${relativePath}`,
    desiredHash,
  };
}

test("runtime adapter composes metadata, IO probes and plan envelope", () => {
  const desiredOperations = [op("a.md", "new"), op("b.md", "new")];
  const metadata = {
    templateVersion: "3.1.0",
    managedFiles: {
      "a.md": { contentHash: "old" },
      "removed.md": { contentHash: "old" },
    },
  };

  const kinds = { "a.md": "file", "b.md": "missing" };
  const hashes = { "a.md": "old" };

  const result = buildSyncPlanFromRuntime({
    targetDir: "/project",
    metadata,
    desiredOperations,
    migration: { operations: [], legacy: [], conflicts: [], unsafe: [] },
    warning: "working tree dirty",
    toVersion: "4.0.0",
    getUnmanagedReason: () => null,
    getPathKind: (operation) => kinds[operation.relativePath],
    getFileHash: (operation) => hashes[operation.relativePath],
  });

  assert.deepEqual(result.classified.updated.map((item) => item.relativePath), ["a.md"]);
  assert.deepEqual(result.classified.added.map((item) => item.relativePath), ["b.md"]);
  assert.deepEqual(result.classified.removed, ["removed.md"]);
  assert.equal(result.plan.operation, "sync");
  assert.deepEqual(result.plan.template, { from: "3.1.0", to: "4.0.0" });
  assert.deepEqual(result.plan.warnings, ["working tree dirty"]);
  assert.equal(result.plan.blocked, false);
});

test("runtime adapter propagates unsafe state into blocked plan", () => {
  const operation = op("protected.md", "new");
  const result = buildSyncPlanFromRuntime({
    targetDir: "/project",
    metadata: { managedFiles: {} },
    desiredOperations: [operation],
    migration: { operations: [], legacy: [], conflicts: [], unsafe: [] },
    getUnmanagedReason: () => "protected path",
    getPathKind: () => "file",
    getFileHash: () => "old",
  });

  assert.equal(result.classified.unsafe.length, 1);
  assert.equal(result.plan.blocked, true);
  assert.equal(result.plan.unsafe[0].source, "managed-file");
});
