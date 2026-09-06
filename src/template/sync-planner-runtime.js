"use strict";

const {
  classifySyncOperations,
  createSyncPlan,
} = require("./sync-planner");
const {
  ownershipAwareUnmanagedReason,
  decoratePlanWithOwnership,
} = require("./ownership-runtime");
const {
  applyLifecycleToOperations,
  decoratePlanWithLifecycle,
} = require("./lifecycle-runtime");

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
  const lifecycleOperations = applyLifecycleToOperations(desiredOperations);
  const classified = classifySyncOperations({
    managedFiles,
    desiredOperations: lifecycleOperations,
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
  const ownershipPlan = decoratePlanWithOwnership(basePlan, lifecycleOperations);
  const plan = decoratePlanWithLifecycle(ownershipPlan, lifecycleOperations);

  return {
    classified,
    plan,
  };
}

module.exports = {
  buildSyncPlanFromRuntime,
};
