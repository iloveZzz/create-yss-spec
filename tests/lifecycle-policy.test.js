"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CUSTOMIZATION_POLICY,
  GENERATOR_POLICY,
  applyLifecycleToOperations,
} = require("../src/template/lifecycle-runtime");
const {
  validateCustomizationPolicy,
  resolveCustomizationStrategy,
  validateGeneratorPolicy,
  resolveGenerator,
} = require("../src/template/lifecycle-policy");


test("customization policy resolves manual and force strategies", () => {
  assert.equal(
    resolveCustomizationStrategy("CONTEXT.md", CUSTOMIZATION_POLICY),
    "manual",
  );
  assert.equal(
    resolveCustomizationStrategy("README.md", CUSTOMIZATION_POLICY),
    "replace-with-force",
  );
  assert.throws(
    () =>
      validateCustomizationPolicy({
        version: 1,
        defaultStrategy: "three-way-text",
        rules: [],
      }),
    /defaultStrategy 非法/,
  );
});


test("generator policy resolves stable generator identity and version", () => {
  assert.deepEqual(resolveGenerator("yss-project.yaml", GENERATOR_POLICY), {
    generatorId: "repository-identity",
    generatorVersion: 1,
  });
  assert.equal(resolveGenerator("README.md", GENERATOR_POLICY), null);
  assert.throws(
    () =>
      validateGeneratorPolicy({
        version: 1,
        rules: [
          {
            pattern: "yss-project.yaml",
            generatorId: "Bad Generator",
            generatorVersion: 1,
          },
        ],
      }),
    /generatorId 非法/,
  );
});


test("lifecycle runtime annotates customizable and generated operations", () => {
  const operations = applyLifecycleToOperations([
    { relativePath: "CONTEXT.md" },
    { relativePath: "README.md" },
    { relativePath: "yss-project.yaml" },
  ]);

  const context = operations.find((item) => item.relativePath === "CONTEXT.md");
  const readme = operations.find((item) => item.relativePath === "README.md");
  const identity = operations.find((item) => item.relativePath === "yss-project.yaml");

  assert.equal(context.ownership, "managed-customizable");
  assert.equal(context.mergeStrategy, "manual");
  assert.equal(readme.mergeStrategy, "replace-with-force");
  assert.equal(identity.ownership, "generated");
  assert.equal(identity.generatorId, "repository-identity");
  assert.equal(identity.generatorVersion, 1);
});
