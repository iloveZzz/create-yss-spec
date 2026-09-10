"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  extractManagedGitignoreBlock,
  mergeManagedGitignoreBlock,
} = require("../src/template/gitignore-section");
const { classifyRemovedFiles } = require("../src/template/prune-planner");
const cli = path.resolve(__dirname, "../bin/create-yss-spec.js");

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

function init(targetDir) {
  const result = run([
    "--project-name", "Boundary Test", "--business-domain", "Governance",
    "--target-dir", targetDir, "--no-example-docs",
  ], __dirname);
  assert.equal(result.status, 0, result.stderr);
}

const BLOCK = [
  "# >>> create-yss-spec managed rules",
  "node_modules/",
  "# <<< create-yss-spec managed rules",
  "",
].join("\n");

test("gitignore managed block preserves project-owned bytes", () => {
  assert.equal(extractManagedGitignoreBlock(BLOCK), BLOCK);
  assert.equal(
    mergeManagedGitignoreBlock("custom/\n", BLOCK),
    `custom/\n\n${BLOCK}`,
  );
  assert.equal(
    mergeManagedGitignoreBlock(`custom/\n\n${BLOCK}`, BLOCK.replace("node_modules/", "dist/")),
    `custom/\n\n${BLOCK.replace("node_modules/", "dist/")}`,
  );
  assert.throws(
    () => mergeManagedGitignoreBlock("# >>> create-yss-spec managed rules\n", BLOCK),
    /标记无效/,
  );
});

test("prune only accepts unchanged template-managed files", () => {
  const result = classifyRemovedFiles({
    removed: ["clean", "changed", "owned", "missing"],
    managedFiles: {
      clean: { contentHash: "same", ownership: "managed" },
      changed: { contentHash: "old", ownership: "managed" },
      owned: { contentHash: "same", ownership: "user-owned" },
      missing: { contentHash: "same", ownership: "managed" },
    },
    getPathKind: (path) => (path === "missing" ? "missing" : "file"),
    getFileHash: (path) => (path === "changed" ? "new" : "same"),
  });
  assert.deepEqual(result.prunable, ["clean"]);
  assert.deepEqual(result.retainedRemoved.map((item) => item.path), ["changed", "owned"]);
  assert.deepEqual(result.alreadyMissing, ["missing"]);
});

test("prune rechecks current ownership and unmanaged path safety", () => {
  const result = classifyRemovedFiles({
    removed: ["retired-user-owned", "retired-gitlink", "retired-managed"],
    managedFiles: Object.fromEntries(
      ["retired-user-owned", "retired-gitlink", "retired-managed"].map((name) => [
        name,
        { contentHash: "same", ownership: "managed" },
      ]),
    ),
    getPathKind: () => "file",
    getFileHash: () => "same",
    getCurrentOwnership: (relativePath) =>
      relativePath === "retired-user-owned" ? "user-owned" : "managed",
    getUnmanagedReason: (relativePath) =>
      relativePath === "retired-gitlink" ? "gitlink / apps 挂载工作树是用户资产" : null,
  });
  assert.deepEqual(result.prunable, ["retired-managed"]);
  assert.deepEqual(result.retainedRemoved, [
    { path: "retired-user-owned", reason: "文件不属于模板所有权" },
    { path: "retired-gitlink", reason: "gitlink / apps 挂载工作树是用户资产" },
  ]);
});

test("README stays project-owned and gitignore only updates its managed block", () => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yss-boundary-")), "project");
  init(target);
  const readme = path.join(target, "README.md");
  const gitignore = path.join(target, ".gitignore");
  fs.writeFileSync(readme, "project README\n");
  fs.appendFileSync(gitignore, "\nproject-cache/\n");
  const result = run(["sync", "--target-dir", target, "--force"], __dirname);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(readme, "utf8"), "project README\n");
  assert.match(fs.readFileSync(gitignore, "utf8"), /project-cache\//);
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, ".yss-template.json"))).managedFiles["README.md"], undefined);
});

test("attach never creates a missing README", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "yss-attach-boundary-"));
  fs.writeFileSync(path.join(target, ".gitignore"), "project-only/\n");
  const result = run([
    "attach", "--target-dir", target, "--project-name", "Attached",
    "--business-domain", "Governance", "--apply",
  ], __dirname);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(target, "README.md")), false);
  const gitignore = fs.readFileSync(path.join(target, ".gitignore"), "utf8");
  assert.match(gitignore, /^project-only\//);
  assert.match(gitignore, /create-yss-spec managed rules/);
});

