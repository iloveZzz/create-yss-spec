"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const legacyBridge = require("../src/cli.js");
const modularCli = require("../src/cli/index.js");
const { runAttach } = require("../src/commands/attach");
const { runDiff } = require("../src/commands/diff");
const { runDoctor } = require("../src/commands/doctor");
const { runInit } = require("../src/commands/init");
const { runSync } = require("../src/commands/sync");
const { runUpdateCommand } = require("../src/commands/update");

test("modular CLI entry exposes runCli", () => {
  assert.equal(typeof modularCli.runCli, "function");
});

test("legacy src/cli.js is only a compatibility bridge", () => {
  assert.equal(legacyBridge.runCli, modularCli.runCli);
});

test("command modules expose stable execution seams", () => {
  assert.equal(typeof runInit, "function");
  assert.equal(typeof runAttach, "function");
  assert.equal(typeof runSync, "function");
  assert.equal(typeof runDiff, "function");
  assert.equal(typeof runDoctor, "function");
  assert.equal(typeof runUpdateCommand, "function");
});
