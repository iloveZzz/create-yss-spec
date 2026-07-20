const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;
const metadataFileName = ".yss-template.json";

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

test("interactive init generates a template instance in an empty directory", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "demo-project");
  const input = ["Demo Project", "Data Platform", "12", targetDir].join("\n") + "\n";

  const result = spawnSync(process.execPath, [cliBin], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /初始化完成/);
  assert.match(result.stdout, /下一步建议/);
  assert.ok(fs.existsSync(path.join(targetDir, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(targetDir, "README.md")));
  assert.ok(fs.existsSync(path.join(targetDir, metadataFileName)));
  assert.ok(fs.existsSync(path.join(targetDir, "docs/templates/spec-template.md")));
  assert.ok(
    fs.existsSync(
      path.join(targetDir, "docs/templates/vertical-slice-ticket-template.md"),
    ),
  );
  assert.ok(fs.existsSync(path.join(targetDir, ".codex/skills/to-spec/SKILL.md")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex/skills/to-tickets/SKILL.md")));
  assert.ok(fs.existsSync(path.join(targetDir, ".codex/skills/wayfinder/SKILL.md")));
  assert.ok(
    fs.lstatSync(
      path.join(targetDir, ".claude/skills/dispatching-parallel-agents"),
    ).isSymbolicLink(),
  );
  assert.ok(
    fs.existsSync(path.join(targetDir, ".codex/skills/yss-openapi/img.png")),
  );
  assert.ok(
    fs.existsSync(path.join(targetDir, ".codex/skills/yss-openapi/img_1.png")),
  );
  assert.equal(fs.existsSync(path.join(targetDir, ".git")), false);
  assert.equal(fs.existsSync(path.join(targetDir, "packages")), false);
  assert.equal(
    fs.existsSync(path.join(targetDir, "scripts/sync-cli-template.js")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, ".claude/settings.local.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, ".codex/hooks.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, ".codex/settings.local.json")),
    false,
  );
  assert.equal(fs.existsSync(path.join(targetDir, ".pi/settings.json")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".codebuddy")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".qoder")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".qwen")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".agent")), false);
  assert.equal(
    fs.existsSync(path.join(targetDir, ".agents/skills/to-prd")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, ".agents/skills/to-issues")),
    false,
  );

  const agentsContent = fs.readFileSync(path.join(targetDir, "AGENTS.md"), "utf8");
  const readmeContent = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");
  const metadata = JSON.parse(
    fs.readFileSync(path.join(targetDir, metadataFileName), "utf8"),
  );
  const projectManifest = fs.readFileSync(
    path.join(targetDir, "yss-project.yaml"),
    "utf8",
  );

  assert.match(agentsContent, /repository_mode: project-instance/);
  assert.match(readmeContent, /^# Demo Project/m);
  assert.equal(metadata.templateName, "create-yss-spec");
  assert.equal(metadata.templateVersion, packageVersion);
  assert.equal(metadata.variables.projectName, "Demo Project");
  assert.equal(metadata.variables.businessDomain, "Data Platform");
  assert.equal(
    projectManifest,
    "schema_version: 1\nrepository_mode: project-instance\n",
  );

  const verification = spawnSync(path.join(targetDir, "scripts/verify-template"), {
    cwd: targetDir,
    encoding: "utf8",
  });
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
});

test("init rejects an unsupported bundled project manifest schema before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unsupported-schema-project");
  const manifestPath = path.join(repoRoot, "template/yss-project.yaml");
  const originalManifest = fs.readFileSync(manifestPath, "utf8");

  fs.writeFileSync(
    manifestPath,
    "schema_version: 2\nrepository_mode: template-source\n",
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "--project-name",
        "Unsupported Schema Project",
        "--business-domain",
        "Governance",
        "--target-dir",
        targetDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /schema_version|schema/i);
    assert.equal(fs.existsSync(targetDir), false);
  } finally {
    fs.writeFileSync(manifestPath, originalManifest, "utf8");
  }
});

