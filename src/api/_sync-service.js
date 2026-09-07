"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { pathKind, normalizeRelativePath } = require("../filesystem/path-utils");
const { applyManagedOperation, applyMigrationOperations } = require("../filesystem/apply-plan");
const { runInTransaction } = require("../filesystem/transaction-runner");
const { gitDirtyWarning } = require("../git/worktree");
const { unmanagedPathReason, assertTargetWorkingTreeWritable } = require("../validation/security");
const { buildSyncPlanFromRuntime } = require("../template/sync-planner-runtime");
const { buildLegacyMigrationPlan } = require("../template/migration-runtime");
const { decorateMetadataOwnership } = require("../template/ownership-metadata");
const { decorateMetadataLifecycle } = require("../template/lifecycle-metadata");
const {
  PACKAGE_ROOT,
  PACKAGE_MANIFEST,
  BUNDLED_TEMPLATE_ROOT,
  TEMPLATE_METADATA_FILENAME,
  fileHash,
  readTemplateSnapshot,
  readTargetIdentity,
  buildSyncDesiredOperations,
  loadTemplateMetadata,
  writeTemplateMetadata,
  buildNextSyncMetadata,
  verifyGeneratedSyncInstance,
} = require("../template/instance-runtime");

function normalizeTargetDir(targetDir = ".", cwd = process.cwd()) {
  return path.resolve(cwd, targetDir);
}

function isInsideTemplateRoot(targetDir) {
  const relativePath = path.relative(BUNDLED_TEMPLATE_ROOT, targetDir);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function inspectExistingTargetDir(targetDir, { force = false } = {}) {
  if (isInsideTemplateRoot(targetDir)) {
    throw new Error("目标目录不能位于模板源仓库内部");
  }
  if (!fs.existsSync(targetDir) || pathKind(targetDir) !== "directory") {
    throw new Error("attach 目标目录必须是已经存在的项目目录");
  }
  assertTargetWorkingTreeWritable(targetDir, {
    force,
    packageRoot: PACKAGE_ROOT,
  });
}

function affectedPathsForManagedOperations(operations) {
  return operations.map((operation) => normalizeRelativePath(operation.relativePath));
}

function affectedPathsForMigration(migrationPlan) {
  return (migrationPlan.operations || []).flatMap((operation) =>
    operation.kind === "move" ? [operation.from, operation.to] : [operation.path],
  );
}

function buildSyncContext({ targetDir = ".", force = false, cwd = process.cwd() } = {}) {
  readTemplateSnapshot();
  const resolvedTargetDir = normalizeTargetDir(targetDir, cwd);
  inspectExistingTargetDir(resolvedTargetDir, { force: Boolean(force) });

  const { metadata } = loadTemplateMetadata(resolvedTargetDir);
  const identity = readTargetIdentity(resolvedTargetDir);
  const desiredOperations = buildSyncDesiredOperations(
    resolvedTargetDir,
    metadata,
    identity,
  );
  const migrationPlan = buildLegacyMigrationPlan(
    resolvedTargetDir,
    desiredOperations,
    { checkFlatTickets: false },
  );
  const warning = gitDirtyWarning(resolvedTargetDir);

  const { classified: syncPlan, plan } = buildSyncPlanFromRuntime({
    targetDir: resolvedTargetDir,
    metadata,
    desiredOperations,
    migration: migrationPlan,
    warning,
    toVersion: PACKAGE_MANIFEST.version,
    getUnmanagedReason: (operation) =>
      unmanagedPathReason(resolvedTargetDir, operation.relativePath, {
        packageRoot: PACKAGE_ROOT,
      }),
    getPathKind: (operation) => pathKind(operation.targetPath),
    getFileHash: (operation) => fileHash(operation.targetPath),
  });

  return {
    targetDir: resolvedTargetDir,
    metadata,
    identity,
    desiredOperations,
    migrationPlan,
    warning,
    syncPlan,
    plan,
  };
}

function assertSyncApplicable(context) {
  const { migrationPlan, syncPlan } = context;
  if (migrationPlan.unsafe.length > 0) {
    throw new Error("sync 被 unsafe 迁移项阻断；请先人工整理 Ticket 归属");
  }
  if (syncPlan.unsafe.length > 0) {
    throw new Error(
      "sync 被 unsafe 受管路径阻断；--force 不能绕过，请先人工整理目标路径",
    );
  }
  if (migrationPlan.conflicts.length > 0) {
    throw new Error("sync 被旧路径迁移冲突阻断，请先处理目标冲突");
  }
}

function applySyncContext(context, { force = false } = {}) {
  assertSyncApplicable(context);
  const { targetDir, metadata, migrationPlan, syncPlan } = context;
  const managedToApply = [
    ...syncPlan.updated,
    ...syncPlan.added,
    ...(force ? syncPlan.forceableConflicts : []),
  ];

  const { backupPath } = runInTransaction({
    targetDir,
    operation: "sync",
    affectedPaths: [
      ...affectedPathsForManagedOperations(managedToApply),
      ...affectedPathsForMigration(migrationPlan),
      TEMPLATE_METADATA_FILENAME,
    ],
    execute: (transaction) => {
      for (const operation of managedToApply) {
        applyManagedOperation(operation, transaction);
      }
      applyMigrationOperations(migrationPlan, transaction);
      verifyGeneratedSyncInstance(targetDir);
      const nextMetadata = decorateMetadataLifecycle(
        decorateMetadataOwnership(buildNextSyncMetadata(metadata, syncPlan)),
      );
      writeTemplateMetadata(targetDir, nextMetadata, transaction);
    },
  });

  return {
    operation: "sync",
    targetDir,
    backupPath,
    template: context.plan.template,
    stats: {
      updated: syncPlan.updated.length,
      added: syncPlan.added.length,
      skipped: syncPlan.skipped.length,
      removed: syncPlan.removed.length,
      forceApplied: force ? syncPlan.forceableConflicts.length : 0,
    },
    skipped: syncPlan.skipped.map((operation) => ({
      path: operation.relativePath,
      reason: operation.reason,
      ownership: operation.ownership || null,
      mergeStrategy: operation.mergeStrategy || null,
    })),
    removed: [...syncPlan.removed],
  };
}

module.exports = {
  normalizeTargetDir,
  inspectExistingTargetDir,
  buildSyncContext,
  assertSyncApplicable,
  applySyncContext,
};
