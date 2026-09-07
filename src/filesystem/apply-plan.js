"use strict";

const fs = require("node:fs");
const { targetPath } = require("./path-utils");

function applyMigrationOperations(migrationPlan, transaction) {
  for (const operation of migrationPlan.operations || []) {
    if (operation.kind === "remove") {
      transaction.remove(targetPath(migrationPlan.targetDir, operation.path));
      continue;
    }
    if (operation.kind === "move") {
      transaction.move(
        targetPath(migrationPlan.targetDir, operation.from),
        targetPath(migrationPlan.targetDir, operation.to),
      );
      continue;
    }
    throw new Error(`不支持的迁移操作：${operation.kind}`);
  }
}

function applyManagedOperation(operation, transaction) {
  if (operation.type === "render") {
    transaction.ensureParent(operation.targetPath);
    fs.writeFileSync(operation.targetPath, operation.desiredContent);
    fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
    transaction.mark(operation.targetPath);
    return;
  }

  if (operation.type === "copy") {
    transaction.copyFile(operation.sourcePath, operation.targetPath);
    fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
    return;
  }

  throw new Error(`不支持的受管操作：${operation.type}`);
}

module.exports = {
  applyMigrationOperations,
  applyManagedOperation,
};
