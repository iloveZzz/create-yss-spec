"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLAN_SCHEMA_VERSION,
  normalizePlan,
  serializePlan,
} = require("../src/template/plan-schema");

test("normalizePlan applies a stable v1 envelope", () => {
  const normalized = normalizePlan({
    operation: "sync",
    targetDir: "/project",
    blocked: true,
    conflicts: [{ path: "a.md", reason: "conflict" }],
  });

  assert.equal(normalized.schemaVersion, PLAN_SCHEMA_VERSION);
  assert.equal(normalized.operation, "sync");
  assert.equal(normalized.targetDir, "/project");
  assert.equal(normalized.blocked, true);
  assert.deepEqual(normalized.changes, []);
  assert.deepEqual(normalized.unsafe, []);
  assert.deepEqual(normalized.warnings, []);
  assert.deepEqual(normalized.stats, {});
  assert.equal(normalized.migration, null);
});

test("serializePlan emits newline-terminated JSON", () => {
  const output = serializePlan({ operation: "doctor" });
  assert.equal(output.endsWith("\n"), true);
  assert.equal(JSON.parse(output).schemaVersion, 1);
  assert.equal(JSON.parse(output).operation, "doctor");
});

test("normalizePlan rejects invalid plans", () => {
  assert.throws(() => normalizePlan(null), /plan must be an object/);
  assert.throws(() => normalizePlan({}), /plan.operation is required/);
});
