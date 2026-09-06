"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const { normalizePlan } = require("../src/template/plan-schema");
const { normalizeError } = require("../src/cli/error-output");
const { OWNERSHIP_POLICY } = require("../src/template/ownership-runtime");

const repoRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function compileSchema(relativePath) {
  const schema = readJson(relativePath);
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);
  return { schema, validate };
}

test("Plan Schema v1 compiles and validates normalized plan output", () => {
  const { schema, validate } = compileSchema("src/contracts/plan-schema-v1.json");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");

  const plan = normalizePlan({
    operation: "sync",
    targetDir: "/project",
    template: { from: "3.1.0", to: "4.0.0" },
    changes: [
      {
        action: "update",
        path: "AGENTS.md",
        ownership: "managed-customizable",
      },
    ],
    conflicts: [
      {
        path: "README.md",
        reason: "local modification",
        forceable: true,
        source: "managed-file",
        ownership: "managed-customizable",
      },
    ],
    unsafe: [],
    warnings: ["dirty worktree"],
    blocked: false,
    stats: { updated: 1, conflicts: 1 },
    migration: { operations: [], legacy: [], conflicts: [], unsafe: [] },
  });

  assert.equal(validate(plan), true, JSON.stringify(validate.errors, null, 2));
});

test("Plan Schema v1 rejects malformed plan output", () => {
  const { validate } = compileSchema("src/contracts/plan-schema-v1.json");
  assert.equal(
    validate({
      schemaVersion: 1,
      operation: "sync",
      targetDir: null,
      template: null,
      changes: [{ action: "update" }],
      conflicts: [],
      unsafe: [],
      warnings: [],
      blocked: false,
      stats: {},
      migration: null,
    }),
    false,
  );
  assert.ok(validate.errors?.some((item) => item.keyword === "required"));
});

test("Error Envelope v1 compiles and validates normalized CLI errors", () => {
  const { schema, validate } = compileSchema("src/contracts/error-envelope-v1.json");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");

  const envelope = normalizeError(new Error("模板元数据无法解析"));
  assert.equal(validate(envelope), true, JSON.stringify(validate.errors, null, 2));
  assert.match(envelope.error.code, /^YSS_[A-Z0-9_]+$/);
});

test("Error Envelope v1 rejects unstable error codes", () => {
  const { validate } = compileSchema("src/contracts/error-envelope-v1.json");
  assert.equal(
    validate({
      schemaVersion: 1,
      ok: false,
      error: { code: "metadata_invalid", message: "broken" },
    }),
    false,
  );
});

test("Ownership Policy v1 compiles and validates repository policy", () => {
  const { schema, validate } = compileSchema(
    "src/contracts/ownership-policy-v1.json",
  );
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    validate(OWNERSHIP_POLICY),
    true,
    JSON.stringify(validate.errors, null, 2),
  );
});
