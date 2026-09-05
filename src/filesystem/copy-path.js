"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathKind } = require("./path-utils");

function copyPath(sourcePath, destinationPath) {
  const kind = pathKind(sourcePath);
  if (kind === "other") {
    throw new Error(`拒绝复制符号链接或特殊文件：${sourcePath}`);
  }
  if (kind === "missing") {
    throw new Error(`复制源路径不存在：${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (kind === "directory") {
    fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
    return;
  }

  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, fs.statSync(sourcePath).mode & 0o777);
}

module.exports = {
  copyPath,
};
