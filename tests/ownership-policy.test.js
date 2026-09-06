"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OWNERSHIP_TYPES,
  validateOwnershipPolicy,
  matchesOwnershipPattern,
  resolveOwnership,
  ownershipWriteViolation,
} = require("../src/template/ownership-policy");
const {
  OWNERSHIP_POLICY,
  applyOwnershipToOperations,
  decoratePlanWithOwnership,
} = require("../src/template/ownership-runtime");

test("ownership policy v1 exposes the five supported ownership types", () => {
  assert.deepEqual(OWNERSHIP_TYPES, [
    "managed",
    "managed-customizable",
    "generated",
    "user-owned",
    "protected",
  ]);
});

test("ownership patterns support exact, single-level and recursive prefix matching", () => {
  assert.equal(matchesOwnershipPattern("README.md", "README.md"), true);
  assert.equal(matchesOwnershipPattern("apps/web", "apps/*"), true);
  assert.equal(matchesOwnershipPattern("apps/web/src", "apps/*"), false);
  assert.equal(matchesOwnershipPattern("apps/web/src", "apps/**"), true);
  assert.equal(matchesOwnershipPattern("apps", "apps/**"), true);
});

test("repository ownership policy resolves representative paths", () => {
  assert.equal(resolveOwnership("AGENTS.md", OWNERSHIP_POLICY), "managed-customizable");
  assert.equal(resolveOwnership("yss-project.yaml", OWNERSHIP_POLICY), "generated");
  assert.equal(resolveOwnership("apps/web/src/main.ts", OWNERSHIP_POLICY), "user-owned");
  assert.equal(resolveOwnership(".git/config", OWNERSHIP_POLICY), "protected");
  assert.equal(resolveOwnership("docs/process/example.md", OWNERSHIP_POLICY), "managed");
});

test("invalid ownership policies fail closed", () => {
  assert.throws(
    () =>
      validateOwnershipPolicy({
        version: 1,
        default: "managed",
        rules: [{ pattern: "../outside", ownership: "protected" }],
      }),
    /越界/,
  );
  assert.throws(
    () =>
      validateOwnershipPolicy({
        version: 1,
        default: "managed",
        rules: [
          { pattern: "README.md", ownership: "managed" },
          { pattern: "README.md", ownership: "protected" },
        ],
      }),
    /pattern 重复/,
  );
});

test("write-protected ownership produces explicit blockers", () => {
  assert.match(
    ownershipWriteViolation({ relativePath: ".git/config", ownership: "protected" }),
    /protected/,
  );
  assert.match(
    ownershipWriteViolation({ relativePath: "apps/web", ownership: "user-owned" }),
    /user-owned/,
  );
  assert.equal(
    ownershipWriteViolation({ relativePath: "README.md", ownership: "managed-customizable" }),
    null,
  );
});

test("ownership runtime annotates operations and Plan output", () => {
  const operations = applyOwnershipToOperations([
    { relativePath: "README.md" },
    { relativePath: "yss-project.yaml" },
  ]);
  assert.deepEqual(
    operations.map((operation) => operation.ownership),
    ["managed-customizable", "generated"],
  );

  const plan = decoratePlanWithOwnership(
    {
      operation: "sync",
      changes: [
        { action: "update", path: "README.md" },
        { action: "update", path: "yss-project.yaml" },
      ],
      conflicts: [],
      unsafe: [],
    },
    operations,
  );
  assert.equal(plan.changes[0].ownership, "managed-customizable");
  assert.equal(plan.changes[1].ownership, "generated");
});
