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
  fs.mkdirSync(path.join(fixtureRoot, ".template-source/evidence/reviews"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(fixtureRoot, ".template-source/evidence/reviews/fixture.md"),
    "template source evidence\n",
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, "docs/reviews"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "docs/reviews/fixture.md"),
    "template source review\n",
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, "docs/.scratch/source-change"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(fixtureRoot, "docs/.scratch/source-change/ticket.md"),
    "template source ticket\n",
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, ".github/workflows"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, ".github/workflows/template-node-tooling.yml"),
    "name: template-source-only\n",
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, ".cursor"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, ".cursor/environment.json"),
    '{"name":"template-source"}\n',
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, "docs/adr"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "docs/adr/0001-template-source.md"),
    "template source ADR\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "docs/adr/README.md"),
    "project ADR entrypoint\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "yss-public-skills.json"),
    '{"skills":[]}\n',
    "utf8",
  );
  fs.writeFileSync(path.join(fixtureRoot, ".nvmrc"), "22\n", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, ".gitignore"), "node_modules/\n", "utf8");
  fs.mkdirSync(path.join(fixtureRoot, "scripts/vendor"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "scripts/vendor/yaml.mjs"), "vendor yaml\n", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, "unlisted-root.md"), "must not ship\n", "utf8");
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
  fs.mkdirSync(path.join(runnerRoot, "src"), { recursive: true });
  fs.copyFileSync(syncScript, path.join(runnerRoot, "scripts/sync-template.js"));
  fs.copyFileSync(
    path.join(repoRoot, "src/template-hash.js"),
    path.join(runnerRoot, "src/template-hash.js"),
  );
  fs.copyFileSync(
    path.join(repoRoot, "template.manifest.json"),
    path.join(runnerRoot, "template.manifest.json"),
  );
  return runnerRoot;
}

function runSyncTemplate(runnerRoot, fixtureRoot, environment = {}) {
  return spawnSync(
    process.execPath,
    [path.join(runnerRoot, "scripts/sync-template.js")],
    {
      cwd: runnerRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...environment,
        YSS_SPEC_TEMPLATE_REPO: fixtureRoot,
        YSS_SPEC_TEMPLATE_REF: "main",
      },
    },
  );
}

function createCliRunner() {
  const runnerRoot = createSyncRunner();
  fs.mkdirSync(path.join(runnerRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(runnerRoot, "bin"), { recursive: true });
  for (const relativePath of [
    "package.json",
    "src/cli.js",
    "src/self-update.js",
    "bin/create-yss-spec.js",
  ]) {
    fs.mkdirSync(path.dirname(path.join(runnerRoot, relativePath)), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(repoRoot, relativePath),
      path.join(runnerRoot, relativePath),
    );
  }
  return runnerRoot;
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
  assert.equal(
    fs.existsSync(
      path.join(
        runnerRoot,
        "template/.template-source/evidence/reviews/fixture.md",
      ),
    ),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/docs/reviews/fixture.md")),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(runnerRoot, "template/docs/.scratch/source-change/ticket.md"),
    ),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(runnerRoot, "template/.github/workflows/template-node-tooling.yml"),
    ),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/.cursor/environment.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/docs/adr/0001-template-source.md")),
    false,
  );
  assert.equal(
    fs.readFileSync(path.join(runnerRoot, "template/docs/adr/README.md"), "utf8"),
    "project ADR entrypoint\n",
  );
  assert.equal(fs.existsSync(path.join(runnerRoot, "template/unlisted-root.md")), false);
  assert.equal(fs.readFileSync(path.join(runnerRoot, "template/.nvmrc"), "utf8"), "22\n");
  assert.equal(fs.readFileSync(path.join(runnerRoot, "template/scripts/vendor/yaml.mjs"), "utf8"), "vendor yaml\n");
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/yss-public-skills.json")),
    true,
  );
});

test("sync omits tracked files deleted from a local working tree", () => {
  const fixtureRoot = createTemplateFixture();
  fs.writeFileSync(
    path.join(fixtureRoot, "yss-project.yaml"),
    "schema_version: 1\nrepository_mode: template-source\n",
    "utf8",
  );
  runGit(fixtureRoot, ["add", "yss-project.yaml"]);
  runGit(fixtureRoot, ["commit", "-m", "repository identity"]);
  fs.rmSync(path.join(fixtureRoot, "docs/adr/README.md"));
  fs.rmSync(path.join(fixtureRoot, ".agents/skills/shared-skill/SKILL.md"));

  const runnerRoot = createSyncRunner();
  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/docs/adr/README.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(runnerRoot, "template/.codex/skills/shared-skill/SKILL.md")),
    false,
  );
});

