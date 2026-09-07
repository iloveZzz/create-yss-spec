"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { FileTransaction } = require("../src/filesystem/transaction");
const {
  applyMigrationOperations,
  applyManagedOperation,
} = require("../src/filesystem/apply-plan");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("applyMigrationOperations applies move and remove through transaction", () => {
  const root = tempDir("create-yss-spec-apply-test-");
  fs.writeFileSync(path.join(root, "old.txt"), "old");
  fs.writeFileSync(path.join(root, "remove.txt"), "remove");

  const tx = new FileTransaction(root);
  tx.prepare(["old.txt", "new.txt", "remove.txt"]);
  applyMigrationOperations(
    {
      targetDir: root,
      operations: [
        { kind: "move", from: "old.txt", to: "new.txt" },
        { kind: "remove", path: "remove.txt" },
      ],
    },
    tx,
  );

  assert.equal(fs.existsSync(path.join(root, "old.txt")), false);
  assert.equal(fs.readFileSync(path.join(root, "new.txt"), "utf8"), "old");
  assert.equal(fs.existsSync(path.join(root, "remove.txt")), false);

  tx.rollback();
  assert.equal(fs.readFileSync(path.join(root, "old.txt"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(root, "remove.txt"), "utf8"), "remove");
  assert.equal(fs.existsSync(path.join(root, "new.txt")), false);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});

test("applyManagedOperation supports render and copy", () => {
  const root = tempDir("create-yss-spec-apply-test-");
  const source = path.join(root, "source.txt");
  fs.writeFileSync(source, "source");

  const tx = new FileTransaction(root);
  const rendered = path.join(root, "rendered.txt");
  const copied = path.join(root, "copied.txt");
  tx.prepare(["rendered.txt", "copied.txt"]);

  applyManagedOperation(
    {
      type: "render",
      sourcePath: source,
      targetPath: rendered,
      desiredContent: "rendered",
    },
    tx,
  );
  applyManagedOperation(
    {
      type: "copy",
      sourcePath: source,
      targetPath: copied,
    },
    tx,
  );

  assert.equal(fs.readFileSync(rendered, "utf8"), "rendered");
  assert.equal(fs.readFileSync(copied, "utf8"), "source");

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});

test("apply services fail closed on unknown operation kinds", () => {
  const root = tempDir("create-yss-spec-apply-test-");
  const tx = new FileTransaction(root);

  assert.throws(
    () =>
      applyMigrationOperations(
        { targetDir: root, operations: [{ kind: "unknown" }] },
        tx,
      ),
    /不支持的迁移操作/,
  );
  assert.throws(
    () => applyManagedOperation({ type: "unknown" }, tx),
    /不支持的受管操作/,
  );

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});