test("sync converts an unchanged legacy gitignore but retains a modified one", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "yss-legacy-gitignore-"));
  const cleanTarget = path.join(parent, "clean");
  init(cleanTarget);
  const cleanGitignore = path.join(cleanTarget, ".gitignore");
  const cleanMetadataPath = path.join(cleanTarget, ".yss-template.json");
  const legacyContent = "node_modules/\n";
  fs.writeFileSync(cleanGitignore, legacyContent);
  const cleanMetadata = JSON.parse(fs.readFileSync(cleanMetadataPath));
  cleanMetadata.managedFiles[".gitignore"].contentHash = crypto
    .createHash("sha256")
    .update(legacyContent)
    .digest("hex");
  fs.writeFileSync(cleanMetadataPath, `${JSON.stringify(cleanMetadata, null, 2)}\n`);

  const converted = run(["sync", "--target-dir", cleanTarget], __dirname);
  assert.equal(converted.status, 0, converted.stderr);
  const convertedContent = fs.readFileSync(cleanGitignore, "utf8");
  assert.match(convertedContent, /^# >>> create-yss-spec managed rules/);
  assert.equal((convertedContent.match(/node_modules\//g) || []).length, 1);
  const backup = converted.stdout.match(/备份目录：([^\n]+)/)?.[1]?.trim();
  assert.equal(fs.readFileSync(path.join(backup, ".gitignore"), "utf8"), legacyContent);

  const modifiedTarget = path.join(parent, "modified");
  init(modifiedTarget);
  const modifiedGitignore = path.join(modifiedTarget, ".gitignore");
  const modifiedMetadataPath = path.join(modifiedTarget, ".yss-template.json");
  const oldBaseline = "node_modules/\n";
  const locallyModified = `${oldBaseline}project-owned/\n`;
  fs.writeFileSync(modifiedGitignore, locallyModified);
  const modifiedMetadata = JSON.parse(fs.readFileSync(modifiedMetadataPath));
  modifiedMetadata.managedFiles[".gitignore"].contentHash = crypto
    .createHash("sha256")
    .update(oldBaseline)
    .digest("hex");
  fs.writeFileSync(modifiedMetadataPath, `${JSON.stringify(modifiedMetadata, null, 2)}\n`);

  const retained = run(["sync", "--target-dir", modifiedTarget, "--force"], __dirname);
  assert.equal(retained.status, 0, retained.stderr);
  assert.match(retained.stdout, /本地已修改，已跳过/);
  assert.equal(fs.readFileSync(modifiedGitignore, "utf8"), locallyModified);
});

test("sync --prune backs up and removes only an unchanged retired file", () => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yss-prune-")), "project");
  init(target);
  const retired = path.join(target, "scripts/retired-template-tool");
  fs.writeFileSync(retired, "retired\n");
  const metadataPath = path.join(target, ".yss-template.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath));
  metadata.managedFiles["scripts/retired-template-tool"] = {
    type: "copy",
    contentHash: crypto.createHash("sha256").update("retired\n").digest("hex"),
    ownership: "managed",
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const report = run(["sync", "--target-dir", target], __dirname);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(fs.existsSync(retired), true);
  assert.ok(JSON.parse(fs.readFileSync(metadataPath)).managedFiles["scripts/retired-template-tool"]);

  const preview = run(["sync", "--target-dir", target, "--json", "--prune"], __dirname);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).prunable, ["scripts/retired-template-tool"]);

  const pruned = run(["sync", "--target-dir", target, "--prune"], __dirname);
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.equal(fs.existsSync(retired), false);
  const backup = pruned.stdout.match(/备份目录：([^\n]+)/)?.[1]?.trim();
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(backup, "scripts/retired-template-tool"), "utf8"), "retired\n");
  assert.equal(JSON.parse(fs.readFileSync(metadataPath)).managedFiles["scripts/retired-template-tool"], undefined);
});

test("failed sync rolls back gitignore and metadata", () => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "yss-rollback-")), "project");
  init(target);
  const gitignorePath = path.join(target, ".gitignore");
  const metadataPath = path.join(target, ".yss-template.json");
  const verifierPath = path.join(target, "scripts/verify-project-instance");
  const driftedGitignore = fs.readFileSync(gitignorePath, "utf8")
    .replace("node_modules/", "old-node-modules/")
    .concat("\nproject-owned/\n");
  fs.writeFileSync(gitignorePath, driftedGitignore);
  fs.writeFileSync(verifierPath, "#!/bin/sh\nexit 1\n");
  const metadataBefore = fs.readFileSync(metadataPath, "utf8");

  const result = run(["sync", "--target-dir", target], __dirname);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /已回滚本次 sync/);
  assert.equal(fs.readFileSync(gitignorePath, "utf8"), driftedGitignore);
  assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBefore);
});
