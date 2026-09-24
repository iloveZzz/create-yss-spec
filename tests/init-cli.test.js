const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("./support/spawn-cli");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;
const metadataFileName = ".yss-template.json";

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function contextContractFiles(rootPath) {
  const found = [];
  function visit(currentPath, relative = "") {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(currentPath, entry.name), nextRelative);
      else if (["CONTEXT.md", "CONTEXT-MAP.md", "context.md"].includes(entry.name)) found.push(nextRelative);
    }
  }
  visit(rootPath);
  return found;
}

function snapshotTreeHash(rootPath) {
  const digest = crypto.createHash("sha256");

  function visit(currentPath, relativeDir = "") {
    for (const entry of fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => {
        if (left.name < right.name) {
          return -1;
        }
        if (left.name > right.name) {
          return 1;
        }
        return 0;
      })) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        digest.update(`dir:${relativePath}\0`);
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        digest.update(`file:${relativePath}\0`);
        digest.update(fs.readFileSync(absolutePath));
        digest.update("\0");
      }
    }
  }

  visit(rootPath);
  return digest.digest("hex");
}

test("init generates a slim project with one runtime", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "demo-project");
  try {
    const result = spawnSync(process.execPath, [cliBin, "--project-name", "Demo Project", "--business-domain", "Data Platform", "--target-dir", targetDir], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(fs.readFileSync(path.join(targetDir, metadataFileName), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(targetDir, "skills-lock.json"), "utf8"));
    assert.equal(metadata.metadataSchemaVersion, 3);
    assert.deepEqual(metadata.distribution.runtimes, ["codex"]);
    assert.deepEqual(lock.projectionRoots, [".codex/skills"]);
    assert.equal(Object.keys(lock.skills.shared).length, 3);
    assert.equal(fs.existsSync(path.join(targetDir, ".cursor")), false);
    assert.equal(fs.existsSync(path.join(targetDir, ".pi")), false);
    assert.equal(fs.existsSync(path.join(targetDir, "docs/design/preview.html")), false);
    assert.deepEqual(contextContractFiles(targetDir), ["CONTEXT.md"]);
    const verify = spawnSync(path.join(targetDir, "scripts/verify-project-instance"), [], { cwd: targetDir, encoding: "utf8" });
    assert.equal(verify.status, 0, verify.stderr);
  } finally { fs.rmSync(sandboxDir, { recursive: true, force: true }); }
});

test("sync preserves the init distribution boundary", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "sync-boundary-project");
  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Sync Boundary Project",
      "--business-domain",
      "Operations",
      "--team-size",
      "4",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const syncResult = spawnSync(
    process.execPath,
    [cliBin, "sync", "--target-dir", targetDir],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(syncResult.status, 0, syncResult.stderr);
  for (const excludedInitPath of [
    "wiki",
    ".github",
    "yss-public-skills.json",
    ".cursor/environment.json",
  ]) {
    assert.equal(
      fs.existsSync(path.join(targetDir, excludedInitPath)),
      false,
      `${excludedInitPath} must remain excluded after sync`,
    );
  }
  assert.ok(fs.existsSync(path.join(targetDir, ".gitignore")));
  assert.ok(fs.existsSync(path.join(targetDir, ".nvmrc")));
  assert.ok(fs.existsSync(path.join(targetDir, "scripts/verify-project-instance")));
  assert.equal(fs.existsSync(path.join(targetDir, "scripts/verify-template")), false);
});

test("attach verifies the generated template under an ASCII locale", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "ascii-locale-project");
  fs.mkdirSync(targetDir);

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "ASCII Locale Project",
      "--business-domain",
      "Reporting",
      "--apply",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /接管完成/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /invalid multibyte/);
});

