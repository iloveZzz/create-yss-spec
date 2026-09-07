"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { targetPath, pathKind } = require("../filesystem/path-utils");
const {
  TEMPLATE_MANIFEST,
  readTargetIdentity,
} = require("./instance-runtime");

const INSTANCE_FORBIDDEN_PATHS = [
  ".template-source",
  ".github",
  ".cursor/environment.json",
  "wiki",
  "docs/reviews",
];

function verificationEnvironment(environment = process.env) {
  const sanitized = { ...environment };
  for (const key of Object.keys(sanitized)) {
    if (key === "NODE_TEST_CONTEXT" || key.startsWith("NODE_TEST_")) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

function initializeGitRepository(targetDir) {
  const result = spawnSync("git", ["init"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git init 执行失败");
  }
}

function runTemplateVerification(targetDir, scriptPath, args = ["--check"]) {
  const commandPath = targetPath(targetDir, scriptPath);
  const result = spawnSync(commandPath, args, {
    cwd: targetDir,
    encoding: "utf8",
    env: verificationEnvironment(),
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("");
  if (output) {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  if (result.status !== 0) {
    const detail = result.error?.message || output.trim();
    throw new Error(
      `生成项目校验失败：${scriptPath}${detail ? `\n${detail}` : ""}`,
    );
  }
}

function runTemplateVerificationWithGit(targetDir, scriptPath, args = []) {
  const gitPath = targetPath(targetDir, ".git");
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  if (probe.status === 0 && probe.stdout.trim() === "true") {
    runTemplateVerification(targetDir, scriptPath, args);
    return;
  }

  let backupRoot;
  let backupGitPath;
  try {
    try {
      fs.lstatSync(gitPath);
      backupRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "create-yss-spec-git-backup-"),
      );
      backupGitPath = path.join(backupRoot, ".git");
      fs.renameSync(gitPath, backupGitPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    initializeGitRepository(targetDir);
    runTemplateVerification(targetDir, scriptPath, args);
  } finally {
    fs.rmSync(gitPath, { recursive: true, force: true });
    if (backupGitPath) fs.renameSync(backupGitPath, gitPath);
    if (backupRoot) fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

function verifyGeneratedInstance(targetDir, { checkForbiddenPaths = false } = {}) {
  if (checkForbiddenPaths) {
    const forbiddenPaths = [
      ...INSTANCE_FORBIDDEN_PATHS,
      ...(TEMPLATE_MANIFEST.initExcludeRootEntries || []),
      ...(TEMPLATE_MANIFEST.initExcludeRootFiles || []),
      ...(TEMPLATE_MANIFEST.initExcludePaths || []),
    ];
    for (const relativePath of [...new Set(forbiddenPaths)]) {
      if (pathKind(targetPath(targetDir, relativePath)) !== "missing") {
        throw new Error(`初始化结果包含禁止分发的模板源资产：${relativePath}`);
      }
    }
  }

  const identity = readTargetIdentity(targetDir);
  if (
    identity.state !== "valid" ||
    identity.fields.repository_mode !== "project-instance"
  ) {
    throw new Error("初始化结果的 yss-project.yaml 必须是 project-instance");
  }

  const agentsContent = fs.readFileSync(targetPath(targetDir, "AGENTS.md"), "utf8");
  const readmeContent = fs.readFileSync(targetPath(targetDir, "README.md"), "utf8");
  if (agentsContent.includes("[填写]") || readmeContent.includes("[填写]")) {
    throw new Error("初始化结果仍包含模板占位信息");
  }
}

function verifyGeneratedInit(targetDir) {
  verifyGeneratedInstance(targetDir, { checkForbiddenPaths: true });
}

function verifyGeneratedAttach(targetDir) {
  runTemplateVerification(targetDir, "scripts/sync-skills");
  runTemplateVerification(targetDir, "scripts/update-skill-lock");
  runTemplateVerificationWithGit(targetDir, "scripts/verify-template");
}

module.exports = {
  verificationEnvironment,
  initializeGitRepository,
  runTemplateVerification,
  runTemplateVerificationWithGit,
  verifyGeneratedInstance,
  verifyGeneratedInit,
  verifyGeneratedAttach,
};
