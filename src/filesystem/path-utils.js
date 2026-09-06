"use strict";

const fs = require("node:fs");
const path = require("node:path");

function normalizeRelativePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function pathKind(absolutePath) {
  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}

function targetPath(targetDir, relativePath) {
  const root = path.resolve(targetDir);
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, normalized);
  const relative = path.relative(root, resolved);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`模板路径越界：${relativePath}`);
  }

  if (pathKind(root) === "directory") {
    let current = root;
    const segments = relative.split(path.sep).filter(Boolean);
    segments.forEach((segment, index) => {
      current = path.join(current, segment);
      const kind = pathKind(current);
      if (kind === "missing") return;

      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() && index < segments.length - 1) {
        throw new Error(
          `模板目标路径包含中间符号链接，无法安全写入：${relativePath}`,
        );
      }
      if (index < segments.length - 1 && kind !== "directory") {
        throw new Error(`模板目标父路径不是目录：${relativePath}`);
      }
    });
  }

  return resolved;
}

module.exports = {
  normalizeRelativePath,
  targetPath,
  pathKind,
};
