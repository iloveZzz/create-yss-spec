"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { targetPath } = require("../filesystem/path-utils");

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

function verifyGeneratedAttach(targetDir) {
  runTemplateVerification(targetDir, "scripts/sync-skills");
  runTemplateVerification(targetDir, "scripts/update-skill-lock");
  runTemplateVerificationWithGit(targetDir, "scripts/verify-template");
}

module.exports = {
  initializeGitRepository,
  runTemplateVerification,
  runTemplateVerificationWithGit,
  verifyGeneratedAttach,
};
