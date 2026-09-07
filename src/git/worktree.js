"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isGitSubmoduleMount, posixRelative } = require("./submodule");

function collectGitRoots(start) {
  const roots = [];
  if (!start) return roots;
  let current = path.resolve(start);
  while (true) {
    const gitPath = path.join(current, ".git");
    let validGitEntry = false;
    try {
      const gitStat = fs.lstatSync(gitPath);
      validGitEntry = gitStat.isDirectory() ? fs.readdirSync(gitPath).length > 0 : gitStat.isFile();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (validGitEntry || fs.existsSync(path.join(current, ".gitmodules"))) roots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

function gitShowSuperproject(cwd, spawn = spawnSync) {
  const result = spawn("git", ["-C", cwd, "rev-parse", "--show-superproject-working-tree"], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? (result.stdout || "").trim() : "";
}

function gitAbbrevRef(cwd, spawn = spawnSync) {
  const result = spawn("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function isEmptyDir(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    return fs.readdirSync(dir).filter((name) => name !== "." && name !== "..").length === 0;
  } catch {
    return false;
  }
}

function inspectCheckoutState(repoRoot, targetPathValue, deps = {}) {
  const resolved = path.resolve(targetPathValue);
  const relative = posixRelative(path.resolve(repoRoot), resolved);
  const isMount = isGitSubmoduleMount(repoRoot, resolved, deps) || Boolean(fs.existsSync(path.join(resolved, ".git")) && gitShowSuperproject(resolved, deps.spawn || spawnSync));
  const hasGit = fs.existsSync(path.join(resolved, ".git"));
  if (isMount && !hasGit) return isEmptyDir(resolved) ? "empty-gitlink" : "uninitialized";
  if (isMount && hasGit) return gitAbbrevRef(resolved, deps.spawn || spawnSync) === "HEAD" ? "detached-head" : "attached-branch";
  if (!relative || relative.startsWith("..")) return null;
  return null;
}

function gitDirtyWarning(targetDir, spawn = spawnSync) {
  const probe = spawn("git", ["rev-parse", "--is-inside-work-tree"], { cwd: targetDir, encoding: "utf8", timeout: 5000 });
  if (probe.status !== 0 || (probe.stdout || "").trim() !== "true") return null;
  const status = spawn("git", ["status", "--porcelain"], { cwd: targetDir, encoding: "utf8", timeout: 5000 });
  if (status.status === 0 && (status.stdout || "").trim()) {
    return "警告：目标 Git worktree 存在未提交改动；CLI 不会自动 stash 或提交，请在结果后检查 git diff / git status";
  }
  return null;
}

module.exports = { collectGitRoots, gitShowSuperproject, gitAbbrevRef, isEmptyDir, inspectCheckoutState, gitDirtyWarning };
