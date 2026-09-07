"use strict";

const {
  classifyAttachOperations,
  createAttachPlan,
} = require("./attach-planner");
const {
  ownershipAwareUnmanagedReason,
  decoratePlanWithOwnership,
} = require("./ownership-runtime");
const {
  applyLifecycleToOperations,
  decoratePlanWithLifecycle,
} = require("./lifecycle-runtime");

function buildAttachPlanFromRuntime({
  targetDir,
  desiredOperations,
  migration,
  warning = null,
  getUnmanagedReason,
  getPathKind,
  getFileHash,
}) {
  const lifecycleOperations = applyLifecycleToOperations(desiredOperations);
  const classified = classifyAttachOperations({
    desiredOperations: lifecycleOperations,
    getUnmanagedReason: (operation) =>
      ownershipAwareUnmanagedReason(operation, getUnmanagedReason),
    getPathKind,
    getFileHash,
  });

  const basePlan = createAttachPlan({
    targetDir,
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
  buildAttachPlanFromRuntime,
};