test("init rejects an unsupported bundled repository mode before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unsupported-mode-project");
  const manifestPath = path.join(repoRoot, "template/yss-project.yaml");
  const originalManifest = fs.readFileSync(manifestPath, "utf8");

  fs.writeFileSync(
    manifestPath,
    "schema_version: 1\nrepository_mode: unknown-mode\n",
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "--project-name",
        "Unsupported Mode Project",
        "--business-domain",
        "Governance",
        "--target-dir",
        targetDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /repository_mode|template-source/);
    assert.equal(fs.existsSync(targetDir), false);
  } finally {
    fs.writeFileSync(manifestPath, originalManifest, "utf8");
  }
});

test("init rejects unknown bundled project manifest fields before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unknown-field-project");
  const manifestPath = path.join(repoRoot, "template/yss-project.yaml");
  const originalManifest = fs.readFileSync(manifestPath, "utf8");

  fs.writeFileSync(
    manifestPath,
    "schema_version: 1\nrepository_mode: template-source\nproject_name: leaked\n",
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "--project-name",
        "Unknown Field Project",
        "--business-domain",
        "Governance",
        "--target-dir",
        targetDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未知字段|project_name/);
    assert.equal(fs.existsSync(targetDir), false);
  } finally {
    fs.writeFileSync(manifestPath, originalManifest, "utf8");
  }
});

test("init rejects duplicate bundled project manifest fields before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "duplicate-field-project");
  const manifestPath = path.join(repoRoot, "template/yss-project.yaml");
  const originalManifest = fs.readFileSync(manifestPath, "utf8");

  fs.writeFileSync(
    manifestPath,
    "schema_version: 1\nschema_version: 1\nrepository_mode: template-source\n",
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "--project-name",
        "Duplicate Field Project",
        "--business-domain",
        "Governance",
        "--target-dir",
        targetDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /重复字段|schema_version/);
    assert.equal(fs.existsSync(targetDir), false);
  } finally {
    fs.writeFileSync(manifestPath, originalManifest, "utf8");
  }
});

test("dry-run previews the plan without writing or deleting files", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "preview-project");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Preview Project",
      "--business-domain",
      "Fixed Income",
      "--target-dir",
      targetDir,
      "--dry-run",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/i);
  assert.equal(fs.existsSync(targetDir), false);
  assert.equal(fs.existsSync(path.join(targetDir, "AGENTS.md")), false);

  fs.mkdirSync(targetDir, { recursive: true });
  const existingFile = path.join(targetDir, "keep.txt");
  fs.writeFileSync(existingFile, "existing", "utf8");

  const forceDryRunResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Preview Project",
      "--business-domain",
      "Fixed Income",
      "--target-dir",
      targetDir,
      "--dry-run",
      "--force",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(forceDryRunResult.status, 0, forceDryRunResult.stderr);
  assert.equal(fs.readFileSync(existingFile, "utf8"), "existing");
  assert.equal(fs.existsSync(path.join(targetDir, "AGENTS.md")), false);
});

test("non-empty target requires --force, and --git-init initializes a repository", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "existing-project");

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "keep.txt"), "existing", "utf8");

  const blockedResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Force Project",
      "--business-domain",
      "Macro Research",
      "--target-dir",
      targetDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.notEqual(blockedResult.status, 0);
  assert.match(blockedResult.stderr, /非空/);

  const forcedResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Force Project",
      "--business-domain",
      "Macro Research",
      "--target-dir",
      targetDir,
      "--force",
      "--git-init",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(forcedResult.status, 0, forcedResult.stderr);
  assert.ok(fs.existsSync(path.join(targetDir, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(targetDir, ".git")));
});

test("manifest-driven optional flags affect rendered output and example docs", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "customized-project");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Custom Project",
      "--business-domain",
      "Cross Asset",
      "--target-dir",
      targetDir,
      "--issue-tracker",
      "gitlab",
      "--no-example-docs",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const readmeContent = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");

  assert.match(readmeContent, /默认 Issue Tracker：gitlab/);
  assert.equal(
    fs.existsSync(path.join(targetDir, "docs/discovery/IDEATION.md")),
    false,
  );
});

test("bundled template snapshot excludes untracked source files", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "tracked-only-project");
  const sentinelName = ".tmp-create-yss-spec-untracked.txt";
  const sentinelPath = path.join(repoRoot, sentinelName);

  fs.writeFileSync(sentinelPath, "untracked", "utf8");

  try {
    const result = spawnSync(
      process.execPath,
      [
        cliBin,
        "--project-name",
        "Tracked Only Project",
        "--business-domain",
        "Platform",
        "--target-dir",
        targetDir,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(targetDir, sentinelName)), false);
  } finally {
    fs.rmSync(sentinelPath, { force: true });
  }
});

