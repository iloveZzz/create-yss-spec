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
    "toErrorEnvelope",
  ]) {
    assert.equal(typeof api[name], "function", `${name} must be a function`);
    assert.equal(packageApi[name], api[name]);
  }
});

test("programmatic API normalizes thrown errors with Error Envelope v1", () => {
  const envelope = api.toErrorEnvelope(new Error("模板元数据无法解析"));
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "YSS_METADATA_INVALID");
});
