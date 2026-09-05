"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../src/cli/args");
const { helpText, versionText } = require("../src/cli/help");
const { resolveCommand } = require("../src/cli/router");

test("parseArgs preserves existing option mapping", () => {
  assert.deepEqual(
    parseArgs([
      "--project-name",
      "Demo",
      "--business-domain",
      "Data",
      "--team-size",
      "8",
      "--target-dir",
      "./demo",
      "--issue-tracker",
      "gitlab",
      "--dry-run",
      "--force",
      "--git-init",
      "--no-example-docs",
    ]),
    {
      projectName: "Demo",
      businessDomain: "Data",
      teamSize: "8",
      targetDir: "./demo",
      issueTracker: "gitlab",
      dryRun: true,
      force: true,
      gitInit: true,
      includeExampleDocs: false,
    },
  );
});

test("parseArgs rejects missing values and unsupported flags", () => {
  assert.throws(() => parseArgs(["--project-name"]), /--project-name 需要一个值/);
  assert.throws(() => parseArgs(["--unknown"]), /不支持的参数：--unknown/);
});

test("resolveCommand keeps global help/version precedence", () => {
  assert.deepEqual(resolveCommand(["sync", "--help"]), { command: "help", args: [] });
  assert.deepEqual(resolveCommand(["attach", "--version"]), { command: "version", args: [] });
});

test("resolveCommand classifies supported commands and defaults to init", () => {
  assert.deepEqual(resolveCommand(["sync", "--dry-run"]), {
    command: "sync",
    args: ["--dry-run"],
  });
  assert.deepEqual(resolveCommand(["attach", "--apply"]), {
    command: "attach",
    args: ["--apply"],
  });
  assert.deepEqual(resolveCommand(["upgrade", "--dry-run"]), {
    command: "update",
    alias: "upgrade",
    args: ["--dry-run"],
  });
  assert.deepEqual(resolveCommand(["--dry-run"]), {
    command: "init",
    args: ["--dry-run"],
  });
});

test("help and version rendering are pure text functions", () => {
  assert.equal(versionText("3.1.0"), "create-yss-spec 3.1.0");
  assert.match(helpText("3.1.0"), /^create-yss-spec 3\.1\.0/m);
  assert.match(helpText("3.1.0"), /attach\s+向已有项目补齐受管研发管理资产/);
  assert.match(helpText("3.1.0"), /upgrade\s+update 的别名/);
});