test("sync rejects projects without template metadata", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: sandboxDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /模板元数据|模板实例仓库/);
});

test("sync updates unchanged managed files and restores missing managed files", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "sync-project");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Sync Project",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(initResult.status, 0, initResult.stderr);

  const metadataPath = path.join(targetDir, metadataFileName);
  const readmePath = path.join(targetDir, "README.md");
  const restoredPath = path.join(targetDir, "docs/templates/spec-delta-template.md");
  const restoredProjectionPath = path.join(
    targetDir,
    ".claude/skills/dispatching-parallel-agents",
  );
  const originalReadme = fs.readFileSync(readmePath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  const legacyReadme = originalReadme.replace("默认 Issue Tracker：github", "默认 Issue Tracker：jira");
  fs.writeFileSync(readmePath, legacyReadme, "utf8");
  fs.rmSync(restoredPath, { force: true });
  fs.rmSync(restoredProjectionPath, { recursive: true, force: true });

  metadata.templateVersion = "0.9.0";
  metadata.managedFiles["README.md"].contentHash = sha256(legacyReadme);
  delete metadata.managedFiles["docs/templates/spec-delta-template.md"];
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");

  const syncResult = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(syncResult.status, 0, syncResult.stderr);
  assert.match(syncResult.stdout, /同步完成/);
  assert.match(syncResult.stdout, /0\.9\.0/);
  assert.match(syncResult.stdout, new RegExp(packageVersion.replace(/\./g, "\\.")));
  assert.equal(fs.readFileSync(readmePath, "utf8"), originalReadme);
  assert.ok(fs.existsSync(restoredPath));
  assert.ok(fs.lstatSync(restoredProjectionPath).isSymbolicLink());

  const syncedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.equal(syncedMetadata.templateVersion, packageVersion);
  assert.equal(
    syncedMetadata.managedFiles["README.md"].contentHash,
    sha256(originalReadme),
  );
  assert.ok(
    syncedMetadata.managedFiles["docs/templates/spec-delta-template.md"],
  );
});

test("sync migrates legacy Spec and Ticket assets and removes obsolete skills", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "legacy-project");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Legacy Project",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const metadataPath = path.join(targetDir, metadataFileName);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const moves = [
    ["docs/templates/spec-template.md", "docs/templates/prd-template.md"],
    [
      "docs/templates/vertical-slice-ticket-template.md",
      "docs/templates/vertical-slice-issue-template.md",
    ],
  ];

  for (const [nextPath, legacyPath] of moves) {
    fs.renameSync(path.join(targetDir, nextPath), path.join(targetDir, legacyPath));
    metadata.managedFiles[legacyPath] = metadata.managedFiles[nextPath];
    delete metadata.managedFiles[nextPath];
  }

  fs.mkdirSync(path.join(targetDir, "docs/requirements/issues"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(targetDir, "docs/requirements/issues/legacy-slice.md"),
    "# 旧垂直切片\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(targetDir, "docs/requirements/legacy-feature-prd.md"),
    "# 旧规格\n",
    "utf8",
  );

  for (const obsoleteSkill of [
    ".agents/skills/to-prd",
    ".agents/skills/to-issues",
    ".codex/skills/to-prd",
    ".claude/skills/to-issues",
  ]) {
    fs.mkdirSync(path.join(targetDir, obsoleteSkill), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, obsoleteSkill, "SKILL.md"),
      "# 过时 skill\n",
      "utf8",
    );
  }

  const legacyProjectManifest =
    "schema_version: 1\nrepository_mode: template-source\n";
  fs.writeFileSync(
    path.join(targetDir, "yss-project.yaml"),
    legacyProjectManifest,
    "utf8",
  );
  metadata.managedFiles["yss-project.yaml"].contentHash = sha256(
    legacyProjectManifest,
  );
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /迁移/);
  assert.equal(
    fs.existsSync(path.join(targetDir, "docs/templates/prd-template.md")),
    false,
  );
  assert.ok(fs.existsSync(path.join(targetDir, "docs/templates/spec-template.md")));
  assert.equal(
    fs.existsSync(
      path.join(targetDir, "docs/templates/vertical-slice-issue-template.md"),
    ),
    false,
  );
  assert.ok(
    fs.existsSync(
      path.join(targetDir, "docs/templates/vertical-slice-ticket-template.md"),
    ),
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, "docs/requirements/issues")),
    false,
  );
  assert.equal(
    fs.readFileSync(
      path.join(targetDir, "docs/requirements/tickets/legacy-slice.md"),
      "utf8",
    ),
    "# 旧垂直切片\n",
  );
  assert.equal(
    fs.readFileSync(
      path.join(targetDir, "docs/requirements/legacy-feature-spec.md"),
      "utf8",
    ),
    "# 旧规格\n",
  );
  assert.equal(
    fs.readFileSync(path.join(targetDir, "yss-project.yaml"), "utf8"),
    "schema_version: 1\nrepository_mode: project-instance\n",
  );
  for (const obsoleteSkill of [
    ".agents/skills/to-prd",
    ".agents/skills/to-issues",
    ".codex/skills/to-prd",
    ".claude/skills/to-issues",
  ]) {
    assert.equal(fs.existsSync(path.join(targetDir, obsoleteSkill)), false);
  }
});