test("init fails closed for unsupported template identity", () => {
  const identityPath = path.join(repoRoot, "template/yss-project.yaml");
  const snapshotPath = path.join(repoRoot, "template.snapshot.json");
  const originalIdentity = fs.readFileSync(identityPath, "utf8");
  const originalSnapshot = fs.readFileSync(snapshotPath, "utf8");
  const invalidIdentities = [
    {
      content: "schema_version: 2\nrepository_mode: template-source\n",
      message: /schema_version.*必须为 1/,
    },
    {
      content: "schema_version: 1\nrepository_mode: unsupported\n",
      message: /repository_mode.*template-source 或 project-instance/,
    },
  ];

  try {
    for (const [index, invalidIdentity] of invalidIdentities.entries()) {
      const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
      const targetDir = path.join(sandboxDir, `invalid-identity-${index}`);
      fs.writeFileSync(identityPath, invalidIdentity.content, "utf8");
      const snapshot = JSON.parse(originalSnapshot);
      snapshot.snapshotHash = snapshotTreeHash(path.join(repoRoot, "template"));
      fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

      const result = spawnSync(
        process.execPath,
        [
          cliBin,
          "--project-name",
          "Invalid Identity Project",
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

      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, invalidIdentity.message);
    }
  } finally {
    fs.writeFileSync(identityPath, originalIdentity, "utf8");
    fs.writeFileSync(snapshotPath, originalSnapshot, "utf8");
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

test("manifest-driven issue tracker option renders output", () => {
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
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const readmeContent = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");

  assert.match(readmeContent, /默认 Issue Tracker：gitlab/);
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
  const managedPath = path.join(targetDir, "docs/plan/templates/plan-template.md");
  const restoredPath = path.join(targetDir, "docs/plan/templates/market-analysis-template.md");
  const originalReadme = fs.readFileSync(readmePath, "utf8");
  const originalManaged = fs.readFileSync(managedPath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  const legacyManaged = `${originalManaged}\nlegacy\n`;
  fs.writeFileSync(managedPath, legacyManaged, "utf8");
  fs.rmSync(restoredPath, { force: true });

  metadata.templateVersion = "0.9.0";
  metadata.managedFiles["docs/plan/templates/plan-template.md"].contentHash = sha256(legacyManaged);
  delete metadata.managedFiles["docs/plan/templates/market-analysis-template.md"];
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
  assert.equal(fs.readFileSync(managedPath, "utf8"), originalManaged);
  assert.ok(fs.existsSync(restoredPath));
  assert.equal(fs.existsSync(path.join(targetDir, ".template-source")), false);
  assert.equal(fs.existsSync(path.join(targetDir, "docs/reviews")), false);

  const syncedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.equal(syncedMetadata.templateVersion, packageVersion);
  assert.equal(syncedMetadata.managedFiles["README.md"], undefined);
  assert.ok(
    syncedMetadata.managedFiles["docs/plan/templates/market-analysis-template.md"],
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
  const managedPath = path.join(targetDir, "docs/plan/templates/plan-template.md");
  const restoredPath = path.join(targetDir, "docs/plan/templates/market-analysis-template.md");
  const originalReadme = fs.readFileSync(readmePath, "utf8");
  const originalManaged = fs.readFileSync(managedPath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const legacyManaged = `${originalManaged}\nlegacy\n`;

  fs.writeFileSync(managedPath, legacyManaged, "utf8");
  fs.rmSync(restoredPath, { force: true });

  metadata.templateVersion = "0.8.0";
  metadata.managedFiles["docs/plan/templates/plan-template.md"].contentHash = sha256(legacyManaged);
  delete metadata.managedFiles["docs/plan/templates/market-analysis-template.md"];
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
  assert.match(result.stdout, /update: docs\/plan\/templates\/plan-template\.md/);
  assert.match(result.stdout, /add: docs\/plan\/templates\/market-analysis-template\.md/);
  assert.equal(fs.readFileSync(readmePath, "utf8"), originalReadme);
  assert.equal(fs.readFileSync(managedPath, "utf8"), legacyManaged);
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
  for (const excludedInitPath of [
    "wiki/",
    ".github/",
    "yss-public-skills.json",
  ]) {
    assert.doesNotMatch(
      result.stdout,
      new RegExp(`add: ${excludedInitPath.replaceAll(".", "\\.")}`),
    );
  }
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
  const customizablePath = path.join(targetDir, "AGENTS.md");
  const restoredPath = path.join(targetDir, "docs/plan/templates/market-analysis-template.md");
  const removedPath = path.join(targetDir, "docs/legacy-note.md");
  const removedTemplateSourcePath = path.join(
    targetDir,
    ".template-source/legacy-review.md",
  );
  const removedReviewsPath = path.join(
    targetDir,
    "docs/reviews/legacy-review.md",
  );
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const localReadme = `${fs.readFileSync(readmePath, "utf8")}\n本地说明：不要覆盖\n`;
  fs.writeFileSync(customizablePath, "local agent instructions\n", "utf8");

  fs.writeFileSync(readmePath, localReadme, "utf8");
  fs.rmSync(restoredPath, { force: true });
  fs.writeFileSync(removedPath, "legacy note", "utf8");
  fs.mkdirSync(path.dirname(removedTemplateSourcePath), { recursive: true });
  fs.writeFileSync(removedTemplateSourcePath, "legacy template-source review", "utf8");
  fs.mkdirSync(path.dirname(removedReviewsPath), { recursive: true });
  fs.writeFileSync(removedReviewsPath, "legacy docs review", "utf8");

  metadata.templateVersion = "0.9.0";
  delete metadata.managedFiles["docs/plan/templates/market-analysis-template.md"];
  metadata.managedFiles["docs/legacy-note.md"] = {
    type: "copy",
    contentHash: sha256("legacy note"),
  };
  metadata.managedFiles[".template-source/legacy-review.md"] = {
    type: "copy",
    contentHash: sha256("legacy template-source review"),
  };
  metadata.managedFiles["docs/reviews/legacy-review.md"] = {
    type: "copy",
    contentHash: sha256("legacy docs review"),
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const result = spawnSync(process.execPath, [cliBin, "sync"], {
    cwd: targetDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /跳过文件：1/);
  assert.match(result.stdout, /删除差异：3/);
  assert.match(result.stdout, /AGENTS\.md/);
  assert.match(result.stdout, /docs\/legacy-note\.md/);
  assert.match(result.stdout, /\.template-source\/legacy-review\.md/);
  assert.match(result.stdout, /docs\/reviews\/legacy-review\.md/);
  assert.match(result.stdout, /git diff|git status/);
  assert.equal(fs.readFileSync(readmePath, "utf8"), localReadme);
  assert.ok(fs.existsSync(restoredPath));
  assert.ok(fs.existsSync(removedPath));
  assert.ok(fs.existsSync(removedTemplateSourcePath));
  assert.ok(fs.existsSync(removedReviewsPath));

  const syncedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.ok(syncedMetadata.managedFiles["docs/legacy-note.md"]);
  assert.ok(syncedMetadata.managedFiles[".template-source/legacy-review.md"]);
  assert.ok(syncedMetadata.managedFiles["docs/reviews/legacy-review.md"]);
});

test("attach dry-run previews an arbitrary existing project without writing or deleting .git", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "existing-application");
  const runtimeFile = path.join(targetDir, "src/app.js");

  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.mkdirSync(path.join(targetDir, ".git"));
  fs.writeFileSync(runtimeFile, "console.log('keep');\n", "utf8");
  const beforeRuntime = fs.readFileSync(runtimeFile, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Existing Application",
      "--business-domain",
      "Payments",
      "--dry-run",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /attach dry-run/i);
  assert.equal(fs.existsSync(path.join(targetDir, metadataFileName)), false);
  assert.equal(fs.existsSync(path.join(targetDir, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".git")), true);
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), beforeRuntime);
});

test("attach applies management assets while preserving runtime files and .git", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "attached-application");
  const runtimeFile = path.join(targetDir, "packages/api/index.js");

  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.mkdirSync(path.join(targetDir, ".git"));
  fs.writeFileSync(runtimeFile, "module.exports = 'runtime';\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Attached Application",
      "--business-domain",
      "Operations",
      "--apply",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /接管完成/);
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), "module.exports = 'runtime';\n");
  assert.equal(fs.existsSync(path.join(targetDir, ".git")), true);
  assert.equal(fs.existsSync(path.join(targetDir, "scripts/verify-project-instance")), true);
  assert.equal(fs.existsSync(path.join(targetDir, ".codex/skills/yss-product-lifecycle/SKILL.md")), true);
  for (const retiredRoot of [".claude", ".qoder", ".trae"]) {
    assert.equal(fs.existsSync(path.join(targetDir, retiredRoot)), false);
  }
  assert.equal(fs.existsSync(path.join(targetDir, ".template-source")), false);
  assert.equal(fs.existsSync(path.join(targetDir, "docs/reviews")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".github")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".cursor/environment.json")), false);
  assert.equal(fs.existsSync(path.join(targetDir, "yss-public-skills.json")), false);
  assert.equal(fs.existsSync(path.join(targetDir, "scripts/verify-skill-governance")), false);
  assert.equal(fs.existsSync(path.join(targetDir, ".cursorrules")), false);
  assert.equal(
    fs.existsSync(path.join(targetDir, ".agents/skills/ytable-usage/SKILL.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(targetDir, ".agents/skills/high-fidelity-html-prototype")),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(targetDir, "docs/.scratch/code-review-candidates"),
    ),
    false,
  );

  const identity = fs.readFileSync(path.join(targetDir, "yss-project.yaml"), "utf8");
  assert.match(identity, /^repository_mode:\s*project-instance$/m);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(targetDir, metadataFileName), "utf8"),
  );
  assert.equal(metadata.metadataSchemaVersion, 3);
  assert.equal(metadata.cliVersion, packageVersion);
  assert.match(metadata.templateCommit, /^[0-9a-f]{40}$/);
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "template.snapshot.json"), "utf8"),
  );
  assert.equal(metadata.templateSourceState, snapshot.sourceState);
  assert.match(metadata.snapshotHash, /^[0-9a-f]{64}$/);
});

