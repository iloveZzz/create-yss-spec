"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { FileTransaction } = require("../src/filesystem/transaction");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("FileTransaction rollback restores backups and removes new mutations", () => {
  const root = tempDir("create-yss-spec-tx-test-");
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "existing.md"), "before\n");

  const tx = new FileTransaction(root);
  tx.prepare(["docs/existing.md", "docs/new.md"]);
  tx.writeFile(path.join(root, "docs", "existing.md"), "after\n");
  tx.writeFile(path.join(root, "docs", "nested", "new.md"), "new\n");

  assert.equal(fs.readFileSync(path.join(root, "docs", "existing.md"), "utf8"), "after\n");
  assert.equal(fs.existsSync(path.join(root, "docs", "nested", "new.md")), true);

  tx.rollback();

  assert.equal(fs.readFileSync(path.join(root, "docs", "existing.md"), "utf8"), "before\n");
  assert.equal(fs.existsSync(path.join(root, "docs", "nested", "new.md")), false);
  assert.equal(fs.existsSync(path.join(root, "docs", "nested")), false);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});

test("FileTransaction prepare collapses child backups under an existing parent backup", () => {
  const root = tempDir("create-yss-spec-tx-test-");
  fs.mkdirSync(path.join(root, "docs", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "nested", "file.md"), "content\n");

  const tx = new FileTransaction(root);
  tx.prepare(["docs", "docs/nested/file.md"]);

  assert.equal(tx.backups.length, 1);
  assert.equal(tx.backups[0].relativePath, "docs");

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});

test("FileTransaction finish removes empty backup root and preserves non-empty backup root", () => {
  const emptyRoot = tempDir("create-yss-spec-tx-test-");
  const emptyTx = new FileTransaction(emptyRoot);
  const emptyBackupRoot = emptyTx.backupRoot;
  assert.equal(emptyTx.finish(), null);
  assert.equal(fs.existsSync(emptyBackupRoot), false);
  fs.rmSync(emptyRoot, { recursive: true, force: true });

  const root = tempDir("create-yss-spec-tx-test-");
  fs.writeFileSync(path.join(root, "existing.txt"), "x");
  const tx = new FileTransaction(root);
  tx.prepare(["existing.txt"]);
  const backupRoot = tx.finish();

  assert.equal(backupRoot, tx.backupRoot);
  assert.equal(fs.existsSync(backupRoot), true);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(backupRoot, { recursive: true, force: true });
});

test("FileTransaction move is reversible after prepare", () => {
  const root = tempDir("create-yss-spec-tx-test-");
  fs.writeFileSync(path.join(root, "old.txt"), "legacy");

  const tx = new FileTransaction(root);
  tx.prepare(["old.txt", "new.txt"]);
  tx.move(path.join(root, "old.txt"), path.join(root, "nested", "new.txt"));

  assert.equal(fs.existsSync(path.join(root, "old.txt")), false);
  assert.equal(fs.readFileSync(path.join(root, "nested", "new.txt"), "utf8"), "legacy");

  tx.rollback();

  assert.equal(fs.readFileSync(path.join(root, "old.txt"), "utf8"), "legacy");
  assert.equal(fs.existsSync(path.join(root, "nested", "new.txt")), false);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tx.backupRoot, { recursive: true, force: true });
});
