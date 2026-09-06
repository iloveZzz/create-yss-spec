"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");

function runCli(args) {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("production sync uses modular planner and transaction stack", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-sync-modular-"));
  const targetDir = path.join(sandbox, "project");

  try {
    const init = runCli([
      "--project-name",
      "Sync Modular",
      "--business-domain",
      "Data Platform",
      "--target-dir",
      targetDir,
    ]);
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /初始化完成/);

    const metadataPath = path.join(targetDir, ".yss-template.json");
    const metadataBeforeDryRun = fs.readFileSync(metadataPath, "utf8");

    const dryRun = runCli(["sync", "--target-dir", targetDir, "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /sync dry-run 预览/);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBeforeDryRun);

    const managedFile = path.join(targetDir, "AGENTS.md");
    const baseline = fs.readFileSync(managedFile, "utf8");
    fs.writeFileSync(managedFile, `${baseline}\nLOCAL MODIFICATION\n`);

    const normalSync = runCli(["sync", "--target-dir", targetDir]);
    assert.equal(normalSync.status, 0, normalSync.stderr);
    assert.match(normalSync.stdout, /跳过文件：1/);
    assert.match(fs.readFileSync(managedFile, "utf8"), /LOCAL MODIFICATION/);

    const forceSync = runCli(["sync", "--target-dir", targetDir, "--force"]);
    assert.equal(forceSync.status, 0, forceSync.stderr);
    assert.match(forceSync.stdout, /同步完成/);
    assert.doesNotMatch(fs.readFileSync(managedFile, "utf8"), /LOCAL MODIFICATION/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
