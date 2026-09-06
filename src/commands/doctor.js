"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseArgs } = require("../cli/args");
const { pathKind } = require("../filesystem/path-utils");
const { gitDirtyWarning } = require("../git/worktree");
const { gitlinkWriteViolation } = require("../validation/security");
const {
  PACKAGE_ROOT,
  PACKAGE_MANIFEST,
  readTemplateSnapshot,
  readTargetIdentity,
  loadTemplateMetadata,
} = require("../template/instance-runtime");

const DOCTOR_SCHEMA_VERSION = 1;

function normalizeTargetDir(value) {
  return path.resolve(process.cwd(), value || ".");
}

function addCheck(report, name, status, detail, data = undefined) {
  const check = { name, status, detail };
  if (data !== undefined) check.data = data;
  report.checks.push(check);
  if (status === "error") report.ok = false;
  return check;
}

function buildDoctorReport(targetDir) {
  const report = {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    operation: "doctor",
    targetDir,
    cliVersion: PACKAGE_MANIFEST.version,
    ok: true,
    checks: [],
  };

  try {
    const snapshot = readTemplateSnapshot();
    addCheck(
      report,
      "template-snapshot",
      "ok",
      `模板快照有效：${snapshot.templateCommit}`,
      { templateCommit: snapshot.templateCommit },
    );
  } catch (error) {
    addCheck(report, "template-snapshot", "error", error.message);
  }

  if (!fs.existsSync(targetDir) || pathKind(targetDir) !== "directory") {
    addCheck(report, "target-directory", "error", "目标目录不存在或不是目录");
    return report;
  }
  addCheck(report, "target-directory", "ok", "目标目录可读取");

  const violation = gitlinkWriteViolation(targetDir, {
    packageRoot: PACKAGE_ROOT,
  });
  if (violation) {
    addCheck(report, "git-safety", "error", violation);
  } else {
    addCheck(report, "git-safety", "ok", "未检测到 gitlink / detached HEAD 写入风险");
  }

  try {
    const { metadata } = loadTemplateMetadata(targetDir);
    addCheck(
      report,
      "template-metadata",
      "ok",
      `模板元数据有效：${metadata.templateVersion || metadata.cliVersion || "unknown"}`,
      {
        metadataSchemaVersion: metadata.metadataSchemaVersion,
        templateVersion: metadata.templateVersion || metadata.cliVersion || null,
        templateCommit: metadata.templateCommit || null,
      },
    );
  } catch (error) {
    addCheck(report, "template-metadata", "error", error.message);
  }

  try {
    const identity = readTargetIdentity(targetDir);
    if (identity.state !== "valid") {
      addCheck(report, "project-identity", "error", "缺少 yss-project.yaml");
    } else if (identity.fields.repository_mode !== "project-instance") {
      addCheck(
        report,
        "project-identity",
        "error",
        `repository_mode 不是 project-instance：${identity.fields.repository_mode}`,
      );
    } else {
      addCheck(report, "project-identity", "ok", "yss-project.yaml 为 project-instance");
    }
  } catch (error) {
    addCheck(report, "project-identity", "error", error.message);
  }

  const dirtyWarning = gitDirtyWarning(targetDir);
  if (dirtyWarning) {
    addCheck(report, "git-worktree", "warning", dirtyWarning);
  } else {
    addCheck(report, "git-worktree", "ok", "Git worktree 无需警告");
  }

  return report;
}

function renderDoctorText(report) {
  const lines = [
    "create-yss-spec doctor",
    `目标目录：${report.targetDir}`,
    `结果：${report.ok ? "PASS" : "FAIL"}`,
  ];
  for (const check of report.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

function runDoctor(argv = []) {
  const options = parseArgs(argv);
  const targetDir = normalizeTargetDir(options.targetDir);
  const report = buildDoctorReport(targetDir);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderDoctorText(report));
  }

  return report;
}

module.exports = {
  DOCTOR_SCHEMA_VERSION,
  buildDoctorReport,
  renderDoctorText,
  runDoctor,
};
