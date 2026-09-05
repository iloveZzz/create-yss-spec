"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyAttachOperations,
  createAttachPlan,
} = require("../src/template/attach-planner");

function op(relativePath, desiredHash, extras = {}) {
  return {
    relativePath,
    targetPath: `/project/${relativePath}`,
    desiredHash,
    ...extras,
  };
}

test("classifyAttachOperations preserves attach classification semantics", () => {
  const desiredOperations = [
    op("missing.md", "new"),
    op("matched.md", "same"),
    op("identity.yaml", "desired", { identityConversion: true }),
    op("conflict.md", "desired"),
    op("protected.md", "desired"),
    op("directory.md", "desired"),
  ];

  const kinds = {
    "missing.md": "missing",
    "matched.md": "file",
    "identity.yaml": "file",
    "conflict.md": "file",
    "protected.md": "file",
    "directory.md": "directory",
  };
  const hashes = {
    "matched.md": "same",
    "identity.yaml": "source",
    "conflict.md": "current",
    "protected.md": "current",
  };

  const result = classifyAttachOperations({
    desiredOperations,
    getUnmanagedReason: (operation) =>
      operation.relativePath === "protected.md" ? "protected path" : null,
    getPathKind: (operation) => kinds[operation.relativePath],
    getFileHash: (operation) => hashes[operation.relativePath],
  });

  assert.deepEqual(result.missing.map((item) => item.relativePath), ["missing.md"]);
  assert.deepEqual(result.matched.map((item) => item.relativePath), ["matched.md"]);
  assert.deepEqual(result.identity.map((item) => item.relativePath), ["identity.yaml"]);
  assert.deepEqual(result.conflicts.map((item) => item.relativePath), ["conflict.md"]);
  assert.deepEqual(result.unsafe.map((item) => item.relativePath), [
    "protected.md",
    "directory.md",
  ]);
});

test("createAttachPlan exposes forceable managed conflicts and hard blockers", () => {
  const conflict = {
    ...op("conflict.md", "desired"),
    reason: "目标受管文件已存在且内容不一致",
  };
  const classified = {
    missing: [op("new.md", "desired")],
    matched: [],
    identity: [op("yss-project.yaml", "desired", { identityConversion: true })],
    conflicts: [conflict],
    unsafe: [],
    desiredOperations: [],
  };

  const plan = createAttachPlan({
    targetDir: "/project",
    classified,
    migration: {
      operations: [],
      legacy: [],
      unsafe: [],
      conflicts: [{ from: "old", to: "new", reason: "collision" }],
    },
  });

  assert.equal(plan.operation, "attach");
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.changes, [
    { action: "add", path: "new.md" },
    { action: "identity-convert", path: "yss-project.yaml" },
  ]);
  assert.equal(plan.conflicts.length, 2);
  assert.equal(plan.conflicts[0].forceable, true);
  assert.equal(plan.conflicts[0].source, "managed-file");
  assert.equal(plan.conflicts[1].forceable, false);
  assert.equal(plan.conflicts[1].source, "migration");
});

test("managed attach conflicts alone are not hard blockers", () => {
  const classified = {
    missing: [],
    matched: [],
    identity: [],
    conflicts: [
      {
        ...op("conflict.md", "desired"),
        reason: "目标受管文件已存在且内容不一致",
      },
    ],
    unsafe: [],
    desiredOperations: [],
  };

  const plan = createAttachPlan({ targetDir: "/project", classified });
  assert.equal(plan.blocked, false);
  assert.equal(plan.conflicts[0].forceable, true);
});
