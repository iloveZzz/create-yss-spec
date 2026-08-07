const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const syncScript = path.join(repoRoot, "scripts/sync-template.js");

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function createTemplateFixture({ externalSymlink = false } = {}) {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "yss-template-fixture-"),
  );
  const skillRoot = path.join(fixtureRoot, ".agents/skills/shared-skill");
  const projectionRoot = path.join(fixtureRoot, ".codex/skills");

  fs.mkdirSync(skillRoot, { recursive: true });
  fs.mkdirSync(projectionRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), "shared skill\n", "utf8");
  fs.symlinkSync(
    "../../.agents/skills/shared-skill",
    path.join(projectionRoot, "shared-skill"),
    "dir",
  );

  if (externalSymlink) {
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "yss-template-external-"),
    );
    const externalFile = path.join(externalRoot, "secret.txt");
    fs.writeFileSync(externalFile, "external secret\n", "utf8");
    fs.mkdirSync(path.join(fixtureRoot, ".claude/skills"), { recursive: true });
    fs.symlinkSync(
      externalFile,
      path.join(fixtureRoot, ".claude/skills/external-link"),
      "file",
    );
  }

  runGit(fixtureRoot, ["init", "--initial-branch", "main"]);
  runGit(fixtureRoot, ["config", "user.email", "test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "YSS Test"]);
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "fixture"]);

  return fixtureRoot;
}

function createSyncRunner() {
  const runnerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yss-sync-runner-"));
  fs.mkdirSync(path.join(runnerRoot, "scripts"), { recursive: true });
  fs.copyFileSync(syncScript, path.join(runnerRoot, "scripts/sync-template.js"));
  fs.copyFileSync(
    path.join(repoRoot, "template.manifest.json"),
    path.join(runnerRoot, "template.manifest.json"),
  );
  return runnerRoot;
}

function runSyncTemplate(runnerRoot, fixtureRoot) {
  return spawnSync(
    process.execPath,
    [path.join(runnerRoot, "scripts/sync-template.js")],
    {
      cwd: runnerRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        YSS_SPEC_TEMPLATE_REPO: fixtureRoot,
        YSS_SPEC_TEMPLATE_REF: "main",
      },
    },
  );
}

test("sync expands internal directory projections into the bundled template", () => {
  const fixtureRoot = createTemplateFixture();
  const runnerRoot = createSyncRunner();
  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(
      path.join(runnerRoot, "template/.codex/skills/shared-skill/SKILL.md"),
      "utf8",
    ),
    "shared skill\n",
  );
});

test("sync rejects external symlinks without replacing the existing snapshot", () => {
  const fixtureRoot = createTemplateFixture({ externalSymlink: true });
  const runnerRoot = createSyncRunner();
  const existingSnapshot = path.join(runnerRoot, "template");
  fs.mkdirSync(existingSnapshot, { recursive: true });
  fs.writeFileSync(path.join(existingSnapshot, "sentinel.txt"), "keep\n", "utf8");

  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /模板投影链接必须指向仓库内部目录/,
  );
  assert.equal(
    fs.readFileSync(path.join(existingSnapshot, "sentinel.txt"), "utf8"),
    "keep\n",
  );
});
