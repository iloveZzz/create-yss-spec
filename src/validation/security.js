"use strict";

const path = require("node:path");
const { collectGitRoots, inspectCheckoutState } = require("../git/worktree");
const { isGitSubmoduleMount } = require("../git/submodule");

const DEFAULT_UNMANAGED_USER_PATHS = new Set([".gitmodules"]);

function gitlinkWriteViolation(targetDir, { force = false, packageRoot = null, deps = {} } = {}) {
  const resolved = path.resolve(targetDir);
  const roots = (deps.collectGitRoots || collectGitRoots)(resolved);
  for (const root of roots) {
    if (packageRoot && path.resolve(root) === path.resolve(packageRoot)) continue;
    let current = resolved;
    while (true) {
      if ((deps.isGitSubmoduleMount || isGitSubmoduleMount)(root, current, deps)) {
        const checkout = (deps.inspectCheckoutState || inspectCheckoutState)(root, current, deps);
        if (checkout === "empty-gitlink" || checkout === "uninitialized") {
          return "空 gitlink 不得当成普通目录写入；gitlink 不得由 CLI 覆盖";
        }
        if (checkout === "detached-head") {
          return "detached HEAD 不得当成普通目录写入；gitlink 不得由 CLI 覆盖";
        }
        if (path.resolve(current) === resolved) {
          return force
            ? "--force 不得把 git-submodule 挂载点当成普通目录覆盖"
            : "git-submodule gitlink 不得由 CLI 覆盖；先 git submodule update --init，在子仓附加分支的工作树内操作，或改用独立目录";
        }
      }
      if (path.resolve(current) === path.resolve(root)) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function assertTargetWorkingTreeWritable(targetDir, options = {}) {
  const violation = gitlinkWriteViolation(targetDir, options);
  if (violation) throw new Error(violation);
}

function unmanagedPathReason(targetDir, relativePath, { packageRoot = null, unmanagedPaths = DEFAULT_UNMANAGED_USER_PATHS, deps = {} } = {}) {
  const normalized = String(relativePath).split(path.sep).join("/");
  if (unmanagedPaths.has(normalized) || normalized.split("/")[0] === ".gitmodules") {
    return ".gitmodules 是用户资产，不属于受管模板文件";
  }
  const absolutePath = path.resolve(targetDir, normalized);
  const roots = (deps.collectGitRoots || collectGitRoots)(targetDir);
  for (const root of roots) {
    if (packageRoot && path.resolve(root) === path.resolve(packageRoot)) continue;
    let current = absolutePath;
    while (true) {
      if ((deps.isGitSubmoduleMount || isGitSubmoduleMount)(root, current, deps)) {
        return "gitlink / apps 挂载工作树是用户资产，不属于受管模板文件";
      }
      if (path.resolve(current) === path.resolve(root)) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

module.exports = { DEFAULT_UNMANAGED_USER_PATHS, gitlinkWriteViolation, assertTargetWorkingTreeWritable, unmanagedPathReason };
