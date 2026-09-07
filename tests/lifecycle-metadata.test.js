"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  decorateMetadataLifecycle,
  lifecyclePolicyDrift,
} = require("../src/template/lifecycle-metadata");


test("metadata lifecycle decorator persists merge and generator baselines", () => {
  const metadata = decorateMetadataLifecycle({
    managedFiles: {
      "CONTEXT.md": {
        type: "render",
        contentHash: "a".repeat(64),
        ownership: "managed-customizable",
      },
      "README.md": {
        type: "render",
        contentHash: "b".repeat(64),
        ownership: "managed-customizable",
      },
      "yss-project.yaml": {
        type: "render",
        contentHash: "c".repeat(64),
        ownership: "generated",
      },
    },
  });

  assert.equal(metadata.customizationPolicyVersion, 1);
  assert.match(metadata.customizationPolicyHash, /^[0-9a-f]{64}$/);
  assert.equal(metadata.generatorPolicyVersion, 1);
  assert.match(metadata.generatorPolicyHash, /^[0-9a-f]{64}$/);
  assert.equal(metadata.managedFiles["CONTEXT.md"].mergeStrategy, "manual");
  assert.equal(
    metadata.managedFiles["README.md"].mergeStrategy,
    "replace-with-force",
  );
  assert.equal(
    metadata.managedFiles["yss-project.yaml"].generatorId,
    "repository-identity",
  );
  assert.equal(metadata.managedFiles["yss-project.yaml"].generatorVersion, 1);
});


test("lifecycle policy drift distinguishes missing, matched and drift", () => {
  const missing = lifecyclePolicyDrift({});
  assert.equal(missing.customization.state, "missing");
  assert.equal(missing.generator.state, "missing");

  const decorated = decorateMetadataLifecycle({ managedFiles: {} });
  const matched = lifecyclePolicyDrift(decorated);
  assert.equal(matched.customization.state, "matched");
  assert.equal(matched.generator.state, "matched");

  const drift = lifecyclePolicyDrift({
    ...decorated,
    customizationPolicyHash: "0".repeat(64),
    generatorPolicyHash: "1".repeat(64),
  });
  assert.equal(drift.customization.state, "drift");
  assert.equal(drift.generator.state, "drift");
});
