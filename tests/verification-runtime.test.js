"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  verificationEnvironment,
} = require("../src/template/verification-runtime");

test("verification subprocesses do not inherit node test-runner context", () => {
  const sanitized = verificationEnvironment({
    PATH: "/usr/bin",
    NODE_TEST_CONTEXT: "child-v8",
    NODE_TEST_REPORTER: "spec",
    NODE_OPTIONS: "--trace-warnings",
  });

  assert.equal(sanitized.PATH, "/usr/bin");
  assert.equal(sanitized.NODE_OPTIONS, "--trace-warnings");
  assert.equal(sanitized.NODE_TEST_CONTEXT, undefined);
  assert.equal(sanitized.NODE_TEST_REPORTER, undefined);
});
