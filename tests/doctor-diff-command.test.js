"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("./support/spawn-cli");
const { readonlyInventory } = require("./support/readonly-inventory");

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
    const beforeTree = readonlyInventory(targetDir);

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
    assert.equal(findCheck(doctorReport, "asset-dependencies")?.status, "ok");
    assert.equal(findCheck(doctorReport, "runtime-python3")?.status, "ok");
    assert.deepEqual(findCheck(doctorReport, "runtime-python3").data.packages, ["jsonschema", "referencing"]);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), before);
    assert.deepEqual(readonlyInventory(targetDir), beforeTree);

    const payloadDir = path.join(sandbox, "payload");
    fs.mkdirSync(payloadDir);
    fs.writeFileSync(path.join(payloadDir, "record.json"), '{"ready":true}\n');
    const archive = path.join(sandbox, "payload.zip"), unpacked = path.join(sandbox, "unpacked");
    const zipTool = path.join(targetDir, "scripts/lib/strategic-handoff-zip.py");
    const packed = spawnSync("python3", [zipTool, "pack", payloadDir, archive], { encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const restored = spawnSync("python3", [zipTool, "unpack", archive, unpacked], { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(fs.readFileSync(path.join(unpacked, "record.json"), "utf8"), '{"ready":true}\n');

    const diff = runCli(["diff", "--target-dir", targetDir, "--json"]);
    assert.equal(diff.status, 0, diff.stderr);
    const diffPlan = JSON.parse(diff.stdout);
    assert.equal(diffPlan.schemaVersion, 1);
    assert.equal(diffPlan.operation, "sync");
    assert.equal(diffPlan.blocked, false);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), before);
    assert.deepEqual(readonlyInventory(targetDir), beforeTree);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("doctor 定位未登记在旧基线中的缺失执行资源，保持诊断只读", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-doctor-resource-"));
  const targetDir = path.join(sandbox, "project");
  try {
    const init = runCli(["--project-name", "Runtime", "--business-domain", "Demo", "--target-dir", targetDir]);
    assert.equal(init.status, 0, init.stderr);
    const ref = "scripts/lib/strategic-handoff-zip.py";
    assert.equal(fs.existsSync(path.join(targetDir, ref)), true);
    fs.unlinkSync(path.join(targetDir, ref));
    const metadataPath = path.join(targetDir, ".yss-template.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath));
    delete metadata.managedFiles[ref];
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    const before = fs.readFileSync(metadataPath);
    const beforeTree = readonlyInventory(targetDir);
    const observed = runCli(["doctor", "--target-dir", targetDir, "--json"]);
    assert.equal(observed.status, 0, observed.stderr);
    const report = JSON.parse(observed.stdout);
    assert.equal(report.ok, false);
    assert.equal(findCheck(report, "asset-dependencies").status, "error");
    assert.ok(findCheck(report, "asset-dependencies").data.missingPaths.includes(ref));
    assert.deepEqual(fs.readFileSync(metadataPath), before);
    assert.deepEqual(readonlyInventory(targetDir), beforeTree);
    assert.equal(fs.existsSync(path.join(targetDir, ref)), false);
  } finally { fs.rmSync(sandbox, { recursive: true, force: true }); }
});

test("doctor rejects sync-only prune option", () => {
  const result = runCli(["doctor", "--prune"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--prune 仅适用于 sync/);
});
