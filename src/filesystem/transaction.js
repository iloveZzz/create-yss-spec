"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { copyPath } = require("./copy-path");
const {
  normalizeRelativePath,
  targetPath,
  pathKind,
} = require("./path-utils");

class FileTransaction {
  constructor(targetDir, deps = {}) {
    this.targetDir = path.resolve(targetDir);
    this.fs = deps.fs || fs;
    this.path = deps.path || path;
    this.copyPath = deps.copyPath || copyPath;
    this.pathKind = deps.pathKind || pathKind;
    this.backupRoot = deps.backupRoot || this.fs.mkdtempSync(
      this.path.join((deps.os || os).tmpdir(), "create-yss-spec-backup-"),
    );
    this.backups = [];
    this.mutated = [];
    this.createdDirectories = [];
  }

  relative(absolutePath) {
    return normalizeRelativePath(this.path.relative(this.targetDir, absolutePath));
  }

  backupPath(relativePath) {
    return this.path.join(this.backupRoot, ...normalizeRelativePath(relativePath).split("/"));
  }

  prepare(relativePaths) {
    const candidates = [...new Set(relativePaths)]
      .map((relativePath) => normalizeRelativePath(relativePath))
      .filter(
        (relativePath) =>
          relativePath &&
          this.pathKind(targetPath(this.targetDir, relativePath)) !== "missing",
      )
      .sort((left, right) => left.split("/").length - right.split("/").length);

    for (const relativePath of candidates) {
      if (
        this.backups.some(
          (backup) =>
            relativePath === backup.relativePath ||
            relativePath.startsWith(`${backup.relativePath}/`),
        )
      ) {
        continue;
      }

      const source = targetPath(this.targetDir, relativePath);
      const destination = this.backupPath(relativePath);
      this.copyPath(source, destination);
      this.backups.push({ relativePath, destination });
    }
  }

  ensureParent(absolutePath) {
    const missing = [];
    let current = this.path.dirname(absolutePath);

    while (current !== this.targetDir && !this.fs.existsSync(current)) {
      missing.push(current);
      current = this.path.dirname(current);
    }

    if (current !== this.targetDir && this.pathKind(current) !== "directory") {
      throw new Error(`目标父路径不是目录：${this.relative(current)}`);
    }

    for (const directory of missing.reverse()) {
      this.fs.mkdirSync(directory);
      this.createdDirectories.push(this.relative(directory));
    }
  }

  mark(absolutePath) {
    this.mutated.push(this.relative(absolutePath));
  }

  writeFile(absolutePath, content, options = "utf8") {
    this.ensureParent(absolutePath);
    this.fs.writeFileSync(absolutePath, content, options);
    this.mark(absolutePath);
  }

  copyFile(sourcePath, destinationPath) {
    this.ensureParent(destinationPath);
    this.copyPath(sourcePath, destinationPath);
    this.mark(destinationPath);
  }

  remove(absolutePath) {
    if (!this.fs.existsSync(absolutePath)) return;
    this.fs.rmSync(absolutePath, { recursive: true, force: true });
    this.mark(absolutePath);
  }

  move(sourcePath, destinationPath) {
    this.ensureParent(destinationPath);
    this.copyPath(sourcePath, destinationPath);
    this.mark(destinationPath);
    this.remove(sourcePath);
  }

  rollback() {
    for (const relativePath of [...new Set(this.mutated)].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    )) {
      this.fs.rmSync(targetPath(this.targetDir, relativePath), {
        recursive: true,
        force: true,
      });
    }

    for (const relativePath of [...new Set(this.createdDirectories)].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    )) {
      const directory = targetPath(this.targetDir, relativePath);
      if (this.fs.existsSync(directory) && this.fs.readdirSync(directory).length === 0) {
        this.fs.rmdirSync(directory);
      }
    }

    for (const backup of [...this.backups].sort(
      (left, right) =>
        left.relativePath.split("/").length - right.relativePath.split("/").length,
    )) {
      this.copyPath(
        backup.destination,
        targetPath(this.targetDir, backup.relativePath),
      );
    }
  }

  finish() {
    if (this.backups.length === 0) {
      this.fs.rmSync(this.backupRoot, { recursive: true, force: true });
      return null;
    }
    return this.backupRoot;
  }
}

module.exports = {
  FileTransaction,
};