test("attach preserves an existing project README without requiring force", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "conflicting-application");
  const readmePath = path.join(targetDir, "README.md");

  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, ".git"));
  fs.writeFileSync(readmePath, "local README\n", "utf8");

  const blockedResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Conflict Application",
      "--business-domain",
      "Operations",
      "--apply",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(blockedResult.status, 0, blockedResult.stderr);
  assert.equal(fs.readFileSync(readmePath, "utf8"), "local README\n");
  assert.equal(fs.existsSync(path.join(targetDir, metadataFileName)), true);

  const metadata = JSON.parse(fs.readFileSync(path.join(targetDir, metadataFileName), "utf8"));
  assert.equal(metadata.managedFiles["README.md"], undefined);
  assert.equal(fs.existsSync(path.join(targetDir, ".git")), true);
});

test("attach rejects an existing metadata file and directs the user to sync", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "already-managed-project");
  const metadataPath = path.join(targetDir, metadataFileName);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(metadataPath, "{}\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Already Managed",
      "--business-domain",
      "Operations",
      "--dry-run",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /已有模板元数据|使用 sync/);
  assert.equal(fs.readFileSync(metadataPath, "utf8"), "{}\n");
});

test("attach blocks flat legacy tickets as unsafe even with force", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unsafe-legacy-project");
  const legacyTicket = path.join(targetDir, "docs/requirements/tickets/legacy.md");

  fs.mkdirSync(path.dirname(legacyTicket), { recursive: true });
  fs.writeFileSync(legacyTicket, "# Legacy ticket\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Unsafe Legacy",
      "--business-domain",
      "Operations",
      "--apply",
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /unsafe/);
  assert.equal(fs.existsSync(path.join(targetDir, metadataFileName)), false);
  assert.equal(fs.readFileSync(legacyTicket, "utf8"), "# Legacy ticket\n");
});

