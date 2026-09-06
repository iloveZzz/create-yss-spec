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

function findCheck(report, name) {
  return report.checks.find((check) => check.name === name);
}

test("doctor and diff are read-only machine-friendly commands", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-doctor-diff-"));
  const targetDir = path.join(sandbox, "project");

  try {
    const init = runCli([
      "--project-name",
      "Doctor Diff",
      "--business-domain",
      "Data Platform",
      "--target-dir",
      targetDir,
    ]);
    assert.equal(init.status, 0, init.stderr);

    const metadataPath = path.join(targetDir, ".yss-template.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    assert.equal(metadata.ownershipPolicyVersion, 1);
    assert.match(metadata.ownershipPolicyHash, /^[0-9a-f]{64}$/);
    assert.equal(metadata.customizationPolicyVersion, 1);
    assert.match(metadata.customizationPolicyHash, /^[0-9a-f]{64}$/);
    assert.equal(metadata.generatorPolicyVersion, 1);
    assert.match(metadata.generatorPolicyHash, /^[0-9a-f]{64}$/);
    assert.equal(
      metadata.managedFiles["AGENTS.md"].ownership,
      "managed-customizable",
    );
    assert.equal(
      metadata.managedFiles["CONTEXT.md"].mergeStrategy,
      "manual",
    );
    assert.equal(
      metadata.managedFiles["yss-project.yaml"].generatorId,
      "repository-identity",
    );

    const before = fs.readFileSync(metadataPath, "utf8");

    const doctor = runCli(["doctor", "--target-dir", targetDir, "--json"]);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.equal(doctorReport.schemaVersion, 1);
    assert.equal(doctorReport.operation, "doctor");
    assert.equal(doctorReport.ok, true);
    assert.equal(findCheck(doctorReport, "template-metadata")?.status, "ok");
    assert.equal(findCheck(doctorReport, "template-drift")?.status, "ok");
    assert.equal(findCheck(doctorReport, "ownership-policy")?.status, "ok");
    assert.equal(findCheck(doctorReport, "customization-policy")?.status, "ok");
    assert.equal(findCheck(doctorReport, "generator-policy")?.status, "ok");
    assert.equal(findCheck(doctorReport, "managed-baseline")?.status, "ok");
    assert.equal(findCheck(doctorReport, "verifier-sync-skills")?.status, "ok");
    assert.equal(findCheck(doctorReport, "verifier-skill-lock")?.status, "ok");
    assert.equal(findCheck(doctorReport, "verifier-template")?.status, "warning");
    assert.equal(fs.readFileSync(metadataPath, "utf8"), before);

    const diff = runCli(["diff", "--target-dir", targetDir, "--json"]);
    assert.equal(diff.status, 0, diff.stderr);
    const diffPlan = JSON.parse(diff.stdout);
    assert.equal(diffPlan.schemaVersion, 1);
    assert.equal(diffPlan.operation, "sync");
    assert.equal(diffPlan.blocked, false);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), before);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