test("sync snapshot remains valid when packaging and running use different locales", () => {
  const fixtureRoot = createTemplateFixture();
  const localizedDocsRoot = path.join(fixtureRoot, "docs/user-guide");
  fs.mkdirSync(localizedDocsRoot, { recursive: true });
  for (const fileName of [
    "templates",
    "产品生命周期工作流.md",
    "产品研发全生命周期最佳实践.md",
    "规格与任务迁移指南.md",
  ]) {
    fs.writeFileSync(path.join(localizedDocsRoot, fileName), `${fileName}\n`, "utf8");
  }
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "localized paths"]);

  const runnerRoot = createCliRunner();
  const syncResult = runSyncTemplate(runnerRoot, fixtureRoot, {
    LC_ALL: "zh_CN.UTF-8",
    LANG: "zh_CN.UTF-8",
  });
  assert.equal(syncResult.status, 0, syncResult.stderr);

  const targetDir = path.join(runnerRoot, "dry-run-target");
  const cliResult = spawnSync(
    process.execPath,
    [
      path.join(runnerRoot, "bin/create-yss-spec.js"),
      "--project-name",
      "Locale Test",
      "--business-domain",
      "Platform",
      "--target-dir",
      targetDir,
      "--dry-run",
    ],
    {
      cwd: runnerRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
      },
    },
  );

  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.match(cliResult.stdout, /dry-run/);
});

test("sync encodes npm-ignored dotfiles and records their logical paths", () => {
  const fixtureRoot = createTemplateFixture();
  fs.writeFileSync(path.join(fixtureRoot, ".gitignore"), "ignored\n", "utf8");
  fs.writeFileSync(
    path.join(fixtureRoot, ".agents/skills/shared-skill/.npmrc"),
    "audit=false\n",
    "utf8",
  );
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "dotfiles"]);

  const runnerRoot = createSyncRunner();
  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(runnerRoot, "template.snapshot.json"), "utf8"),
  );
  assert.equal(snapshot.encodedPaths[".gitignore"], "__yss_dotfile__.gitignore");
  assert.equal(
    snapshot.encodedPaths[".agents/skills/shared-skill/.npmrc"],
    ".agents/skills/shared-skill/__yss_dotfile__.npmrc",
  );
  assert.equal(
    fs.readFileSync(
      path.join(runnerRoot, "template/__yss_dotfile__.gitignore"),
      "utf8",
    ),
    "ignored\n",
  );
  assert.equal(
    fs.readFileSync(
      path.join(
        runnerRoot,
        "template/.agents/skills/shared-skill/__yss_dotfile__.npmrc",
      ),
      "utf8",
    ),
    "audit=false\n",
  );
});

test("sync recopies drifted shared skill projections from the canonical tree", () => {
  const fixtureRoot = createTemplateFixture();
  const driftedProjection = path.join(
    fixtureRoot,
    ".codex/skills/shared-skill/SKILL.md",
  );
  fs.rmSync(path.join(fixtureRoot, ".codex/skills/shared-skill"), {
    recursive: true,
    force: true,
  });
  fs.mkdirSync(path.join(fixtureRoot, ".codex/skills/shared-skill"), {
    recursive: true,
  });
  fs.writeFileSync(driftedProjection, "old projection\n", "utf8");
  fs.writeFileSync(
    path.join(fixtureRoot, "skills-lock.json"),
    `${JSON.stringify(
      {
        version: 3,
        projectionRoots: [".codex/skills"],
        skills: {
          shared: {
            "shared-skill": {},
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "drifted projection"]);

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

test("sync refreshes skills-lock.json using logical dotfile names before npm encoding", () => {
  const fixtureRoot = createTemplateFixture();
  fs.writeFileSync(
    path.join(fixtureRoot, ".agents/skills/shared-skill/.gitignore"),
    "tmp\n",
    "utf8",
  );
  fs.mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "scripts/update-skill-lock"),
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const names = [];",
      "function visit(dir) {",
      "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
      "    const abs = path.join(dir, entry.name);",
      "    if (entry.isDirectory()) visit(abs);",
      "    else names.push(entry.name);",
      "  }",
      "}",
      "visit(path.join(process.cwd(), '.agents/skills'));",
      "fs.writeFileSync(path.join(process.cwd(), 'skills-lock.json'), names.sort().join(',') + '\\n');",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );
  fs.writeFileSync(path.join(fixtureRoot, "skills-lock.json"), "stale-lock\n", "utf8");
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "lock before encode"]);

  const runnerRoot = createSyncRunner();
  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.equal(result.status, 0, result.stderr);
  const lock = fs.readFileSync(
    path.join(runnerRoot, "template/skills-lock.json"),
    "utf8",
  );
  assert.match(lock, /\.gitignore/);
  assert.doesNotMatch(lock, /__yss_dotfile__/);
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(runnerRoot, "template.snapshot.json"), "utf8"),
  );
  assert.equal(
    snapshot.encodedPaths[".agents/skills/shared-skill/.gitignore"],
    ".agents/skills/shared-skill/__yss_dotfile__.gitignore",
  );
});

test("sync refreshes bundled skills-lock.json after copying template files", () => {
  const fixtureRoot = createTemplateFixture();
  fs.mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "scripts/update-skill-lock"),
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "fs.writeFileSync(path.join(process.cwd(), 'skills-lock.json'), 'refreshed-lock\\n');",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "skills-lock.json"),
    "stale-lock\n",
    "utf8",
  );
  runGit(fixtureRoot, ["add", "."]);
  runGit(fixtureRoot, ["commit", "-m", "skill lock"]);

  const runnerRoot = createSyncRunner();
  const result = runSyncTemplate(runnerRoot, fixtureRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(runnerRoot, "template/skills-lock.json"), "utf8"),
    "refreshed-lock\n",
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
