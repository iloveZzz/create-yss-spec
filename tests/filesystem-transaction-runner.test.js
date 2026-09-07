"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runInTransaction } = require("../src/filesystem/transaction-runner");

class FakeTransaction {
  constructor(targetDir) {
    this.targetDir = targetDir;
    this.backupRoot = "/tmp/fake-backup";
    this.calls = [];
  }

  prepare(paths) {
    this.calls.push(["prepare", paths]);
  }

  rollback() {
    this.calls.push(["rollback"]);
  }

  finish() {
    this.calls.push(["finish"]);
    return "/tmp/fake-backup";
  }
}

test("runInTransaction prepares, executes and finishes", () => {
  const result = runInTransaction({
    targetDir: "/project",
    affectedPaths: ["a", "b"],
    TransactionClass: FakeTransaction,
    execute(transaction) {
      transaction.calls.push(["execute"]);
      return 42;
    },
  });

  assert.equal(result.result, 42);
  assert.equal(result.backupPath, "/tmp/fake-backup");
  assert.deepEqual(result.transaction.calls, [
    ["prepare", ["a", "b"]],
    ["execute"],
    ["finish"],
  ]);
});

test("runInTransaction rolls back and preserves legacy error contract", () => {
  assert.throws(
    () =>
      runInTransaction({
        targetDir: "/project",
        operation: "sync",
        TransactionClass: FakeTransaction,
        execute() {
          throw new Error("boom");
        },
      }),
    /boom\n已回滚本次 sync；临时备份保留于 \/tmp\/fake-backup/,
  );
});

test("runInTransaction reports rollback failure", () => {
  class BrokenRollbackTransaction extends FakeTransaction {
    rollback() {
      throw new Error("rollback boom");
    }
  }

  assert.throws(
    () =>
      runInTransaction({
        targetDir: "/project",
        TransactionClass: BrokenRollbackTransaction,
        execute() {
          throw new Error("boom");
        },
      }),
    /boom\n回滚失败：rollback boom/,
  );
});
