"use strict";

const crypto = require("node:crypto");
const {
  OWNERSHIP_POLICY,
  resolveTemplateOwnership,
} = require("./ownership-runtime");

function ownershipPolicyHash(policy = OWNERSHIP_POLICY) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(policy))
    .digest("hex");
}

function decorateMetadataOwnership(metadata, policy = OWNERSHIP_POLICY) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("metadata must be an object");
  }

  const managedFiles = Object.fromEntries(
    Object.entries(metadata.managedFiles || {}).map(([relativePath, record]) => [
      relativePath,
      {
        ...record,
        ownership:
          record?.ownership || resolveTemplateOwnership(relativePath),
      },
    ]),
  );

  return {
    ...metadata,
    ownershipPolicyVersion: policy.version,
    ownershipPolicyHash: ownershipPolicyHash(policy),
    managedFiles,
  };
}

function ownershipPolicyDrift(metadata, policy = OWNERSHIP_POLICY) {
  const expectedVersion = policy.version;
  const expectedHash = ownershipPolicyHash(policy);
  const actualVersion = metadata?.ownershipPolicyVersion;
  const actualHash = metadata?.ownershipPolicyHash;

  if (actualVersion === undefined || actualHash === undefined) {
    return {
      state: "missing",
      expectedVersion,
      expectedHash,
      actualVersion: actualVersion ?? null,
      actualHash: actualHash ?? null,
    };
  }

  if (actualVersion !== expectedVersion || actualHash !== expectedHash) {
    return {
      state: "drift",
      expectedVersion,
      expectedHash,
      actualVersion,
      actualHash,
    };
  }

  return {
    state: "matched",
    expectedVersion,
    expectedHash,
    actualVersion,
    actualHash,
  };
}

module.exports = {
  ownershipPolicyHash,
  decorateMetadataOwnership,
  ownershipPolicyDrift,
};
