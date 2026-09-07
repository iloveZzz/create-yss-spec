"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");
const {
  API_VERSION,
  projectDoctor,
  projectDiff,
  templatePlan,
  templateApply,
} = require("..");

function initProject(targetDir) {
  return spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Programmatic API",
      "--business-domain",
      "Data Platform",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function check(report, name) {
  return report.checks.find((item) => item.name === name);
}

test("programmatic API plans, diagnoses and applies without CLI argv", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-api-"));
  const targetDir = path.join(sandbox, "project");

  try {
    assert.equal(API_VERSION, 1);
    const init = initProject(targetDir);
    assert.equal(init.status, 0, init.stderr);

    const plan = templatePlan({ targetDir });
    const diff = projectDiff({ targetDir });
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.operation, "sync");
    assert.deepEqual(diff, plan);

    const doctor = projectDoctor({ targetDir });
    assert.equal(doctor.schemaVersion, 1);
    assert.equal(doctor.operation, "doctor");
    assert.equal(check(doctor, "ownership-policy")?.status, "ok");
    assert.equal(check(doctor, "customization-policy")?.status, "ok");
    assert.equal(check(doctor, "generator-policy")?.status, "ok");

    const agentsPath = path.join(targetDir, "AGENTS.md");
    const agentsBaseline = fs.readFileSync(agentsPath, "utf8");
    fs.writeFileSync(agentsPath, `${agentsBaseline}\nAPI LOCAL EDIT\n`);

    const conflictPlan = templatePlan({ targetDir });
    const agentsConflict = conflictPlan.conflicts.find(
      (item) => item.path === "AGENTS.md",
    );
    assert.equal(agentsConflict.forceable, true);
    assert.equal(agentsConflict.mergeStrategy, "replace-with-force");

    const applyResult = templateApply({ targetDir, force: true });
    assert.equal(applyResult.operation, "sync");
    assert.equal(applyResult.stats.forceApplied, 1);
    assert.doesNotMatch(fs.readFileSync(agentsPath, "utf8"), /API LOCAL EDIT/);

    const metadata = JSON.parse(
      fs.readFileSync(path.join(targetDir, ".yss-template.json"), "utf8"),
    );
    assert.equal(metadata.ownershipPolicyVersion, 1);
    assert.equal(metadata.customizationPolicyVersion, 1);
    assert.equal(metadata.generatorPolicyVersion, 1);
    assert.equal(
      metadata.managedFiles["AGENTS.md"].mergeStrategy,
      "replace-with-force",
    );
    assert.equal(
      metadata.managedFiles["yss-project.yaml"].generatorId,
      "repository-identity",
    );

    const contextPath = path.join(targetDir, "CONTEXT.md");
    const contextBaseline = fs.readFileSync(contextPath, "utf8");
    fs.writeFileSync(contextPath, `${contextBaseline}\nMANUAL API EDIT\n`);
    const manualResult = templateApply({ targetDir, force: true });
    assert.equal(manualResult.stats.forceApplied, 0);
    assert.match(fs.readFileSync(contextPath, "utf8"), /MANUAL API EDIT/);
    assert.equal(
      manualResult.skipped.find((item) => item.path === "CONTEXT.md")?.mergeStrategy,
      "manual",
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
