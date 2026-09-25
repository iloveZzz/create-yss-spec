"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cli = path.resolve(__dirname, "../bin/create-yss-spec.js");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

function legacyFile(target, metadata, currentRef) {
  const oldRef = `docs/${currentRef.slice(".template-spec/".length)}`;
  const current = path.join(target, currentRef);
  const old = path.join(target, oldRef);
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.renameSync(current, old);
  metadata.managedFiles[oldRef] = metadata.managedFiles[currentRef];
  delete metadata.managedFiles[currentRef];
  return old;
}

test("old governance layout needs explicit migration and keeps project tracker bytes", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "yss-layout-migration-"));
  const target = path.join(sandbox, "project");
  try {
    const init = run(["--project-name", "Probe", "--business-domain", "Demo", "--team-size", "3", "--agent-runtime", "codex", "--target-dir", target]);
    assert.equal(init.status, 0, init.stderr);
    const metadataPath = path.join(target, ".yss-template.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const tracker = legacyFile(target, metadata, ".template-spec/agents/issue-tracker.md");
    const staticFile = legacyFile(target, metadata, ".template-spec/process/document-writing.md");
    const localTracker = `${fs.readFileSync(tracker, "utf8")}\n<!-- project tracker choice -->\n`;
    fs.writeFileSync(tracker, localTracker);
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    const ordinary = run(["sync", "--target-dir", target]);
    assert.notEqual(ordinary.status, 0);
    assert.match(`${ordinary.stdout}${ordinary.stderr}`, /--migrate-layout/);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/agents/issue-tracker.md")), false);
    assert.equal(fs.readFileSync(tracker, "utf8"), localTracker);

    const migrated = run(["sync", "--target-dir", target, "--migrate-layout"]);
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.equal(fs.existsSync(tracker), false);
    assert.equal(fs.existsSync(staticFile), false);
    assert.equal(fs.readFileSync(path.join(target, ".template-spec/agents/issue-tracker.md"), "utf8"), localTracker);
    const nextMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    assert.equal(Object.keys(nextMetadata.managedFiles).some((ref) => ref.startsWith("docs/agents/") || ref.startsWith("docs/process/")), false);
    const repeated = run(["sync", "--target-dir", target]);
    assert.equal(repeated.status, 0, repeated.stderr);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("modified legacy governance file blocks migration without overwriting either path", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "yss-layout-conflict-"));
  const target = path.join(sandbox, "project");
  try {
    const init = run(["--project-name", "Probe", "--business-domain", "Demo", "--team-size", "3", "--agent-runtime", "codex", "--target-dir", target]);
    assert.equal(init.status, 0, init.stderr);
    const metadataPath = path.join(target, ".yss-template.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const old = legacyFile(target, metadata, ".template-spec/process/document-writing.md");
    fs.appendFileSync(old, "\nlocal governance edit\n");
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    const result = run(["sync", "--target-dir", target, "--migrate-layout"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /已被项目修改/);
    assert.equal(fs.existsSync(old), true);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/process/document-writing.md")), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
