"use strict";

const {
  classifySyncOperations,
  createSyncPlan,
} = require("./sync-planner");
const {
  applyOwnershipToOperations,
  ownershipAwareUnmanagedReason,
  decoratePlanWithOwnership,
} = require("./ownership-runtime");

function buildSyncPlanFromRuntime({
  targetDir,
  metadata,
  desiredOperations,
  migration,
  warning = null,
  toVersion = "unknown",
  getUnmanagedReason,
  getPathKind,
  getFileHash,
}) {
  const managedFiles = metadata?.managedFiles || {};
  const ownedOperations = applyOwnershipToOperations(desiredOperations);
  const classified = classifySyncOperations({
    managedFiles,
    desiredOperations: ownedOperations,
    getUnmanagedReason: (operation) =>
      ownershipAwareUnmanagedReason(operation, getUnmanagedReason),
    getPathKind,
    getFileHash,
  });

  const basePlan = createSyncPlan({
    targetDir,
    fromVersion: metadata?.templateVersion || metadata?.cliVersion || "unknown",
    toVersion,
    classified,
    migration,
    warnings: warning ? [warning] : [],
  });
  const plan = decoratePlanWithOwnership(basePlan, ownedOperations);

  return {
    classified,
    plan,
  };
}

module.exports = {
  buildSyncPlanFromRuntime,
};
