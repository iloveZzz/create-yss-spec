"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseArgs } = require("../cli/args");
const { renderPlanText } = require("../cli/plan-output");
const { targetPath, pathKind, normalizeRelativePath } = require("../filesystem/path-utils");
const { applyManagedOperation, applyMigrationOperations } = require("../filesystem/apply-plan");
const { runInTransaction } = require("../filesystem/transaction-runner");
const { gitDirtyWarning } = require("../git/worktree");
const { unmanagedPathReason, assertTargetWorkingTreeWritable } = require("../validation/security");
const { buildSyncPlanFromRuntime } = require("../template/sync-planner-runtime");
const { serializePlan } = require("../template/plan-schema");
const { buildLegacyMigrationPlan } = require("../template/migration-runtime");
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

function normalizeTargetDir(targetDir) {
  return path.resolve(process.cwd(), targetDir);
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

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function printLimitedOperations(operations, formatter, limit = 40) {
  const prioritized = [...operations].sort((left, right) => {
    const leftPath = typeof left === "string" ? left : left.relativePath;
    const rightPath = typeof right === "string" ? right : right.relativePath;
    const leftIsRoot = !leftPath.includes("/");
    const rightIsRoot = !rightPath.includes("/");
    if (leftIsRoot !== rightIsRoot) return leftIsRoot ? -1 : 1;
    return leftPath.localeCompare(rightPath);
  });

  for (const operation of prioritized.slice(0, limit)) {
    console.log(formatter(operation));
  }
  if (operations.length > limit) {
    console.log(
      `... 其余 ${operations.length - limit} 项省略，可用 manifest / git diff 查看完整清单`,
    );
  }
}

function printMigrationPlan(migrationPlan) {
  for (const item of migrationPlan.legacy || []) {
    const destination = item.to ? ` -> ${item.to}` : "";
    console.log(`legacy: ${item.action} ${item.from}${destination}`);
  }
  for (const item of migrationPlan.unsafe || []) {
    console.log(`unsafe: ${item.path} (${item.reason})`);
  }
  for (const item of migrationPlan.conflicts || []) {
    console.log(`conflict: ${item.from} -> ${item.to} (${item.reason})`);
  }
}

function printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan) {
  console.log("sync dry-run 预览");
  console.log(`目标目录：${targetDir}`);
  console.log(
    `模板版本：${metadata.templateVersion || metadata.cliVersion || "unknown"} -> ${PACKAGE_MANIFEST.version}`,
  );
  printLimitedOperations(
    syncPlan.updated,
    (operation) => `update: ${operation.relativePath}`,
  );
  printLimitedOperations(
    syncPlan.added,
    (operation) => `add: ${operation.relativePath}`,
  );
  printLimitedOperations(
    syncPlan.skipped,
    (operation) => `conflict: ${operation.relativePath} (${operation.reason})`,
  );
  printLimitedOperations(
    syncPlan.unsafe,
    (operation) => `unsafe: ${operation.relativePath} (${operation.reason})`,
  );
  printLimitedOperations(
    syncPlan.removed,
    (relativePath) => `remove-report: ${relativePath}`,
  );
  console.log(`unchanged: ${syncPlan.unchanged.length}`);
  printMigrationPlan(migrationPlan);
}

function affectedPathsForManagedOperations(operations) {
  return operations.map((operation) => normalizeRelativePath(operation.relativePath));
}

function affectedPathsForMigration(migrationPlan) {
  return (migrationPlan.operations || []).flatMap((operation) =>
    operation.kind === "move" ? [operation.from, operation.to] : [operation.path],
  );
}

function runSync(argv = []) {
  const options = parseArgs(argv);
  readTemplateSnapshot();

  const targetDir = normalizeTargetDir(options.targetDir || ".");
  inspectExistingTargetDir(targetDir, { force: Boolean(options.force) });

  const { metadata } = loadTemplateMetadata(targetDir);
  const identity = readTargetIdentity(targetDir);
  const desiredOperations = buildSyncDesiredOperations(targetDir, metadata, identity);
  const migrationPlan = buildLegacyMigrationPlan(targetDir, desiredOperations, {
    checkFlatTickets: false,
  });
  const warning = gitDirtyWarning(targetDir);

  const { classified: syncPlan, plan } = buildSyncPlanFromRuntime({
    targetDir,
    metadata,
    desiredOperations,
    migration: migrationPlan,
    warning,
    toVersion: PACKAGE_MANIFEST.version,
    getUnmanagedReason: (operation) =>
      unmanagedPathReason(targetDir, operation.relativePath, {
        packageRoot: PACKAGE_ROOT,
      }),
    getPathKind: (operation) => pathKind(operation.targetPath),
    getFileHash: (operation) => fileHash(operation.targetPath),
  });

  if (options.json) {
    process.stdout.write(serializePlan(plan));
    return plan;
  }

  if (options.plan) {
    process.stdout.write(renderPlanText(plan));
    return plan;
  }

  if (warning) console.log(warning);

  if (options.dryRun) {
    printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan);
    return;
  }

  if (migrationPlan.unsafe.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error("sync 被 unsafe 迁移项阻断；请先人工整理 Ticket 归属");
  }
  if (syncPlan.unsafe.length > 0) {
    printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan);
    throw new Error(
      "sync 被 unsafe 受管路径阻断；--force 不能绕过，请先人工整理目标路径",
    );
  }
  if (migrationPlan.conflicts.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error("sync 被旧路径迁移冲突阻断，请先处理目标冲突");
  }

  const managedToApply = [
    ...syncPlan.updated,
    ...syncPlan.added,
    ...(options.force ? syncPlan.forceableConflicts : []),
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
      writeTemplateMetadata(
        targetDir,
        buildNextSyncMetadata(metadata, syncPlan),
        transaction,
      );
    },
  });

  console.log("同步完成");
  console.log(
    `模板版本：${metadata.templateVersion || metadata.cliVersion || "unknown"} -> ${PACKAGE_MANIFEST.version}`,
  );
  console.log(`自动更新：${syncPlan.updated.length}`);
  console.log(`新增文件：${syncPlan.added.length}`);
  console.log(`跳过文件：${syncPlan.skipped.length}`);
  console.log(`删除差异：${syncPlan.removed.length}`);

  if (syncPlan.skipped.length > 0) {
    console.log("本地已修改，已跳过：");
    for (const operation of syncPlan.skipped) {
      console.log(`- ${operation.relativePath}: ${operation.reason}`);
    }
  }
  if (syncPlan.removed.length > 0) {
    console.log("模板已移除但未自动删除：");
    for (const relativePath of syncPlan.removed) {
      console.log(`- ${relativePath}`);
    }
  }
  if (backupPath) {
    console.log(`备份目录：${backupPath}`);
    console.log(`清理命令：rm -rf ${shellQuote(backupPath)}`);
  }

  console.log("下一步建议：");
  console.log("1. 运行 git diff 或 git status 检查同步结果");
  console.log("2. 人工处理被跳过文件和删除差异（如有）");
  console.log("3. 确认无误后提交本次模板同步结果");
}

module.exports = {
  runSync,
};