test("sync fails closed when legacy and current assets conflict", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "conflicting-project");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Conflicting Project",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const legacyPath = path.join(
    targetDir,
    "docs/requirements/conflicting-feature-prd.md",
  );
  const currentPath = path.join(
    targetDir,
    "docs/requirements/conflicting-feature-spec.md",
  );
  fs.writeFileSync(legacyPath, "# 旧内容\n", "utf8");
  fs.writeFileSync(currentPath, "# 新内容\n", "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /冲突/);
  assert.match(result.stderr, /conflicting-feature-prd\.md/);
  assert.match(result.stderr, /conflicting-feature-spec\.md/);
  assert.equal(fs.readFileSync(legacyPath, "utf8"), "# 旧内容\n");
  assert.equal(fs.readFileSync(currentPath, "utf8"), "# 新内容\n");
});

test("sync rejects an unsupported target repository mode before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unsupported-target-mode");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Unsupported Target Mode",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const manifestPath = path.join(targetDir, "yss-project.yaml");
  const invalidManifest =
    "schema_version: 1\nrepository_mode: unsupported-mode\n";
  fs.writeFileSync(manifestPath, invalidManifest, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repository_mode|unsupported-mode/);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), invalidManifest);
});

test("sync rejects an unsupported target manifest schema before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unsupported-target-schema");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Unsupported Target Schema",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const manifestPath = path.join(targetDir, "yss-project.yaml");
  const invalidManifest =
    "schema_version: 2\nrepository_mode: project-instance\n";
  fs.writeFileSync(manifestPath, invalidManifest, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema_version|schema/i);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), invalidManifest);
});

test("sync rejects unknown target manifest fields before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unknown-target-field");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Unknown Target Field",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const manifestPath = path.join(targetDir, "yss-project.yaml");
  const invalidManifest =
    "schema_version: 1\nrepository_mode: project-instance\nteam_size: 8\n";
  fs.writeFileSync(manifestPath, invalidManifest, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未知字段|team_size/);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), invalidManifest);
});

test("sync canonicalizes a valid template-source target despite stale metadata", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "stale-manifest-metadata");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Stale Manifest Metadata",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const manifestPath = path.join(targetDir, "yss-project.yaml");
  fs.writeFileSync(
    manifestPath,
    "schema_version: 1\nrepository_mode: template-source\n",
    "utf8",
  );

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(manifestPath, "utf8"),
    "schema_version: 1\nrepository_mode: project-instance\n",
  );
});

