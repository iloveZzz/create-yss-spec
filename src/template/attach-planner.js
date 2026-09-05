"use strict";

function classifyAttachOperations({
  desiredOperations = [],
  getUnmanagedReason = () => null,
  getPathKind,
  getFileHash,
}) {
  if (typeof getPathKind !== "function") {
    throw new TypeError("classifyAttachOperations requires getPathKind");
  }
  if (typeof getFileHash !== "function") {
    throw new TypeError("classifyAttachOperations requires getFileHash");
  }

  const missing = [];
  const matched = [];
  const identity = [];
  const conflicts = [];
  const unsafe = [];

  for (const operation of desiredOperations) {
    const unmanagedReason = getUnmanagedReason(operation);
    if (unmanagedReason) {
      unsafe.push({ ...operation, reason: unmanagedReason });
      continue;
    }

    const kind = getPathKind(operation);
    if (kind === "missing") {
      missing.push(operation);
      continue;
    }

    if (kind !== "file") {
      unsafe.push({
        ...operation,
        reason: `目标路径类型为 ${kind}，无法安全判断是否可以替换`,
      });
      continue;
    }

    const currentHash = getFileHash(operation);
    if (currentHash === operation.desiredHash) {
      matched.push(operation);
    } else if (operation.identityConversion) {
      identity.push(operation);
    } else {
      conflicts.push({
        ...operation,
        reason: "目标受管文件已存在且内容不一致",
      });
    }
  }

  return {
    missing,
    matched,
    identity,
    conflicts,
    unsafe,
    desiredOperations,
  };
}

function createAttachPlan({
  targetDir,
  classified,
  migration = null,
  warnings = [],
}) {
  if (!classified || typeof classified !== "object") {
    throw new TypeError("createAttachPlan requires classified attach operations");
  }

  const migrationConflicts = migration?.conflicts || [];
  const migrationUnsafe = migration?.unsafe || [];
  const conflicts = [
    ...classified.conflicts.map((operation) => ({
      path: operation.relativePath,
      reason: operation.reason,
      forceable: true,
      source: "managed-file",
    })),
    ...migrationConflicts.map((item) => ({
      path: item.from || item.path || item.to,
      from: item.from,
      to: item.to,
      reason: item.reason,
      forceable: false,
      source: "migration",
    })),
  ];
  const unsafe = [
    ...classified.unsafe.map((operation) => ({
      path: operation.relativePath,
      reason: operation.reason,
      source: "managed-file",
    })),
    ...migrationUnsafe.map((item) => ({
      path: item.path,
      reason: item.reason,
      source: "migration",
    })),
  ];

  return {
    operation: "attach",
    targetDir,
    template: null,
    changes: [
      ...classified.missing.map((operation) => ({
        action: "add",
        path: operation.relativePath,
      })),
      ...classified.identity.map((operation) => ({
        action: "identity-convert",
        path: operation.relativePath,
      })),
    ],
    conflicts,
    unsafe,
    migration: migration || {
      operations: [],
      legacy: [],
      conflicts: [],
      unsafe: [],
    },
    warnings,
    blocked: unsafe.length > 0 || migrationConflicts.length > 0,
    stats: {
      missing: classified.missing.length,
      matched: classified.matched.length,
      identity: classified.identity.length,
      conflicts: conflicts.length,
      unsafe: unsafe.length,
    },
  };
}

module.exports = {
  classifyAttachOperations,
  createAttachPlan,
};
