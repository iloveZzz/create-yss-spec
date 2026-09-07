"use strict";

const crypto = require("node:crypto");
const {
  CUSTOMIZATION_POLICY,
  GENERATOR_POLICY,
  applyLifecycleToOperations,
} = require("./lifecycle-runtime");

function policyHash(policy) {
  return crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
}

function decorateMetadataLifecycle(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("metadata must be an object");
  }

  const managedFiles = Object.fromEntries(
    Object.entries(metadata.managedFiles || {}).map(([relativePath, record]) => {
      const [operation] = applyLifecycleToOperations([
        {
          relativePath,
          ownership: record?.ownership,
        },
      ]);
      const next = { ...record };
      if (operation?.mergeStrategy) next.mergeStrategy = operation.mergeStrategy;
      if (operation?.generatorId) next.generatorId = operation.generatorId;
      if (operation?.generatorVersion) {
        next.generatorVersion = operation.generatorVersion;
      }
      return [relativePath, next];
    }),
  );

  return {
    ...metadata,
    customizationPolicyVersion: CUSTOMIZATION_POLICY.version,
    customizationPolicyHash: policyHash(CUSTOMIZATION_POLICY),
    generatorPolicyVersion: GENERATOR_POLICY.version,
    generatorPolicyHash: policyHash(GENERATOR_POLICY),
    managedFiles,
  };
}

function lifecyclePolicyDrift(metadata) {
  const customizationExpected = {
    version: CUSTOMIZATION_POLICY.version,
    hash: policyHash(CUSTOMIZATION_POLICY),
  };
  const generatorExpected = {
    version: GENERATOR_POLICY.version,
    hash: policyHash(GENERATOR_POLICY),
  };

  const customizationState =
    metadata?.customizationPolicyVersion === undefined ||
    metadata?.customizationPolicyHash === undefined
      ? "missing"
      : metadata.customizationPolicyVersion !== customizationExpected.version ||
          metadata.customizationPolicyHash !== customizationExpected.hash
        ? "drift"
        : "matched";

  const generatorState =
    metadata?.generatorPolicyVersion === undefined ||
    metadata?.generatorPolicyHash === undefined
      ? "missing"
      : metadata.generatorPolicyVersion !== generatorExpected.version ||
          metadata.generatorPolicyHash !== generatorExpected.hash
        ? "drift"
        : "matched";

  return {
    customization: {
      state: customizationState,
      expected: customizationExpected,
      actual: {
        version: metadata?.customizationPolicyVersion ?? null,
        hash: metadata?.customizationPolicyHash ?? null,
      },
    },
    generator: {
      state: generatorState,
      expected: generatorExpected,
      actual: {
        version: metadata?.generatorPolicyVersion ?? null,
        hash: metadata?.generatorPolicyHash ?? null,
      },
    },
  };
}

module.exports = {
  policyHash,
  decorateMetadataLifecycle,
  lifecyclePolicyDrift,
};
