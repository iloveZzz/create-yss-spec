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

test("runtime adapter composes metadata, IO probes and ownership-aware plan envelope", () => {
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
  assert.equal(result.classified.updated[0].ownership, "managed");
  assert.equal(result.plan.operation, "sync");
  assert.deepEqual(result.plan.template, { from: "3.1.0", to: "4.0.0" });
  assert.deepEqual(result.plan.warnings, ["working tree dirty"]);
  assert.equal(result.plan.blocked, false);
  assert.equal(result.plan.changes[0].ownership, "managed");
});

test("runtime adapter propagates external unsafe state into blocked plan", () => {
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

test("ownership policy blocks user-owned desired operations even when path probes allow them", () => {
  const operation = op("apps/web/src/main.ts", "new");
  const result = buildSyncPlanFromRuntime({
    targetDir: "/project",
    metadata: { managedFiles: {} },
    desiredOperations: [operation],
    migration: { operations: [], legacy: [], conflicts: [], unsafe: [] },
    getUnmanagedReason: () => null,
    getPathKind: () => "missing",
    getFileHash: () => "old",
  });

  assert.equal(result.classified.unsafe.length, 1);
  assert.equal(result.classified.unsafe[0].ownership, "user-owned");
  assert.match(result.classified.unsafe[0].reason, /user-owned/);
  assert.equal(result.plan.blocked, true);
  assert.equal(result.plan.unsafe[0].ownership, "user-owned");
});
