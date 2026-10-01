"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let target;
test.beforeEach(() => {target=fs.mkdtempSync(path.join(os.tmpdir(),"transaction-runner-"));});
test.afterEach(() => fs.rmSync(target,{recursive:true,force:true}));

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
    targetDir: target,
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
        targetDir: target,
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
        targetDir: target,
        TransactionClass: BrokenRollbackTransaction,
        execute() {
          throw new Error("boom");
        },
      }),
    /boom\n回滚失败：rollback boom/,
  );
});

test("legacy sync refuses an active migration lock without modifying project", () => {
  const file=path.join(target,".yss-harness-migrate.lock");
  const bytes=JSON.stringify({pid:process.pid,host:os.hostname()});fs.writeFileSync(file,bytes);
  assert.throws(()=>runInTransaction({targetDir:target,execute(){throw Error("must not execute");}}),/另一个同步或迁移/);
  assert.equal(fs.readFileSync(file,"utf8"),bytes);
});

test("legacy sync cannot bypass interrupted migration recovery", () => {
  const state=path.join(target,".yss-harness-state");fs.mkdirSync(state,{recursive:true});
  const file=path.join(state,"upgrade.json"),bytes=JSON.stringify({runs:[{phase:"applying"}]});fs.writeFileSync(file,bytes);
  assert.throws(()=>runInTransaction({targetDir:target,execute(){throw Error("must not execute");}}),/migrate recover/);
  assert.equal(fs.readFileSync(file,"utf8"),bytes);
});
