"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMigrationPlan,
  isBlockedMigration,
  addUnsafe,
  addConflict,
  addMove,
  addRemove,
  addReplaceWithTemplate,
  addRemoveDuplicate,
  summarizeMigrationPlan,
} = require("../src/template/migration-planner");

test("migration plan starts empty and unblocked", () => {
  const plan = createMigrationPlan("/project");
  assert.deepEqual(plan, {
    targetDir: "/project",
    operations: [],
    legacy: [],
    conflicts: [],
    unsafe: [],
  });
  assert.equal(isBlockedMigration(plan), false);
});

test("unsafe and conflict items block migration", () => {
  const plan = createMigrationPlan("/project");
  addUnsafe(plan, "legacy/path", "unsafe type");
  addConflict(plan, "old", "new", "collision");

  assert.equal(isBlockedMigration(plan), true);
  assert.deepEqual(plan.unsafe, [{ path: "legacy/path", reason: "unsafe type" }]);
  assert.deepEqual(plan.conflicts, [{ from: "old", to: "new", reason: "collision" }]);
  assert.equal(plan.legacy[0].action, "conflict");
});

test("migration operations preserve existing action semantics", () => {
  const plan = createMigrationPlan("/project");
  addMove(plan, "old-a", "new-a", "rename");
  addRemove(plan, "old-b", "cleanup", { action: "remove-empty", to: "new-b" });
  addReplaceWithTemplate(plan, "old-c", "new-c", "template-owned");
  addRemoveDuplicate(plan, "old-d", "new-d", "same content");

  assert.deepEqual(plan.operations, [
    { kind: "move", from: "old-a", to: "new-a", reason: "rename" },
    { kind: "remove", path: "old-b", reason: "cleanup" },
    { kind: "remove", path: "old-c", reason: "template-owned" },
    {
      kind: "remove",
      path: "old-d",
      reason: "same content（新旧内容一致）",
    },
  ]);
  assert.deepEqual(
    plan.legacy.map((item) => item.action),
    ["move", "remove-empty", "replace-with-template", "remove-duplicate"],
  );
});

test("migration summary is machine-readable", () => {
  const plan = createMigrationPlan("/project");
  addMove(plan, "old", "new", "rename");
  addUnsafe(plan, "link", "symlink");

  assert.deepEqual(summarizeMigrationPlan(plan), {
    operations: 1,
    legacy: 1,
    conflicts: 0,
    unsafe: 1,
    blocked: true,
  });
});
