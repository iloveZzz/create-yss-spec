"use strict";

const { isTemplateManagedOwnership } = require("./ownership-policy");
const { resolveTemplateOwnership } = require("./ownership-runtime");

function classifyRemovedFiles({
  removed,
  managedFiles,
  getPathKind,
  getFileHash,
  getCurrentOwnership = resolveTemplateOwnership,
  getUnmanagedReason = () => null,
}) {
  const prunable = [];
  const retainedRemoved = [];
  const alreadyMissing = [];
  for (const relativePath of removed) {
    const record = managedFiles[relativePath];
    const kind = getPathKind(relativePath);
    if (kind === "missing") {
      alreadyMissing.push(relativePath);
      continue;
    }
    if (kind !== "file") {
      retainedRemoved.push({ path: relativePath, reason: `路径类型为 ${kind}` });
      continue;
    }
    if (!record?.contentHash) {
      retainedRemoved.push({ path: relativePath, reason: "缺少可信受管基线" });
      continue;
    }
    const recordedOwnership = record.ownership || getCurrentOwnership(relativePath);
    const currentOwnership = getCurrentOwnership(relativePath);
    if (
      !isTemplateManagedOwnership(recordedOwnership) ||
      !isTemplateManagedOwnership(currentOwnership)
    ) {
      retainedRemoved.push({ path: relativePath, reason: "文件不属于模板所有权" });
      continue;
    }
    const unmanagedReason = getUnmanagedReason(relativePath);
    if (unmanagedReason) {
      retainedRemoved.push({ path: relativePath, reason: unmanagedReason });
      continue;
    }
    if (getFileHash(relativePath) !== record.contentHash) {
      retainedRemoved.push({ path: relativePath, reason: "文件已被项目修改" });
      continue;
    }
    prunable.push(relativePath);
  }
  return { prunable, retainedRemoved, alreadyMissing };
}

module.exports = { classifyRemovedFiles };
