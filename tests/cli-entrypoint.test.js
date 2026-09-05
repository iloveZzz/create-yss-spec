"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const legacyCli = require("../src/cli.js");
const modularCli = require("../src/cli/index.js");

test("modular CLI entry preserves the legacy runCli contract", () => {
  assert.equal(typeof modularCli.runCli, "function");
  assert.equal(modularCli.runCli, legacyCli.runCli);
});