test("attach migrates a known legacy template path before writing metadata", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "legacy-template-project");
  const oldTemplate = path.join(targetDir, "docs/templates/prd-template.md");

  fs.mkdirSync(path.dirname(oldTemplate), { recursive: true });
  fs.writeFileSync(oldTemplate, "# Legacy PRD template\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Legacy Template",
      "--business-domain",
      "Operations",
      "--apply",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(oldTemplate), false);
  assert.ok(fs.existsSync(path.join(targetDir, "docs/templates/spec-template.md")));
  assert.ok(fs.existsSync(path.join(targetDir, metadataFileName)));
});

test("attach migrates the legacy issues directory into tickets", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "legacy-issues-project");
  const oldTicket = path.join(targetDir, "docs/requirements/issues/legacy.md");
  const newTicket = path.join(targetDir, "docs/requirements/tickets/legacy.md");

  fs.mkdirSync(path.dirname(oldTicket), { recursive: true });
  fs.writeFileSync(oldTicket, "# Legacy ticket\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Legacy Issues",
      "--business-domain",
      "Operations",
      "--apply",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(oldTicket), false);
  assert.equal(fs.readFileSync(newTicket, "utf8"), "# Legacy ticket\n");
  assert.equal(fs.existsSync(path.join(targetDir, "docs/requirements/issues")), false);
  assert.ok(fs.existsSync(path.join(targetDir, metadataFileName)));
});

