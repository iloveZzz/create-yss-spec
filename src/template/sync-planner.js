"use strict";

function classifySyncOperations({
  managedFiles = {},
  desiredOperations = [],
  getUnmanagedReason = () => null,
  getPathKind,
  getFileHash,
}) {
  if (typeof getPathKind !== "function") {
    throw new TypeError("classifySyncOperations requires getPathKind");
  }
  if (typeof getFileHash !== "function") {
    throw new TypeError("classifySyncOperations requires getFileHash");
  }

  const updated = [];
  const added = [];
  const unchanged = [];
  const skipped = [];
  const conflicts = [];
  const forceableConflicts = [];
  const unsafe = [];

  for (const operation of desiredOperations) {
    const unmanagedReason = getUnmanagedReason(operation);
    if (unmanagedReason) {
      unsafe.push({ ...operation, reason: unmanagedReason });
      continue;
    }

    const existingRecord = managedFiles[operation.relativePath];
    const existingKind = getPathKind(operation);

    if (existingKind === "missing") {
      added.push(operation);
      continue;
    }

    if (existingKind !== "file") {
      unsafe.push({
        ...operation,
        reason: `目标路径类型为 ${existingKind}，无法安全判断是否可以替换`,
      });
      continue;
    }

    const currentHash = getFileHash(operation);

    if (operation.identityConversion && currentHash === operation.identitySourceHash) {
      updated.push(operation);
      continue;
    }

    if (!existingRecord) {
      if (currentHash === operation.desiredHash) {
        unchanged.push(operation);
      } else {
        const conflict = {
          ...operation,
          reason: "文件已存在，但不在受管模板文件基线中",
        };
        conflicts.push(conflict);
        skipped.push(conflict);
      }
      continue;
    }

    if (currentHash === operation.desiredHash) {
      unchanged.push(operation);
      continue;
    }

    if (currentHash !== existingRecord.contentHash) {
      const conflict = {
        ...operation,
        reason: "检测到本地已修改的受管文件",
      };
      conflicts.push(conflict);
      forceableConflicts.push(conflict);
      skipped.push(conflict);
      continue;
    }

    updated.push(operation);
  }

  const desiredPathSet = new Set(desiredOperations.map((operation) => operation.relativePath));
  const removed = Object.keys(managedFiles).filter(
    (relativePath) => !desiredPathSet.has(relativePath),
  );

  return {
    updated,
    added,
    unchanged,
    skipped,
    conflicts,
    forceableConflicts,
    unsafe,
    removed,
    desiredOperations,
  };
}

function createSyncPlan({
  targetDir,
  fromVersion = "unknown",
  toVersion = "unknown",
  classified,
  migration = null,
  warnings = [],
}) {
  if (!classified || typeof classified !== "object") {
    throw new TypeError("createSyncPlan requires classified sync operations");
  }

  const migrationConflicts = migration?.conflicts || [];
  const migrationUnsafe = migration?.unsafe || [];
  const blocked = classified.unsafe.length > 0 || migrationConflicts.length > 0 || migrationUnsafe.length > 0;

  const changes = [
    ...classified.updated.map((operation) => ({ action: "update", path: operation.relativePath })),
    ...classified.added.map((operation) => ({ action: "add", path: operation.relativePath })),
    ...classified.removed.map((relativePath) => ({ action: "remove-report", path: relativePath })),
  ];

  return {
    operation: "sync",
    targetDir,
    template: {
      from: fromVersion,
      to: toVersion,
    },
    changes,
    conflicts: classified.conflicts.map((operation) => ({
      path: operation.relativePath,
      reason: operation.reason,
      forceable: classified.forceableConflicts.includes(operation),
    })),
    unsafe: [
      ...classified.unsafe.map((operation) => ({
        path: operation.relativePath,
        reason: operation.reason,
      })),
      ...migrationUnsafe.map((item) => ({ path: item.path, reason: item.reason })),
    ],
    migration: migration || { operations: [], legacy: [], conflicts: [], unsafe: [] },
    warnings,
    blocked,
    stats: {
      updated: classified.updated.length,
      added: classified.added.length,
      unchanged: classified.unchanged.length,
      skipped: classified.skipped.length,
      conflicts: classified.conflicts.length,
      unsafe: classified.unsafe.length + migrationUnsafe.length,
      removed: classified.removed.length,
    },
  };
}

module.exports = {
  classifySyncOperations,
  createSyncPlan,
};
