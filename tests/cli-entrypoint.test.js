"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const modularCli = require("../src/cli/index.js");
const { runAttach } = require("../src/commands/attach");
const { runInit } = require("../src/commands/init");
const { runSync } = require("../src/commands/sync");
const { runUpdateCommand } = require("../src/commands/update");

test("modular CLI entry exposes runCli", () => {
  assert.equal(typeof modularCli.runCli, "function");
});

test("command adapters expose stable execution seams", () => {
  assert.equal(typeof runInit, "function");
  assert.equal(typeof runAttach, "function");
  assert.equal(typeof runSync, "function");
  assert.equal(typeof runUpdateCommand, "function");
});
