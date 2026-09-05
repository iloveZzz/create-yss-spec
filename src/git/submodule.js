"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GITLINK_MODE = "160000";

function posixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function parseGitmodules(content) {
  const modules = [];
  if (typeof content !== "string" || content.length === 0) return modules;
  let current = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const name = line.match(/^\[submodule "(.+)"\]$/);
    if (name) {
      current = { name: name[1], path: "", url: "" };
      modules.push(current);
      continue;
    }
    if (!current) continue;
    const pathMatch = line.match(/^path\s*=\s*(.+)$/);
    if (pathMatch) current.path = pathMatch[1].trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const urlMatch = line.match(/^url\s*=\s*(.+)$/);
    if (urlMatch) current.url = urlMatch[1].trim();
  }
  return modules;
}

function readGitmodules(repoRoot, deps = {}) {
  const file = path.join(repoRoot, ".gitmodules");
  const pathKind = deps.pathKind || ((value) => {
    try {
      const stat = fs.lstatSync(value);
      if (stat.isFile()) return "file";
      if (stat.isDirectory()) return "directory";
      return "other";
    } catch (error) {
      if (error.code === "ENOENT") return "missing";
      throw error;
    }
  });
  if (!fs.existsSync(file) || pathKind(file) !== "file") return [];
  return parseGitmodules(fs.readFileSync(file, "utf8"));
}

function gitlinkPaths(repoRoot, deps = {}) {
  const spawn = deps.spawn || spawnSync;
  const result = spawn("git", ["-C", path.resolve(repoRoot), "ls-files", "--stage", "-z"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const paths = new Set();
  if (result.status === 0) {
    for (const record of (result.stdout || "").split("\0")) {
      const match = record.match(/^(160000)\s+[0-9a-f]+\s+\d+\s+(.+)$/i);
      if (match) paths.add(match[2].replaceAll("\\", "/"));
    }
  }
  return paths;
}

function isGitSubmoduleMount(repoRoot, targetPathValue, deps = {}) {
  const relative = posixRelative(repoRoot, path.resolve(targetPathValue));
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  if (readGitmodules(repoRoot, deps).some((item) => item.path === relative)) return true;
  return gitlinkPaths(repoRoot, deps).has(relative);
}

module.exports = { GITLINK_MODE, parseGitmodules, readGitmodules, gitlinkPaths, isGitSubmoduleMount, posixRelative };