test("attach blocks a conflicting legacy issues migration before writing", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "conflicting-legacy-issues-project");
  const oldTicket = path.join(targetDir, "docs/requirements/issues/legacy.md");
  const newTicket = path.join(targetDir, "docs/requirements/tickets/legacy.md");

  fs.mkdirSync(path.dirname(oldTicket), { recursive: true });
  fs.mkdirSync(path.dirname(newTicket), { recursive: true });
  fs.writeFileSync(oldTicket, "# Legacy ticket\n", "utf8");
  fs.writeFileSync(newTicket, "# Local ticket\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Conflicting Legacy Issues",
      "--business-domain",
      "Operations",
      "--apply",
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /conflict|冲突/i);
  assert.equal(fs.readFileSync(oldTicket, "utf8"), "# Legacy ticket\n");
  assert.equal(fs.readFileSync(newTicket, "utf8"), "# Local ticket\n");
  assert.equal(fs.existsSync(path.join(targetDir, metadataFileName)), false);
});

test("sync force preserves project-owned README", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "force-sync-project");
  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Force Sync",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const readmePath = path.join(targetDir, "README.md");
  fs.writeFileSync(readmePath, "local README\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [cliBin, "sync", "--target-dir", targetDir, "--force"],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(readmePath, "utf8"), "local README\n");
  const metadata = JSON.parse(fs.readFileSync(path.join(targetDir, metadataFileName), "utf8"));
  assert.equal(metadata.managedFiles["README.md"], undefined);
});

test("sync force preserves flat tickets without treating them as legacy migrations", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "flat-ticket-sync-project");
  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Flat Ticket Sync",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const ticketPath = path.join(targetDir, "docs/requirements/tickets/ticket-ds-001.md");
  fs.mkdirSync(path.dirname(ticketPath), { recursive: true });
  fs.writeFileSync(ticketPath, "# Data standard ticket\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [cliBin, "sync", "--target-dir", targetDir, "--force"],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /unsafe|Ticket \u5f52\u5c5e/);
  assert.equal(fs.readFileSync(ticketPath, "utf8"), "# Data standard ticket\n");
});

test("sync force does not overwrite a non-baseline managed file", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "unmanaged-sync-project");
  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Unmanaged Sync",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const managedPath = path.join(targetDir, "docs/plan/templates/plan-template.md");
  const metadataPath = path.join(targetDir, metadataFileName);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  fs.writeFileSync(managedPath, "local unmanaged template\n", "utf8");
  delete metadata.managedFiles["docs/plan/templates/plan-template.md"];
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const result = spawnSync(
    process.execPath,
    [cliBin, "sync", "--target-dir", targetDir, "--force"],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docs\/plan\/templates\/plan-template\.md/);
  assert.equal(fs.readFileSync(managedPath, "utf8"), "local unmanaged template\n");
  const backupPath = result.stdout.match(/备份目录：([^\n]+)/)?.[1]?.trim();
  assert.ok(backupPath);
  assert.equal(fs.existsSync(path.join(backupPath, "docs/plan/templates/plan-template.md")), false);
});

