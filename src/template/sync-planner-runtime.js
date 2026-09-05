"use strict";

const {
  classifySyncOperations,
  createSyncPlan,
} = require("./sync-planner");

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
  const classified = classifySyncOperations({
    managedFiles,
    desiredOperations,
    getUnmanagedReason,
    getPathKind,
    getFileHash,
  });

  const plan = createSyncPlan({
    targetDir,
    fromVersion: metadata?.templateVersion || metadata?.cliVersion || "unknown",
    toVersion,
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
  buildSyncPlanFromRuntime,
};
