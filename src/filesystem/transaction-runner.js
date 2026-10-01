"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
function withProjectLock(targetDir, execute) {
  const index = path.join(targetDir, ".yss-harness-state/upgrade.json");
  if (fs.existsSync(index)) {
    const state = JSON.parse(fs.readFileSync(index, "utf8"));
    if (!Array.isArray(state.runs) || state.runs.some(run => ["applying", "rolling-back"].includes(run.phase))) throw new Error("请先使用 migrate recover 恢复未完成迁移");
  }
  const file = path.join(targetDir, ".yss-harness-migrate.lock");
  if (fs.existsSync(file)) {
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("迁移锁不是普通文件");
    const owner = JSON.parse(fs.readFileSync(file, "utf8"));
    if (owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("未知迁移锁持有者");
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; else throw error; }
    if (alive) throw new Error("另一个同步或迁移正在运行");
    fs.unlinkSync(file);
  }
  const fd = fs.openSync(file, "wx", 0o600);
  fs.writeFileSync(fd, JSON.stringify({pid:process.pid,host:os.hostname()}));
  fs.fsyncSync(fd); fs.closeSync(fd);
  try { return execute(); } finally { fs.unlinkSync(file); }
}
const { FileTransaction } = require("./transaction");

function runInTransaction({
  targetDir,
  affectedPaths = [],
  execute,
  operation = "operation",
  TransactionClass = FileTransaction,
}) {
  if (typeof execute !== "function") {
    throw new TypeError("runInTransaction requires execute callback");
  }

  return withProjectLock(targetDir, () => {
  const transaction = new TransactionClass(targetDir);

  try {
    transaction.prepare(affectedPaths);
    const result = execute(transaction);
    const backupPath = transaction.finish();
    return {
      result,
      backupPath,
      transaction,
    };
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new Error(`${error.message}\n回滚失败：${rollbackError.message}`);
    }
    throw new Error(
      `${error.message}\n已回滚本次 ${operation}；临时备份保留于 ${transaction.backupRoot}`,
    );
  }
  });
}

module.exports = {
  runInTransaction,
};
