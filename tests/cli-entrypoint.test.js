"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const modularCli = require("../src/cli/index.js");

test("modular CLI entry exposes runCli", () => {
  assert.equal(typeof modularCli.runCli, "function");
});
