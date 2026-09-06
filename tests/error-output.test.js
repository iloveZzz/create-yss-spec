"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  classifyErrorCode,
  normalizeError,
  serializeError,
} = require("../src/cli/error-output");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");

test("error classifier exposes stable machine codes", () => {
  assert.equal(
    classifyErrorCode(new Error("模板元数据 metadataSchemaVersion 非法")),
    "YSS_METADATA_INVALID",
  );
  assert.equal(
    classifyErrorCode(new Error("detached HEAD 不得当成普通目录写入")),
    "YSS_GIT_PROTECTED",
  );
  assert.equal(
    classifyErrorCode(new Error("不支持的参数：--wat")),
    "YSS_ARGUMENT_INVALID",
  );
  assert.equal(classifyErrorCode(new Error("unexpected")), "YSS_COMMAND_FAILED");
});

test("explicit YSS error code takes precedence", () => {
  const error = new Error("custom failure");
  error.code = "YSS_CUSTOM_FAILURE";
  assert.equal(classifyErrorCode(error), "YSS_CUSTOM_FAILURE");
});

test("normalizeError and serializeError return Error Envelope v1", () => {
  const envelope = normalizeError(new Error("模板快照无效"));
  assert.deepEqual(envelope, {
    schemaVersion: 1,
    ok: false,
    error: {
      code: "YSS_SNAPSHOT_INVALID",
      message: "模板快照无效",
    },
  });
  assert.deepEqual(JSON.parse(serializeError(new Error("模板快照无效"))), envelope);
});

test("CLI --json failures remain parseable and exit non-zero", () => {
  const result = spawnSync(
    process.execPath,
    [cliBin, "sync", "--json", "--unknown-option"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");

  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "YSS_ARGUMENT_INVALID");
  assert.match(envelope.error.message, /不支持的参数/);
});
