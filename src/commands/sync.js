"use strict";

const { parseArgs } = require("../cli/args");
const { renderPlanText } = require("../cli/plan-output");
const { serializePlan } = require("../template/plan-schema");
const {
  buildSyncContext,
  applySyncContext,
} = require("../api/_sync-service");

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

function printSyncDryRun(context) {
  const { targetDir, metadata, syncPlan, migrationPlan, plan } = context;
  console.log("sync dry-run 预览");
  console.log(`目标目录：${targetDir}`);
  console.log(
    `模板版本：${metadata.templateVersion || metadata.cliVersion || "unknown"} -> ${plan.template?.to || "unknown"}`,
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
    syncPlan.prunable || [],
    (relativePath) => `prunable: ${relativePath}`,
  );
  printLimitedOperations(
    (syncPlan.retainedRemoved || []).map((item) => item.path),
    (relativePath) => `remove-report: ${relativePath}`,
  );
  console.log(`unchanged: ${syncPlan.unchanged.length}`);
  printMigrationPlan(migrationPlan);
}

function runSync(argv = []) {
  const options = parseArgs(argv);
  const context = buildSyncContext({
    targetDir: options.targetDir || ".",
    force: Boolean(options.force),
  });

  if (options.json) {
    process.stdout.write(serializePlan(context.plan));
    return context.plan;
  }

  if (options.plan) {
    process.stdout.write(renderPlanText(context.plan));
    return context.plan;
  }

  if (context.warning) console.log(context.warning);

  if (options.dryRun) {
    printSyncDryRun(context);
    return context.plan;
  }

  if (context.migrationPlan.unsafe.length > 0 || context.syncPlan.unsafe.length > 0) {
    printSyncDryRun(context);
  } else if (context.migrationPlan.conflicts.length > 0) {
    printMigrationPlan(context.migrationPlan);
  }

  const result = applySyncContext(context, {
    force: Boolean(options.force),
    prune: Boolean(options.prune),
  });

  console.log("同步完成");
  console.log(
    `模板版本：${context.metadata.templateVersion || context.metadata.cliVersion || "unknown"} -> ${context.plan.template?.to || "unknown"}`,
  );
  console.log(`自动更新：${result.stats.updated}`);
  console.log(`新增文件：${result.stats.added}`);
  console.log(`跳过文件：${result.stats.skipped}`);
  console.log(`删除差异：${result.stats.removed}`);
  console.log(`安全清理：${result.stats.pruned}`);

  if (result.skipped.length > 0) {
    console.log("本地已修改，已跳过：");
    for (const item of result.skipped) {
      console.log(`- ${item.path}: ${item.reason}`);
    }
  }
  const pruned = new Set(result.pruned || []);
  const pendingRemoved = result.removed.filter((relativePath) => !pruned.has(relativePath));
  if (pendingRemoved.length > 0) {
    console.log("模板已移除但未自动删除：");
    for (const relativePath of pendingRemoved) {
      console.log(`- ${relativePath}`);
    }
  }
  if (result.retainedRemoved.length > 0) {
    console.log("退出分发面但已保留：");
    for (const item of result.retainedRemoved) console.log(`- ${item.path}: ${item.reason}`);
  }
  if (result.backupPath) {
    console.log(`备份目录：${result.backupPath}`);
    console.log(`清理命令：rm -rf ${shellQuote(result.backupPath)}`);
  }

  console.log("下一步建议：");
  console.log("1. 运行 git diff 或 git status 检查同步结果");
  console.log("2. 人工处理被跳过文件和删除差异（如有）");
  console.log("3. 确认无误后提交本次模板同步结果");
  return result;
}

module.exports = {
  runSync,
};