test("sync converts a valid template-source identity to project-instance", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "template-source-project");
  const initResult = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Template Source Project",
      "--business-domain",
      "Operations",
      "--target-dir",
      targetDir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(initResult.status, 0, initResult.stderr);

  const identityPath = path.join(targetDir, "yss-project.yaml");
  const metadataPath = path.join(targetDir, metadataFileName);
  const templateSourceIdentity = "schema_version: 1\nrepository_mode: template-source\n";
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  fs.writeFileSync(identityPath, templateSourceIdentity, "utf8");
  metadata.managedFiles["yss-project.yaml"].contentHash = sha256(templateSourceIdentity);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const result = spawnSync(
    process.execPath,
    [cliBin, "sync", "--target-dir", targetDir],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    fs.readFileSync(identityPath, "utf8"),
    /^repository_mode:\s*project-instance$/m,
  );
  const syncedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.equal(
    syncedMetadata.managedFiles["yss-project.yaml"].contentHash,
    sha256(fs.readFileSync(identityPath)),
  );
});

test("attach blocks intermediate symlinks before writing outside the project", () => {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-"));
  const targetDir = path.join(sandboxDir, "symlinked-project");
  const externalDir = path.join(sandboxDir, "external-management");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(externalDir, { recursive: true });
  fs.symlinkSync(externalDir, path.join(targetDir, "docs"), "dir");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      targetDir,
      "--project-name",
      "Symlinked Project",
      "--business-domain",
      "Operations",
      "--apply",
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /符号链接|安全写入|越界/);
  assert.equal(fs.existsSync(path.join(externalDir, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(externalDir, "templates")), false);
  assert.equal(fs.existsSync(path.join(targetDir, metadataFileName)), false);
  assert.equal(fs.lstatSync(path.join(targetDir, "docs")).isSymbolicLink(), true);
});

