"use strict";

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
}

module.exports = {
  runInTransaction,
};
