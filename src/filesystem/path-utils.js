"use strict";

const fs = require("node:fs");
const path = require("node:path");

function normalizeRelativePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function targetPath(targetDir, relativePath) {
  return path.join(targetDir, ...normalizeRelativePath(relativePath).split("/"));
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

module.exports = {
  normalizeRelativePath,
  targetPath,
  pathKind,
};