function runGit(cwd, args, extraEnv = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function createGitlinkFixture() {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-gitlink-"));
  const superRoot = path.join(sandboxDir, "harness");
  const subRoot = path.join(sandboxDir, "backend");
  const mountRelative = "apps/backend/demo";

  fs.mkdirSync(subRoot, { recursive: true });
  runGit(subRoot, ["init", "--initial-branch", "main"]);
  runGit(subRoot, ["config", "user.email", "test@example.com"]);
  runGit(subRoot, ["config", "user.name", "YSS Test"]);
  fs.writeFileSync(path.join(subRoot, "README.md"), "backend\n", "utf8");
  runGit(subRoot, ["add", "."]);
  runGit(subRoot, ["commit", "-m", "backend"]);
  const sha = runGit(subRoot, ["rev-parse", "HEAD"]).stdout.trim();

  fs.mkdirSync(superRoot, { recursive: true });
  runGit(superRoot, ["init", "--initial-branch", "main"]);
  runGit(superRoot, ["config", "user.email", "test@example.com"]);
  runGit(superRoot, ["config", "user.name", "YSS Test"]);
  runGit(superRoot, ["config", "protocol.file.allow", "always"]);
  fs.mkdirSync(path.join(superRoot, mountRelative), { recursive: true });
  fs.writeFileSync(
    path.join(superRoot, ".gitmodules"),
    `[submodule "${mountRelative}"]\n\tpath = ${mountRelative}\n\turl = ${subRoot}\n`,
    "utf8",
  );
  runGit(superRoot, [
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${sha},${mountRelative}`,
  ]);
  runGit(superRoot, ["add", ".gitmodules"]);
  runGit(superRoot, ["commit", "-m", "add empty gitlink"]);

  return {
    superRoot,
    subRoot,
    mountRelative,
    mount: path.join(superRoot, mountRelative),
    gitmodules: path.join(superRoot, ".gitmodules"),
  };
}

function checkoutGitlinkWorktree(superRoot, subRoot, mountRelative) {
  const mount = path.join(superRoot, mountRelative);
  const gitDir = path.join(superRoot, ".git/modules", mountRelative);
  fs.rmSync(mount, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(mount), { recursive: true });
  fs.mkdirSync(path.dirname(gitDir), { recursive: true });
  runGit(
    superRoot,
    [
      "-c",
      "protocol.file.allow=always",
      "clone",
      `--separate-git-dir=${gitDir}`,
      subRoot,
      mount,
    ],
    {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "protocol.file.allow",
      GIT_CONFIG_VALUE_0: "always",
    },
  );
  return mount;
}

test("init fails closed on an empty gitlink even with --force", () => {
  const { superRoot, mount, gitmodules } = createGitlinkFixture();
  const gitmodulesBefore = fs.readFileSync(gitmodules, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Gitlink Project",
      "--business-domain",
      "Operations",
      "--target-dir",
      mount,
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /gitlink|git-submodule|--force/);
  assert.equal(fs.existsSync(path.join(mount, metadataFileName)), false);
  assert.equal(fs.existsSync(path.join(mount, "AGENTS.md")), false);
  assert.equal(fs.readFileSync(gitmodules, "utf8"), gitmodulesBefore);
  assert.equal(fs.existsSync(path.join(superRoot, metadataFileName)), false);
});

test("attach fails closed on an empty gitlink even with --force", () => {
  const { mount, gitmodules } = createGitlinkFixture();
  const gitmodulesBefore = fs.readFileSync(gitmodules, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      mount,
      "--project-name",
      "Gitlink Attach",
      "--business-domain",
      "Operations",
      "--apply",
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /gitlink|git-submodule|--force/);
  assert.equal(fs.existsSync(path.join(mount, metadataFileName)), false);
  assert.equal(fs.readFileSync(gitmodules, "utf8"), gitmodulesBefore);
});

test("init fails closed on a detached HEAD gitlink worktree", () => {
  const { superRoot, subRoot, mountRelative } = createGitlinkFixture();
  const mount = checkoutGitlinkWorktree(superRoot, subRoot, mountRelative);
  runGit(mount, ["checkout", "--detach", "HEAD"]);

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--project-name",
      "Detached Gitlink",
      "--business-domain",
      "Operations",
      "--target-dir",
      mount,
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /detached HEAD|gitlink|git-submodule/);
  assert.equal(fs.existsSync(path.join(mount, metadataFileName)), false);
});

test("attach on a harness with gitlink does not rewrite .gitmodules or the mount", () => {
  const { superRoot, mount, gitmodules } = createGitlinkFixture();
  const gitmodulesBefore = fs.readFileSync(gitmodules, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "attach",
      "--target-dir",
      superRoot,
      "--project-name",
      "Harness With Gitlink",
      "--business-domain",
      "Operations",
      "--apply",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(gitmodules, "utf8"), gitmodulesBefore);
  assert.equal(fs.existsSync(path.join(mount, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(superRoot, metadataFileName)), true);
  assert.equal(fs.existsSync(path.join(superRoot, ".github")), false);
});

function runCli(args) {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function assertHelpOutput(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`create-yss-spec ${packageVersion}`));
  assert.match(result.stdout, /^USAGE$/m);
  assert.match(result.stdout, /^COMMANDS$/m);
  assert.match(result.stdout, /^OPTIONS$/m);
  assert.match(result.stdout, /^EXAMPLES$/m);
  assert.match(result.stdout, /^LEARN MORE$/m);
  assert.match(result.stdout, /--project-name <name>/);
  assert.match(result.stdout, /--business-domain <domain>/);
  assert.match(result.stdout, /--target-dir <dir>/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--apply/);
  assert.match(result.stdout, /attach/);
  assert.match(result.stdout, /sync/);
  assert.match(result.stdout, /^ {2}update /m);
  assert.match(result.stdout, /^ {2}upgrade /m);
  assert.match(result.stdout, /https:\/\/github\.com\/iloveZzz\/create-yss-spec/);
}

test("help flags print usage, commands, options, examples, and learn more", () => {
  for (const flag of ["--help", "-h", "-help"]) {
    assertHelpOutput(runCli([flag]));
  }
});

test("attach, sync, and update help flags print the same usage without requiring a target", () => {
  assertHelpOutput(runCli(["attach", "--help"]));
  assertHelpOutput(runCli(["sync", "-h"]));
  assertHelpOutput(runCli(["update", "--help"]));
  assertHelpOutput(runCli(["upgrade", "-h"]));
});

test("version flags print the package version and exit", () => {
  for (const flag of ["--version", "-v", "-version"]) {
    const result = runCli([flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `create-yss-spec ${packageVersion}`);
  }
});

test("subcommand version flags print the package version without requiring a target", () => {
  const result = runCli(["attach", "--version"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `create-yss-spec ${packageVersion}`);
});

test("unknown arguments still fail closed", () => {
  const result = runCli(["--unknown-flag"]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /不支持的参数：--unknown-flag/);
});
