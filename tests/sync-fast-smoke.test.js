"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const templateRoot = process.env.YSS_SPEC_TEMPLATE_REPO || path.resolve(packageRoot, "../..");
const { treeHash } = require("../src/template-hash");
const skillRoots = [".agents/skills", ".codex/skills"];

function run(cli, args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

function fileState(file) {
  const stat = fs.statSync(file);
  return { bytes: fs.readFileSync(file), mode: stat.mode & 0o777, mtime: stat.mtimeMs };
}

function assertUnchanged(file, before, { mtime = true } = {}) {
  const after = fileState(file);
  assert.deepEqual(after.bytes, before.bytes, file);
  assert.equal(after.mode, before.mode, file);
  if (mtime) assert.equal(after.mtime, before.mtime, file);
}

test("sync fast path preserves unchanged files, project assets and rollback", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "yss-sync-fast-"));
  const target = path.join(sandbox, "project");
  try {
    const snapshot = JSON.parse(fs.readFileSync(path.join(packageRoot, "template.snapshot.json"), "utf8"));
    const manifestHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(packageRoot, "template.manifest.json"))).digest("hex");
    const sourceScriptsCurrent = ["scripts/lib/skill-supply-chain.mjs", "scripts/verify-project-instance"].every((relative) =>
      fs.readFileSync(path.join(packageRoot, "template", relative)).equals(fs.readFileSync(path.join(templateRoot, relative))));
    const prepared = snapshot.manifestHash === manifestHash && snapshot.snapshotHash === treeHash(path.join(packageRoot, "template")) && sourceScriptsCurrent
      ? packageRoot : path.join(sandbox, "cli");
    if (prepared !== packageRoot) {
      fs.cpSync(packageRoot, prepared, { recursive: true, filter: (source) => {
        const relative = path.relative(packageRoot, source);
        return relative !== ".git" && relative !== "node_modules" && !relative.startsWith(".template-staging-");
      } });
      if (fs.existsSync(path.join(packageRoot, "node_modules"))) fs.symlinkSync(path.join(packageRoot, "node_modules"), path.join(prepared, "node_modules"), "dir");
      const synced = spawnSync(process.execPath, [path.join(prepared, "scripts/sync-template.js")], {
        cwd: prepared, encoding: "utf8", env: { ...process.env, YSS_SPEC_TEMPLATE_REPO: templateRoot },
      });
      assert.equal(synced.status, 0, synced.stderr);
    }
    const cli = path.join(prepared, "bin/create-yss-spec.js");
    const init = run(cli, ["--project-name", "Sync Fast", "--business-domain", "Governance", "--agent-runtime", "codex", "--target-dir", target, "--no-example-docs"]);
    assert.equal(init.status, 0, init.stderr);

    const projection = path.join(target, ".codex/skills/yss-research/SKILL.md");
    const lock = path.join(target, "skills-lock.json");
    const metadata = path.join(target, ".yss-template.json");
    const baseline = [projection, lock, metadata].map(fileState);
    const lockRefresh = spawnSync(path.join(target, "scripts/update-skill-lock"), [], { cwd: target, encoding: "utf8" });
    assert.equal(lockRefresh.status, 0, lockRefresh.stderr);
    assertUnchanged(lock, baseline[1]);
    for (const extra of [[], ["--force"]]) {
      const sync = run(cli, ["sync", "--target-dir", target, ...extra]);
      assert.equal(sync.status, 0, sync.stderr);
      assert.match(sync.stdout, /自动更新：0/);
      assert.doesNotMatch(sync.stdout, /备份目录：/);
      [projection, lock, metadata].forEach((file, index) => assertUnchanged(file, baseline[index]));
    }
    const gitInit = spawnSync("git", ["init", "-q", target], { encoding: "utf8" });
    assert.equal(gitInit.status, 0, gitInit.stderr);
    for (const extra of [[], ["--force"]]) {
      const sync = run(cli, ["sync", "--target-dir", target, ...extra]);
      assert.equal(sync.status, 0, sync.stderr);
      assert.doesNotMatch(sync.stdout, /备份目录：/);
      [projection, lock, metadata].forEach((file, index) => assertUnchanged(file, baseline[index]));
    }

    const skillContent = "---\nname: local-sync-probe\ndescription: Project skill\n---\n";
    for (const root of skillRoots) {
      const dir = path.join(target, root, "local-sync-probe");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), skillContent);
    }
    const register = spawnSync(path.join(target, "scripts/update-skill-lock"), ["--add=local-sync-probe"], { cwd: target, encoding: "utf8" });
    assert.equal(register.status, 0, register.stderr);
    const protectedAssets = {
      "scaffold-architecture-decisions.yaml": "approved decision\n",
      "docs/implementation/slice-contract.yaml": "approved contract\n",
      "docs/requirements/tickets/project-ticket.md": "project ticket\n",
    };
    for (const [relative, content] of Object.entries(protectedAssets)) {
      const file = path.join(target, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const force = run(cli, ["sync", "--target-dir", target, "--force"]);
    assert.equal(force.status, 0, force.stderr);
    assert.ok(JSON.parse(fs.readFileSync(lock, "utf8")).skills.shared["local-sync-probe"]);
    for (const root of skillRoots) assert.equal(fs.readFileSync(path.join(target, root, "local-sync-probe/SKILL.md"), "utf8"), skillContent);
    for (const [relative, content] of Object.entries(protectedAssets)) assert.equal(fs.readFileSync(path.join(target, relative), "utf8"), content);

    const validLock = fs.readFileSync(lock);
    fs.writeFileSync(lock, "{invalid json\n");
    const invalidLock = run(cli, ["sync", "--target-dir", target, "--force"]);
    assert.notEqual(invalidLock.status, 0);
    assert.equal(fs.readFileSync(lock, "utf8"), "{invalid json\n");
    fs.writeFileSync(lock, validLock);

    const stalePath = path.join(target, "scripts/verify-context-contract");
    const staleOriginal = fileState(stalePath);
    fs.rmSync(stalePath);
    const { buildSyncContext, applySyncContext } = require(path.join(prepared, "src/api/_sync-service.js"));
    const staleContext = buildSyncContext({ targetDir: target });
    assert.ok(staleContext.syncPlan.added.some((operation) => operation.relativePath === "scripts/verify-context-contract"));
    fs.writeFileSync(stalePath, "project change after planning\n");
    assert.throws(() => applySyncContext(staleContext), /规划后目标文件已变化/);
    assert.equal(fs.readFileSync(stalePath, "utf8"), "project change after planning\n");
    fs.writeFileSync(stalePath, staleOriginal.bytes);
    fs.chmodSync(stalePath, staleOriginal.mode);

    const gitignore = path.join(target, ".gitignore");
    const drift = fs.readFileSync(gitignore, "utf8").replace("node_modules/", "old-node-modules/");
    fs.writeFileSync(gitignore, drift);
    const metadataBefore = fileState(metadata);
    const verifier = path.join(target, "scripts/verify-project-instance");
    fs.writeFileSync(verifier, "#!/bin/sh\nexit 1\n");
    const failed = run(cli, ["sync", "--target-dir", target]);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /已回滚本次 sync/);
    const backup = failed.stderr.match(/临时备份保留于 ([^\n]+)/)?.[1]?.trim();
    assert.ok(backup);
    assert.equal(fs.readFileSync(path.join(backup, ".gitignore"), "utf8"), drift);
    assert.equal(fs.readFileSync(gitignore, "utf8"), drift);
    assertUnchanged(metadata, metadataBefore, { mtime: false });
    for (const [relative, content] of Object.entries(protectedAssets)) assert.equal(fs.readFileSync(path.join(target, relative), "utf8"), content);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
