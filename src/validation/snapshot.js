"use strict";

const path = require("node:path");

function normalizeRelativePath(value) {
  return String(value).split(path.sep).join("/");
}

function validateTemplateSnapshot(snapshot, { manifestHash, treeHash } = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("模板快照元数据必须是 JSON 对象");
  }
  if (!/^[0-9a-f]{40}$/.test(snapshot.templateCommit || "")) {
    throw new Error("模板快照必须绑定 40 位不可变 templateCommit");
  }
  if (!/^[0-9a-f]{64}$/.test(snapshot.snapshotHash || "")) {
    throw new Error("模板快照必须包含 64 位 snapshotHash");
  }
  if (manifestHash !== undefined && snapshot.manifestHash !== manifestHash) {
    throw new Error("模板快照与当前 template.manifest.json 不一致，请重新构建 CLI 包");
  }
  if (snapshot.encodedPaths !== undefined && (typeof snapshot.encodedPaths !== "object" || snapshot.encodedPaths === null || Array.isArray(snapshot.encodedPaths))) {
    throw new Error("模板快照 encodedPaths 必须是 JSON 对象");
  }

  const encodedTargets = new Set();
  for (const [logicalPath, encodedPath] of Object.entries(snapshot.encodedPaths || {})) {
    for (const value of [logicalPath, encodedPath]) {
      const normalized = normalizeRelativePath(value);
      if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
        throw new Error(`模板快照包含越界路径：${value}`);
      }
    }
    const normalizedTarget = normalizeRelativePath(encodedPath);
    if (encodedTargets.has(normalizedTarget)) {
      throw new Error(`模板快照 encodedPaths 存在重复目标：${encodedPath}`);
    }
    encodedTargets.add(normalizedTarget);
  }

  if (treeHash !== undefined && snapshot.snapshotHash !== treeHash) {
    throw new Error("模板快照内容 hash 不匹配，请重新构建 CLI 包");
  }
  return snapshot;
}

module.exports = { validateTemplateSnapshot, normalizeRelativePath };
