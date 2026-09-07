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

test("production sync uses modular planner, lifecycle policies and transaction stack", () => {
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
    const metadata = JSON.parse(metadataBeforeDryRun);
    assert.equal(metadata.customizationPolicyVersion, 1);
    assert.match(metadata.customizationPolicyHash, /^[0-9a-f]{64}$/);
    assert.equal(metadata.generatorPolicyVersion, 1);
    assert.match(metadata.generatorPolicyHash, /^[0-9a-f]{64}$/);
    assert.equal(metadata.managedFiles["CONTEXT.md"].mergeStrategy, "manual");
    assert.equal(
      metadata.managedFiles["yss-project.yaml"].generatorId,
      "repository-identity",
    );
    assert.equal(metadata.managedFiles["yss-project.yaml"].generatorVersion, 1);

    const dryRun = runCli(["sync", "--target-dir", targetDir, "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /sync dry-run 预览/);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBeforeDryRun);

    const jsonPlan = runCli(["sync", "--target-dir", targetDir, "--json"]);
    assert.equal(jsonPlan.status, 0, jsonPlan.stderr);
    const parsedPlan = JSON.parse(jsonPlan.stdout);
    assert.equal(parsedPlan.schemaVersion, 1);
    assert.equal(parsedPlan.operation, "sync");
    assert.equal(parsedPlan.targetDir, targetDir);
    assert.equal(parsedPlan.blocked, false);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBeforeDryRun);

    const managedFile = path.join(targetDir, "AGENTS.md");
    const baseline = fs.readFileSync(managedFile, "utf8");
    fs.writeFileSync(managedFile, `${baseline}\nLOCAL MODIFICATION\n`);

    const manualFile = path.join(targetDir, "CONTEXT.md");
    const manualBaseline = fs.readFileSync(manualFile, "utf8");
    fs.writeFileSync(manualFile, `${manualBaseline}\nMANUAL LOCAL MODIFICATION\n`);

    const conflictJson = runCli(["sync", "--target-dir", targetDir, "--json"]);
    assert.equal(conflictJson.status, 0, conflictJson.stderr);
    const conflictPlan = JSON.parse(conflictJson.stdout);

    const managedConflict = conflictPlan.conflicts.find(
      (item) => item.path === "AGENTS.md",
    );
    assert.equal(managedConflict.forceable, true);
    assert.equal(managedConflict.ownership, "managed-customizable");
    assert.equal(managedConflict.mergeStrategy, "replace-with-force");

    const manualConflict = conflictPlan.conflicts.find(
      (item) => item.path === "CONTEXT.md",
    );
    assert.equal(manualConflict.forceable, false);
    assert.equal(manualConflict.ownership, "managed-customizable");
    assert.equal(manualConflict.mergeStrategy, "manual");

    const generatedChange = conflictPlan.changes.find(
      (item) => item.path === "yss-project.yaml",
    );
    if (generatedChange) {
      assert.equal(generatedChange.ownership, "generated");
      assert.equal(generatedChange.generatorId, "repository-identity");
      assert.equal(generatedChange.generatorVersion, 1);
    }

    const conflictText = runCli(["sync", "--target-dir", targetDir, "--plan"]);
    assert.equal(conflictText.status, 0, conflictText.stderr);
    assert.match(conflictText.stdout, /AGENTS\.md \[managed-customizable\]/);
    assert.match(conflictText.stdout, /merge=replace-with-force/);
    assert.match(conflictText.stdout, /CONTEXT\.md \[managed-customizable\]/);
    assert.match(conflictText.stdout, /merge=manual/);

    const normalSync = runCli(["sync", "--target-dir", targetDir]);
    assert.equal(normalSync.status, 0, normalSync.stderr);
    assert.match(normalSync.stdout, /跳过文件：2/);
    assert.match(fs.readFileSync(managedFile, "utf8"), /LOCAL MODIFICATION/);
    assert.match(fs.readFileSync(manualFile, "utf8"), /MANUAL LOCAL MODIFICATION/);

    const forceSync = runCli(["sync", "--target-dir", targetDir, "--force"]);
    assert.equal(forceSync.status, 0, forceSync.stderr);
    assert.match(forceSync.stdout, /同步完成/);
    assert.doesNotMatch(fs.readFileSync(managedFile, "utf8"), /LOCAL MODIFICATION/);
    assert.match(fs.readFileSync(manualFile, "utf8"), /MANUAL LOCAL MODIFICATION/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
