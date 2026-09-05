"use strict";

const {
  classifyAttachOperations,
  createAttachPlan,
} = require("./attach-planner");

function buildAttachPlanFromRuntime({
  targetDir,
  desiredOperations,
  migration,
  warning = null,
  getUnmanagedReason,
  getPathKind,
  getFileHash,
}) {
  const classified = classifyAttachOperations({
    desiredOperations,
    getUnmanagedReason,
    getPathKind,
    getFileHash,
  });

  const plan = createAttachPlan({
    targetDir,
    classified,
    migration,
    warnings: warning ? [warning] : [],
  });

  return {
    classified,
    plan,
  };
}

module.exports = {
  buildAttachPlanFromRuntime,
};
