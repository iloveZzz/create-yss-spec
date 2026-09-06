"use strict";

const {
  classifyAttachOperations,
  createAttachPlan,
} = require("./attach-planner");
const {
  applyOwnershipToOperations,
  ownershipAwareUnmanagedReason,
  decoratePlanWithOwnership,
} = require("./ownership-runtime");

function buildAttachPlanFromRuntime({
  targetDir,
  desiredOperations,
  migration,
  warning = null,
  getUnmanagedReason,
  getPathKind,
  getFileHash,
}) {
  const ownedOperations = applyOwnershipToOperations(desiredOperations);
  const classified = classifyAttachOperations({
    desiredOperations: ownedOperations,
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
  const plan = decoratePlanWithOwnership(basePlan, ownedOperations);

  return {
    classified,
    plan,
  };
}

module.exports = {
  buildAttachPlanFromRuntime,
};