test("sync dry-run previews changes without mutating files or metadata", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "sync-preview-project");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Preview Sync Project",
      "--business-domain",
      "Research",
      "--target-dir",
      targetDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(initResult.status, 0, initResult.stderr);

  const metadataPath = path.join(targetDir, metadataFileName);
  const readmePath = path.join(targetDir, "README.md");
  const restoredPath = path.join(targetDir, "docs/templates/spec-delta-template.md");
  const originalReadme = fs.readFileSync(readmePath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const legacyReadme = originalReadme.replace("默认 Issue Tracker：github", "默认 Issue Tracker：youtrack");

  fs.writeFileSync(readmePath, legacyReadme, "utf8");
  fs.rmSync(restoredPath, { force: true });

  metadata.templateVersion = "0.8.0";
  metadata.managedFiles["README.md"].contentHash = sha256(legacyReadme);
  delete metadata.managedFiles["docs/templates/spec-delta-template.md"];
  const beforeDryRunMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
  fs.writeFileSync(metadataPath, beforeDryRunMetadata, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync", "--dry-run"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sync dry-run/i);
  assert.match(result.stdout, /0\.8\.0/);
  assert.match(result.stdout, new RegExp(packageVersion.replace(/\./g, "\\.")));
  assert.match(result.stdout, /update: README\.md/);
  assert.match(result.stdout, /add: docs\/templates\/spec-delta-template\.md/);
  assert.equal(fs.readFileSync(readmePath, "utf8"), legacyReadme);
  assert.equal(fs.existsSync(restoredPath), false);
  assert.equal(fs.readFileSync(metadataPath, "utf8"), beforeDryRunMetadata);
});

test("legacy attach dry-run excludes sync rollout docs from template additions", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "legacy-sync-preview-project");
  const metadataPath = path.join(targetDir, metadataFileName);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        templateName: "create-yss-spec",
        templateVersion: "legacy-untracked",
        templateSource: "legacy-attach",
        initializedAt: "2026-07-05T13:30:52Z",
        lastSyncedAt: "2026-07-05T13:30:52Z",
        managedFilesManifestVersion: "test-manifest-version",
        variables: {
          projectName: "Legacy Sync Project",
          businessDomain: "Operations",
          teamSize: "6",
          issueTracker: "github",
          includeExampleDocs: true,
        },
        managedFiles: {},
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const result = spawnSync(process.execPath, [cliBin, "sync", "--dry-run"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sync dry-run/i);
  assert.match(result.stdout, /add: \.gitignore/);
  assert.doesNotMatch(result.stdout, /yss-spec-cli-template-sync-discovery\.md/);
  assert.doesNotMatch(result.stdout, /yss-spec-cli-template-sync-prd\.md/);
  assert.doesNotMatch(
    result.stdout,
    /yss-spec-cli-template-sync-slice-01-main-path\.md/,
  );
  assert.doesNotMatch(
    result.stdout,
    /yss-spec-cli-template-sync-slice-02-safety-controls\.md/,
  );
  assert.doesNotMatch(
    result.stdout,
    /yss-spec-cli-template-sync-slice-03-delivery-verification\.md/,
  );
});

test("sync skips locally modified managed files and reports removed managed files", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "sync-protected-project");

  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Protected Sync Project",
      "--business-domain",
      "Governance",
      "--target-dir",
      targetDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(initResult.status, 0, initResult.stderr);

  const metadataPath = path.join(targetDir, metadataFileName);
  const readmePath = path.join(targetDir, "README.md");
  const restoredPath = path.join(targetDir, "docs/templates/spec-delta-template.md");
  const removedPath = path.join(targetDir, "docs/legacy-note.md");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const localReadme = `${fs.readFileSync(readmePath, "utf8")}\n本地说明：不要覆盖\n`;

  fs.writeFileSync(readmePath, localReadme, "utf8");
  fs.rmSync(restoredPath, { force: true });
  fs.writeFileSync(removedPath, "legacy note", "utf8");

  metadata.templateVersion = "0.9.0";
  delete metadata.managedFiles["docs/templates/spec-delta-template.md"];
  metadata.managedFiles["docs/legacy-note.md"] = {
    type: "copy",
    contentHash: sha256("legacy note"),
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /跳过文件：1/);
  assert.match(result.stdout, /删除差异：1/);
  assert.match(result.stdout, /README\.md/);
  assert.match(result.stdout, /docs\/legacy-note\.md/);
  assert.match(result.stdout, /git diff|git status/);
  assert.equal(fs.readFileSync(readmePath, "utf8"), localReadme);
  assert.ok(fs.existsSync(restoredPath));
  assert.ok(fs.existsSync(removedPath));
});
