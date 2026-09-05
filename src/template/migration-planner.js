"use strict";

function createMigrationPlan(targetDir) {
  return {
    targetDir,
    operations: [],
    legacy: [],
    conflicts: [],
    unsafe: [],
  };
}

function isBlockedMigration(plan) {
  return Boolean(
    plan &&
      ((Array.isArray(plan.conflicts) && plan.conflicts.length > 0) ||
        (Array.isArray(plan.unsafe) && plan.unsafe.length > 0)),
  );
}

function addUnsafe(plan, path, reason) {
  plan.unsafe.push({ path, reason });
  return plan;
}

function addConflict(plan, from, to, reason) {
  plan.conflicts.push({ from, to, reason });
  plan.legacy.push({ action: "conflict", from, to, reason });
  return plan;
}

function addMove(plan, from, to, reason) {
  plan.operations.push({ kind: "move", from, to, reason });
  plan.legacy.push({ action: "move", from, to, reason });
  return plan;
}

function addRemove(plan, path, reason, metadata = {}) {
  plan.operations.push({ kind: "remove", path, reason });
  plan.legacy.push({
    action: metadata.action || "remove",
    from: path,
    to: metadata.to ?? null,
    reason,
  });
  return plan;
}

function addReplaceWithTemplate(plan, from, to, reason) {
  plan.operations.push({ kind: "remove", path: from, reason });
  plan.legacy.push({
    action: "replace-with-template",
    from,
    to,
    reason,
  });
  return plan;
}

function addRemoveDuplicate(plan, from, to, reason) {
  plan.operations.push({
    kind: "remove",
    path: from,
    reason: `${reason}（新旧内容一致）`,
  });
  plan.legacy.push({
    action: "remove-duplicate",
    from,
    to,
    reason,
  });
  return plan;
}

function summarizeMigrationPlan(plan) {
  return {
    operations: plan?.operations?.length || 0,
    legacy: plan?.legacy?.length || 0,
    conflicts: plan?.conflicts?.length || 0,
    unsafe: plan?.unsafe?.length || 0,
    blocked: isBlockedMigration(plan),
  };
}

module.exports = {
  createMigrationPlan,
  isBlockedMigration,
  addUnsafe,
  addConflict,
  addMove,
  addRemove,
  addReplaceWithTemplate,
  addRemoveDuplicate,
  summarizeMigrationPlan,
};
