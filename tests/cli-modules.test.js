"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../src/cli/args");
const { helpText, versionText } = require("../src/cli/help");
const { renderPlanText } = require("../src/cli/plan-output");
const { normalizeInteractiveOptions } = require("../src/cli/prompts");
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

test("parseArgs accepts plan and json flags", () => {
  assert.deepEqual(parseArgs(["--plan", "--json"]), {
    plan: true,
    json: true,
  });
});

test("parseArgs rejects missing values and unsupported flags", () => {
  assert.throws(() => parseArgs(["--project-name"]), /--project-name 需要一个值/);
  assert.throws(() => parseArgs(["--unknown"]), /不支持的参数：--unknown/);
});

test("interactive option normalization preserves legacy defaults", () => {
  assert.deepEqual(
    normalizeInteractiveOptions(
      { dryRun: true },
      {
        projectName: "Demo",
        businessDomain: "Data",
        teamSize: "待补充",
        targetDir: "./demo",
      },
    ),
    {
      projectName: "Demo",
      businessDomain: "Data",
      teamSize: "待补充",
      targetDir: "./demo",
      issueTracker: "github",
      dryRun: true,
      force: false,
      gitInit: false,
      includeExampleDocs: true,
    },
  );
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
  assert.deepEqual(resolveCommand(["diff", "--json"]), {
    command: "diff",
    args: ["--json"],
  });
  assert.deepEqual(resolveCommand(["doctor", "--target-dir", "."]), {
    command: "doctor",
    args: ["--target-dir", "."],
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
  assert.match(helpText("3.1.0"), /diff\s+只计算同步差异/);
  assert.match(helpText("3.1.0"), /doctor\s+检查模板实例/);
  assert.match(helpText("3.1.0"), /upgrade\s+update 的别名/);
  assert.match(helpText("3.1.0"), /--plan\s+sync：输出结构化文本计划/);
  assert.match(helpText("3.1.0"), /--json\s+sync\/diff\/doctor：输出机器可读 JSON/);
});

test("renderPlanText renders a stable human planning summary", () => {
  const text = renderPlanText({
    operation: "sync",
    targetDir: "/project",
    template: { from: "3.0.0", to: "4.0.0" },
    changes: [{ action: "update", path: "AGENTS.md" }],
    conflicts: [
      {
        path: "README.md",
        reason: "local edit",
        forceable: true,
      },
    ],
    unsafe: [],
    warnings: ["dirty"],
    blocked: false,
    stats: { updated: 1, conflicts: 1 },
  });

  assert.match(text, /^sync plan/m);
  assert.match(text, /update: AGENTS\.md/);
  assert.match(text, /conflict \[forceable\]: README\.md \(local edit\)/);
  assert.match(text, /warning: dirty/);
  assert.match(text, /updated=1/);
});
