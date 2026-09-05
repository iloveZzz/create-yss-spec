"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifySyncOperations,
  createSyncPlan,
} = require("../src/template/sync-planner");

function op(relativePath, desiredHash, extras = {}) {
  return {
    relativePath,
    targetPath: `/project/${relativePath}`,
    desiredHash,
    ...extras,
  };
}

test("classifySyncOperations preserves sync classification semantics", () => {
  const desiredOperations = [
    op("updated.md", "new"),
    op("added.md", "new"),
    op("unchanged.md", "same"),
    op("local-modified.md", "new"),
    op("unmanaged.md", "new"),
    op("unsafe-dir.md", "new"),
    op("identity.yaml", "new", {
      identityConversion: true,
      identitySourceHash: "source",
    }),
  ];

  const managedFiles = {
    "updated.md": { contentHash: "old" },
    "unchanged.md": { contentHash: "same" },
    "local-modified.md": { contentHash: "baseline" },
    "identity.yaml": { contentHash: "baseline" },
    "removed.md": { contentHash: "old" },
  };

  const kinds = {
    "updated.md": "file",
    "added.md": "missing",
    "unchanged.md": "file",
    "local-modified.md": "file",
    "unmanaged.md": "file",
    "unsafe-dir.md": "directory",
    "identity.yaml": "file",
  };
  const hashes = {
    "updated.md": "old",
    "unchanged.md": "same",
    "local-modified.md": "local-change",
    "unmanaged.md": "whatever",
    "identity.yaml": "source",
  };

  const result = classifySyncOperations({
    managedFiles,
    desiredOperations,
    getUnmanagedReason: (operation) =>
      operation.relativePath === "unmanaged.md" ? "protected path" : null,
    getPathKind: (operation) => kinds[operation.relativePath],
    getFileHash: (operation) => hashes[operation.relativePath],
  });

  assert.deepEqual(result.updated.map((item) => item.relativePath), [
    "updated.md",
    "identity.yaml",
  ]);
  assert.deepEqual(result.added.map((item) => item.relativePath), ["added.md"]);
  assert.deepEqual(result.unchanged.map((item) => item.relativePath), ["unchanged.md"]);
  assert.deepEqual(result.skipped.map((item) => item.relativePath), ["local-modified.md"]);
  assert.deepEqual(result.forceableConflicts.map((item) => item.relativePath), [
    "local-modified.md",
  ]);
  assert.deepEqual(result.unsafe.map((item) => item.relativePath), [
    "unmanaged.md",
    "unsafe-dir.md",
  ]);
  assert.deepEqual(result.removed, ["removed.md"]);
});

test("existing unmanaged baseline gap is conflict but not forceable", () => {
  const operation = op("unknown.md", "desired");
  const result = classifySyncOperations({
    managedFiles: {},
    desiredOperations: [operation],
    getPathKind: () => "file",
    getFileHash: () => "current",
  });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.forceableConflicts.length, 0);
  assert.match(result.conflicts[0].reason, /不在受管模板文件基线中/);
});

test("createSyncPlan produces a machine-readable plan envelope", () => {
  const classified = {
    updated: [op("a.md", "2")],
    added: [op("b.md", "1")],
    unchanged: [],
    skipped: [
      {
        ...op("c.md", "1"),
        reason: "检测到本地已修改的受管文件",
      },
    ],
    conflicts: [],
    forceableConflicts: [],
    unsafe: [],
    removed: ["d.md"],
    desiredOperations: [],
  };

  const plan = createSyncPlan({
    targetDir: "/project",
    fromVersion: "3.0.0",
    toVersion: "4.0.0",
    classified,
    warnings: ["working tree dirty"],
  });

  assert.equal(plan.operation, "sync");
  assert.equal(plan.blocked, false);
  assert.deepEqual(plan.template, { from: "3.0.0", to: "4.0.0" });
  assert.deepEqual(plan.changes, [
    { action: "update", path: "a.md" },
    { action: "add", path: "b.md" },
    { action: "remove-report", path: "d.md" },
  ]);
  assert.equal(plan.stats.updated, 1);
  assert.equal(plan.stats.added, 1);
  assert.equal(plan.stats.removed, 1);
  assert.deepEqual(plan.warnings, ["working tree dirty"]);
});

test("createSyncPlan blocks on unsafe or migration conflicts", () => {
  const classified = {
    updated: [],
    added: [],
    unchanged: [],
    skipped: [],
    conflicts: [],
    forceableConflicts: [],
    unsafe: [{ ...op("unsafe", "x"), reason: "protected" }],
    removed: [],
    desiredOperations: [],
  };

  const plan = createSyncPlan({
    targetDir: "/project",
    classified,
    migration: {
      operations: [],
      legacy: [],
      unsafe: [],
      conflicts: [{ from: "old", to: "new", reason: "collision" }],
    },
  });

  assert.equal(plan.blocked, true);
  assert.equal(plan.unsafe.length, 1);
});
