"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const api = require("../src/api");
const packageApi = require("..");

test("programmatic API exposes stable v1 surface", () => {
  assert.equal(api.API_VERSION, 1);
  assert.equal(packageApi.API_VERSION, 1);
  for (const name of [
    "projectDoctor",
    "projectDiff",
    "templatePlan",
    "templateApply",
  ]) {
    assert.equal(typeof api[name], "function", `${name} must be a function`);
    assert.equal(packageApi[name], api[name]);
  }
});
