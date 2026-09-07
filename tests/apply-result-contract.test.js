"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const repoRoot = path.resolve(__dirname, "..");
const schema = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "src/contracts/apply-result-v1.json"),
    "utf8",
  ),
);

function validator() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  return ajv.compile(schema);
}

test("Apply Result v1 validates representative templateApply output", () => {
  const validate = validator();
  const value = {
    schemaVersion: 1,
    operation: "sync",
    targetDir: "/project",
    backupPath: null,
    template: { from: "3.1.0", to: "4.0.0" },
    stats: {
      updated: 1,
      added: 0,
      skipped: 1,
      removed: 0,
      forceApplied: 1,
    },
    skipped: [
      {
        path: "CONTEXT.md",
        reason: "manual conflict",
        ownership: "managed-customizable",
        mergeStrategy: "manual",
      },
    ],
    removed: [],
  };
  assert.equal(validate(value), true, JSON.stringify(validate.errors, null, 2));
});

test("Apply Result v1 rejects negative counters", () => {
  const validate = validator();
  assert.equal(
    validate({
      schemaVersion: 1,
      operation: "sync",
      targetDir: "/project",
      backupPath: null,
      template: null,
      stats: {
        updated: -1,
        added: 0,
        skipped: 0,
        removed: 0,
        forceApplied: 0,
      },
      skipped: [],
      removed: [],
    }),
    false,
  );
});
