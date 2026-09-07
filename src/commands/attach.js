"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseArgs } = require("../cli/args");
const { pathKind, targetPath, normalizeRelativePath } = require("../filesystem/path-utils");
const { applyManagedOperation, applyMigrationOperations } = require("../filesystem/apply-plan");
const { runInTransaction } = require("../filesystem/transaction-runner");
const { assertBundledFamily, assertTargetFamily } = require("../family-runtime");
const { gitDirtyWarning } = require("../git/worktree");
const { unmanagedPathReason, assertTargetWorkingTreeWritable } = require("../validation/security");
const { buildAttachPlanFromRuntime } = require("../template/attach-planner-runtime");
const { buildLegacyMigrationPlan } = require("../template/migration-runtime");
const {
  PACKAGE_ROOT,
  BUNDLED_TEMPLATE_ROOT,
  TEMPLATE_METADATA_FILENAME,
  fileHash,
  readTemplateSnapshot,
  readTargetIdentity,
  buildAttachDesiredOperations,
  buildMetadata,
  writeTemplateMetadata,
} = require("../template/instance-runtime");
const { verifyGeneratedAttach } = require("../template/verification-runtime");

function assertRequiredOptions(options) {
  if (!options.projectName) {
    throw new Error("attach 需要 --project-name，项目名称不能为空");
  }
  if (!options.businessDomain) {
    throw new Error("attach 需要 --business-domain，业务领域不能为空");
  }
  if (!options.targetDir) {
    throw new Error("attach 需要 --target-dir，目标目录不能为空");
  }
}

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

function attachVariables(options) {
  return {
    projectName: options.projectName,
    businessDomain: options.businessDomain,
    teamSize: options.teamSize || "待补充",
    issueTracker: options.issueTracker || "github",
    includeExampleDocs:
      options.includeExampleDocs === undefined
        ? true
        : Boolean(options.includeExampleDocs),
  };
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

function printAttachDryRun(plan, targetDir) {
  console.log("attach dry-run 预览");
  console.log(`目标目录：${targetDir}`);
  printLimitedOperations(
    plan.missing,
    (operation) => `add: ${operation.relativePath}`,
  );
  printLimitedOperations(
    plan.identity,
    (operation) => `identity: ${operation.relativePath}（规范化为 project-instance）`,
  );
  printLimitedOperations(
    plan.conflicts,
    (operation) => `conflict: ${operation.relativePath} (${operation.reason})`,
  );
  printLimitedOperations(
    plan.unsafe,
    (operation) => `unsafe: ${operation.relativePath} (${operation.reason})`,
  );
  if (plan.matched.length > 0) {
    console.log(`matched: ${plan.matched.length} 项内容一致，已纳入 managed baseline`);
  }
  printMigrationPlan(plan.migration);
  console.log(
    `统计：新增 ${plan.missing.length}，一致 ${plan.matched.length}，身份转换 ${plan.identity.length}，冲突 ${plan.conflicts.length}，unsafe ${plan.unsafe.length}`,
  );
  if (plan.conflicts.length > 0) {
    console.log("提示：--force 只覆盖 forceable 冲突；mergeStrategy=manual 的冲突必须人工处理");
  }
}

function affectedPathsForManagedOperations(operations) {
  return operations.map((operation) => normalizeRelativePath(operation.relativePath));
}

function affectedPathsForMigration(migrationPlan) {
  return (migrationPlan.operations || []).flatMap((operation) =>
    operation.kind === "move" ? [operation.from, operation.to] : [operation.path],
  );
}

function runAttach(argv = []) {
  const options = parseArgs(argv);
  assertRequiredOptions(options);

  if (options.dryRun && options.apply) {
    throw new Error("attach 的 --dry-run 与 --apply 互斥");
  }
  if (!options.dryRun && !options.apply) {
    throw new Error("attach 必须显式传入 --dry-run 或 --apply");
  }

  const snapshot = readTemplateSnapshot();
  assertBundledFamily(snapshot);
  const targetDir = normalizeTargetDir(options.targetDir);
  assertTargetFamily(targetDir);
  inspectExistingTargetDir(targetDir, { force: Boolean(options.force) });

  if (pathKind(targetPath(targetDir, TEMPLATE_METADATA_FILENAME)) !== "missing") {
    throw new Error("当前项目已有模板元数据，请使用 sync，不要重复 attach");
  }

  const variables = attachVariables(options);
  const identity = readTargetIdentity(targetDir);
  const desiredOperations = buildAttachDesiredOperations(
    targetDir,
    variables,
    identity,
  );
  const migrationPlan = buildLegacyMigrationPlan(targetDir, desiredOperations, {
    checkFlatTickets: true,
  });
  const warning = gitDirtyWarning(targetDir);

  const { classified: plan } = buildAttachPlanFromRuntime({
    targetDir,
    desiredOperations,
    migration: migrationPlan,
    warning,
    getUnmanagedReason: (operation) =>
      unmanagedPathReason(targetDir, operation.relativePath, {
        packageRoot: PACKAGE_ROOT,
      }),
    getPathKind: (operation) => pathKind(operation.targetPath),
    getFileHash: (operation) => fileHash(operation.targetPath),
  });
  plan.migration = migrationPlan;

  if (warning) console.log(warning);

  if (options.dryRun) {
    printAttachDryRun(plan, targetDir);
    return;
  }

  if (migrationPlan.unsafe.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error(
      "attach 被 unsafe 迁移项阻断；--force 不能绕过，请先人工整理 Ticket 归属",
    );
  }
  if (plan.unsafe.length > 0) {
    printAttachDryRun(plan, targetDir);
    throw new Error(
      "attach 被 unsafe 受管路径阻断；--force 不能绕过，请先人工整理目标路径",
    );
  }
  if (migrationPlan.conflicts.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error("attach 被旧路径迁移冲突阻断，请先处理目标冲突");
  }
  if (plan.conflicts.length > 0 && !options.force) {
    printAttachDryRun(plan, targetDir);
    throw new Error(
      "attach 检测到受管文件冲突；请先 dry-run，再使用 --apply --force",
    );
  }

  const managedToApply = [
    ...plan.missing,
    ...plan.identity,
    ...(options.force ? plan.forceableConflicts : []),
  ];

  const { backupPath } = runInTransaction({
    targetDir,
    operation: "attach",
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
      verifyGeneratedAttach(targetDir);
      writeTemplateMetadata(
        targetDir,
        buildMetadata(variables, desiredOperations),
        transaction,
      );
    },
  });

  console.log("接管完成");
  console.log(`目标目录：${targetDir}`);
  console.log(`新增研发管理资产：${plan.missing.length + plan.identity.length}`);
  if (options.force && plan.forceableConflicts.length > 0) {
    console.log(`force 覆盖冲突：${plan.forceableConflicts.length}`);
  }
  const manualConflicts = plan.conflicts.length - plan.forceableConflicts.length;
  if (manualConflicts > 0) {
    console.log(`需人工处理冲突：${manualConflicts}`);
  }
  if (backupPath) {
    console.log(`备份目录：${backupPath}`);
    console.log(`清理命令：rm -rf ${shellQuote(backupPath)}`);
  }
  console.log("下一步建议：运行 git diff 或 git status 检查接管结果");
}

module.exports = {
  runAttach,
};
