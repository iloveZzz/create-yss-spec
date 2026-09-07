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

test("production attach uses modular planner and transaction stack", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-attach-modular-"));
  const targetDir = path.join(sandbox, "existing-project");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "user-owned.txt"), "keep me\n");

  try {
    const dryRun = runCli([
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Existing Project",
      "--business-domain",
      "Data Platform",
      "--dry-run",
    ]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /attach dry-run 预览/);
    assert.equal(fs.existsSync(path.join(targetDir, ".yss-template.json")), false);
    assert.equal(fs.readFileSync(path.join(targetDir, "user-owned.txt"), "utf8"), "keep me\n");

    const apply = runCli([
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Existing Project",
      "--business-domain",
      "Data Platform",
      "--apply",
    ]);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /接管完成/);
    assert.equal(fs.existsSync(path.join(targetDir, ".yss-template.json")), true);
    assert.equal(fs.readFileSync(path.join(targetDir, "user-owned.txt"), "utf8"), "keep me\n");
    assert.equal(fs.existsSync(path.join(targetDir, "AGENTS.md")), true);
    assert.equal(fs.existsSync(path.join(targetDir, "yss-project.yaml")), true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
