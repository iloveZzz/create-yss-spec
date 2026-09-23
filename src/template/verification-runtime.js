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

function verifyGeneratedInstance(targetDir, { checkForbiddenPaths = false, checkReadme = false } = {}) {
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
  const readmeContent = checkReadme
    ? fs.readFileSync(targetPath(targetDir, "README.md"), "utf8")
    : "";
  if (agentsContent.includes("[填写]") || readmeContent.includes("[填写]")) {
    throw new Error("初始化结果仍包含模板占位信息");
  }
}

function verifyGeneratedInit(targetDir) {
  verifyGeneratedInstance(targetDir, { checkForbiddenPaths: true, checkReadme: true });
  runTemplateVerification(targetDir, "scripts/verify-project-instance", []);
}

function verifyGeneratedAttach(targetDir) {
  verifyGeneratedInstance(targetDir);
  runTemplateVerification(targetDir, "scripts/verify-project-instance", []);
}

function readProjectSkillLock(targetDir) {
  const lockPath = targetPath(targetDir, "skills-lock.json");
  if (pathKind(lockPath) === "missing") return null;
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (
    lock.version !== 3 || !isRecord(lock.skills?.shared) ||
    !isRecord(lock.skills?.platform) || !isRecord(lock.sources) ||
    !Array.isArray(lock.projectionRoots)
  ) {
    throw new Error("现有 skills-lock.json 结构非法，无法安全保留项目技能登记");
  }
  return lock;
}

function preserveProjectSkillRegistrations(targetDir, previousLock, previousManagedFiles, transaction) {
  if (!previousLock) return;
  const lockPath = targetPath(targetDir, "skills-lock.json");
  const generated = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const managedPaths = Object.keys(previousManagedFiles || {});
  const wasManaged = (skillPath) => managedPaths.some((ref) => ref.startsWith(`${skillPath}/`));
  let changed = false;

  for (const [name, record] of Object.entries(previousLock.skills.shared)) {
    const skillPath = `.agents/skills/${name}`;
    if (generated.skills.shared[name] || wasManaged(skillPath)) continue;
    if (pathKind(targetPath(targetDir, skillPath)) !== "directory") continue;
    generated.skills.shared[name] = record;
    changed = true;
  }
  for (const [root, entries] of Object.entries(previousLock.skills.platform || {})) {
    if (!generated.projectionRoots.includes(root)) continue;
    for (const [name, record] of Object.entries(entries)) {
      const skillPath = `${root}/${name}`;
      if (generated.skills.platform?.[root]?.[name] || wasManaged(skillPath)) continue;
      if (pathKind(targetPath(targetDir, skillPath)) !== "directory") continue;
      generated.skills.platform ||= {};
      generated.skills.platform[root] ||= {};
      generated.skills.platform[root][name] = record;
      changed = true;
    }
  }
  if (changed) {
    generated.sources = { ...previousLock.sources, ...generated.sources };
    transaction.writeFile(lockPath, `${JSON.stringify(generated, null, 2)}\n`);
  }
}

function refreshGeneratedProjectInstance(targetDir, options = {}) {
  preserveProjectSkillRegistrations(
    targetDir,
    options.previousSkillLock,
    options.previousManagedFiles,
    options.transaction,
  );
  runTemplateVerification(targetDir, "scripts/update-skill-lock", []);
}

module.exports = {
  verificationEnvironment,
  initializeGitRepository,
  runTemplateVerification,
  runTemplateVerificationWithGit,
  verifyGeneratedInstance,
  verifyGeneratedInit,
  verifyGeneratedAttach,
  readProjectSkillLock,
  refreshGeneratedProjectInstance,
  verifyGeneratedProjectInstance: verifyGeneratedAttach,
};
