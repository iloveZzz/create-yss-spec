"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseArgs } = require("../cli/args");
const { pathKind, targetPath } = require("../filesystem/path-utils");
const { gitDirtyWarning } = require("../git/worktree");
const { gitlinkWriteViolation } = require("../validation/security");
const {
  PACKAGE_ROOT,
  PACKAGE_MANIFEST,
  fileHash,
  readTemplateSnapshot,
  readTargetIdentity,
  loadTemplateMetadata,
} = require("../template/instance-runtime");
const {
  ownershipPolicyDrift,
} = require("../template/ownership-metadata");
const {
  lifecyclePolicyDrift,
} = require("../template/lifecycle-metadata");

const DOCTOR_SCHEMA_VERSION = 1;
const VERIFIERS = [
  {
    name: "verifier-sync-skills",
    path: "scripts/sync-skills",
    args: ["--check"],
  },
  {
    name: "verifier-skill-lock",
    path: "scripts/update-skill-lock",
    args: ["--check"],
  },
  {
    name: "verifier-template",
    path: "scripts/verify-project-instance",
    args: [],
    requiresGit: true,
  },
];

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

function isGitWorktree(targetDir) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: targetDir,
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 && (result.stdout || "").trim() === "true";
}

function checkManagedBaseline(report, targetDir, metadata) {
  const managedFiles = metadata.managedFiles || {};
  const stats = {
    total: 0,
    matched: 0,
    modified: 0,
    missing: 0,
    invalid: 0,
  };

  for (const [relativePath, record] of Object.entries(managedFiles)) {
    if (relativePath === "README.md") continue;
    stats.total += 1;
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      !/^[0-9a-f]{64}$/.test(record.contentHash || "")
    ) {
      stats.invalid += 1;
      continue;
    }

    let absolutePath;
    try {
      absolutePath = targetPath(targetDir, relativePath);
    } catch {
      stats.invalid += 1;
      continue;
    }

    const kind = pathKind(absolutePath);
    if (kind === "missing") {
      stats.missing += 1;
      continue;
    }
    if (kind !== "file") {
      stats.invalid += 1;
      continue;
    }

    if (fileHash(absolutePath) === record.contentHash) {
      stats.matched += 1;
    } else {
      stats.modified += 1;
    }
  }

  if (stats.invalid > 0) {
    addCheck(
      report,
      "managed-baseline",
      "error",
      `managed baseline 含 ${stats.invalid} 个非法记录或不安全路径`,
      stats,
    );
  } else if (stats.missing > 0 || stats.modified > 0) {
    addCheck(
      report,
      "managed-baseline",
      "warning",
      `受管基线存在漂移：本地修改 ${stats.modified}，缺失 ${stats.missing}`,
      stats,
    );
  } else {
    addCheck(
      report,
      "managed-baseline",
      "ok",
      `受管基线一致：${stats.matched}/${stats.total}`,
      stats,
    );
  }
}

function checkOwnershipPolicy(report, metadata) {
  const drift = ownershipPolicyDrift(metadata);
  if (drift.state === "missing") {
    addCheck(
      report,
      "ownership-policy",
      "warning",
      "实例 metadata 尚未记录 ownership policy baseline；下一次 attach/sync 会自动补齐",
      drift,
    );
    return;
  }
  if (drift.state === "drift") {
    addCheck(
      report,
      "ownership-policy",
      "warning",
      `ownership policy baseline 与当前 CLI 不一致：v${drift.actualVersion} -> v${drift.expectedVersion}`,
      drift,
    );
    return;
  }
  addCheck(
    report,
    "ownership-policy",
    "ok",
    `ownership policy baseline 一致：v${drift.expectedVersion}`,
    drift,
  );
}

function addLifecycleDriftCheck(report, name, label, drift) {
  if (drift.state === "missing") {
    addCheck(
      report,
      name,
      "warning",
      `实例 metadata 尚未记录 ${label} baseline；下一次 attach/sync 会自动补齐`,
      drift,
    );
    return;
  }
  if (drift.state === "drift") {
    addCheck(
      report,
      name,
      "warning",
      `${label} baseline 与当前 CLI 不一致：v${drift.actual.version} -> v${drift.expected.version}`,
      drift,
    );
    return;
  }
  addCheck(
    report,
    name,
    "ok",
    `${label} baseline 一致：v${drift.expected.version}`,
    drift,
  );
}

function checkLifecyclePolicies(report, metadata) {
  const drift = lifecyclePolicyDrift(metadata);
  addLifecycleDriftCheck(
    report,
    "customization-policy",
    "customization policy",
    drift.customization,
  );
  addLifecycleDriftCheck(
    report,
    "generator-policy",
    "generator policy",
    drift.generator,
  );
}

function runVerifierCheck(report, targetDir, verifier, gitWorktree) {
  const commandPath = targetPath(targetDir, verifier.path);
  if (pathKind(commandPath) !== "file") {
    addCheck(
      report,
      verifier.name,
      "error",
      `缺少 verifier：${verifier.path}`,
    );
    return;
  }

  if (verifier.requiresGit && !gitWorktree) {
    addCheck(
      report,
      verifier.name,
      "warning",
      `未执行 ${verifier.path}：目标目录不是 Git worktree；doctor 不会临时 git init`,
    );
    return;
  }

  const result = spawnSync(commandPath, verifier.args || [], {
    cwd: targetDir,
    encoding: "utf8",
    timeout: 30000,
  });
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("")
    .trim();

  if (result.error || result.status !== 0) {
    addCheck(
      report,
      verifier.name,
      "error",
      `${verifier.path} 校验失败${output ? `：${output}` : ""}`,
      { exitCode: result.status },
    );
    return;
  }

  addCheck(
    report,
    verifier.name,
    "ok",
    `${verifier.path} 校验通过`,
    { exitCode: result.status },
  );
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

  let snapshot = null;
  try {
    snapshot = readTemplateSnapshot();
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

  let metadata = null;
  try {
    ({ metadata } = loadTemplateMetadata(targetDir));
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

    if (snapshot && metadata.templateCommit !== snapshot.templateCommit) {
      addCheck(
        report,
        "template-drift",
        "warning",
        `实例模板 commit 与当前 CLI 快照不同：${metadata.templateCommit} -> ${snapshot.templateCommit}`,
        {
          from: metadata.templateCommit,
          to: snapshot.templateCommit,
        },
      );
    } else if (snapshot) {
      addCheck(report, "template-drift", "ok", "实例模板 commit 与当前 CLI 快照一致");
    }

    checkOwnershipPolicy(report, metadata);
    checkLifecyclePolicies(report, metadata);
    checkManagedBaseline(report, targetDir, metadata);
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

  const gitWorktree = isGitWorktree(targetDir);
  const dirtyWarning = gitDirtyWarning(targetDir);
  if (dirtyWarning) {
    addCheck(report, "git-worktree", "warning", dirtyWarning);
  } else if (gitWorktree) {
    addCheck(report, "git-worktree", "ok", "Git worktree 无需警告");
  } else {
    addCheck(report, "git-worktree", "warning", "目标目录不是 Git worktree");
  }

  for (const verifier of VERIFIERS) {
    runVerifierCheck(report, targetDir, verifier, gitWorktree);
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
  if (options.prune) throw new Error("--prune 仅适用于 sync");
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
  VERIFIERS,
  checkManagedBaseline,
  checkOwnershipPolicy,
  checkLifecyclePolicies,
  runVerifierCheck,
  buildDoctorReport,
  renderDoctorText,
  runDoctor,
};
