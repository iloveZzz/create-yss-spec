"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const { targetPath, pathKind } = require("../filesystem/path-utils");
const {
  createMigrationPlan,
  addUnsafe,
  addConflict,
  addRemove,
} = require("./migration-planner");

const TRACKER_FROM = "docs/agents/issue-tracker.md";
const TRACKER_TO = ".template-spec/agents/issue-tracker.md";
const STATIC_DIRECTORIES = [
  "docs/agents", "docs/process", "docs/templates", "docs/user-guide",
  "docs/plan/templates", "docs/api/templates", "docs/architecture/templates",
  "docs/design/templates", "docs/design/tokens", "docs/design/schemas",
  "docs/design/diagrams", "docs/discovery/templates",
];
const STATIC_FILES = [
  "docs/adr/README.md", "docs/architecture/README.md",
  "docs/plan/README.md", "docs/plan/entry-review.md",
  "docs/discovery/README.md", "docs/discovery/IDEATION.md",
  "docs/design/README.md", "docs/design/design.md",
  "docs/design/design-system-sync.yaml", "docs/design/preview.html",
  "docs/design/preview-dark.html", "docs/design/preview.css",
  "docs/design/preview.js", "docs/engineering/backend-platforms.json",
  "docs/engineering/backend-platforms.md",
];
const RETIRED_SOURCE_ONLY = new Set([
  "docs/agents/archify-integration.md", "docs/agents/skills-maintenance.md",
  "docs/agents/strategic-design-skills-integration.md",
  "docs/agents/yss-ui-skills-integration.md",
  "docs/process/MATT-POCOCK-ENGINEERING-SKILLS.md",
  "docs/process/github-workflows.md", "docs/process/maintenance-intensity.yaml",
  "docs/process/template-engineering-overview.md",
  "docs/process/template-verification-profiles.yaml",
  "docs/process/schemas/maintenance-review-record.schema.json",
  "docs/process/templates/maintenance-checkpoint-template.yaml",
  "docs/design/design-system-sync.yaml", "docs/design/preview.html",
  "docs/design/preview-dark.html", "docs/design/preview.css",
  "docs/design/preview.js",
]);
const SEPARATE_LEGACY_MAPPINGS = new Set([
  "docs/templates/prd-template.md",
  "docs/templates/vertical-slice-issue-template.md",
]);

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function legacyStaticPath(ref) {
  return STATIC_FILES.includes(ref) ||
    STATIC_DIRECTORIES.some((directory) => ref.startsWith(`${directory}/`));
}

function collectLegacyFiles(targetDir, desiredOperations, managedFiles, plan) {
  const found = new Set();
  function inspect(ref) {
    let kind;
    try { kind = pathKind(targetPath(targetDir, ref)); }
    catch (error) { addUnsafe(plan, ref, error.message); return; }
    if (kind === "missing") return;
    if (kind === "other") { addUnsafe(plan, ref, "旧治理路径是符号链接或特殊文件"); return; }
    if (kind === "file") { found.add(ref); return; }
    for (const entry of fs.readdirSync(targetPath(targetDir, ref))) {
      if (entry === ".DS_Store") continue;
      inspect(`${ref}/${entry}`);
    }
  }
  for (const directory of STATIC_DIRECTORIES) inspect(directory);
  for (const ref of STATIC_FILES) inspect(ref);
  for (const ref of Object.keys(managedFiles || {})) {
    if (legacyStaticPath(ref)) inspect(ref);
  }
  for (const operation of desiredOperations) {
    if (operation.relativePath.startsWith(".template-spec/")) {
      inspect(`docs/${operation.relativePath.slice(".template-spec/".length)}`);
    }
  }
  return [...found].filter((ref) => !SEPARATE_LEGACY_MAPPINGS.has(ref)).sort();
}

function prepareLayoutMigration({ targetDir, desiredOperations, managedFiles = {}, explicit = false }) {
  const plan = createMigrationPlan(targetDir);
  const legacyFiles = collectLegacyFiles(targetDir, desiredOperations, managedFiles, plan);
  const desiredByPath = new Map(desiredOperations.map((operation) => [operation.relativePath, operation]));
  const operations = [...desiredOperations];

  for (const from of legacyFiles) {
    const to = `.template-spec/${from.slice("docs/".length)}`;
    if (!explicit) {
      addConflict(plan, from, to, "旧治理目录布局需显式 --migrate-layout；普通 attach/sync 不写入");
      continue;
    }
    const source = targetPath(targetDir, from);
    const destination = targetPath(targetDir, to);
    const sourceBytes = fs.readFileSync(source);
    const destinationKind = pathKind(destination);
    if (destinationKind !== "missing" && destinationKind !== "file") {
      addUnsafe(plan, to, "迁移目标不是普通文件");
      continue;
    }
    if (from === TRACKER_FROM) {
      if (destinationKind === "file" && !sourceBytes.equals(fs.readFileSync(destination))) {
        addConflict(plan, from, to, "项目 tracker 的新旧配置不一致，需人工处理");
        continue;
      }
      const index = operations.findIndex((operation) => operation.relativePath === TRACKER_TO);
      if (index < 0) {
        addConflict(plan, from, to, "当前阶段缺少 tracker 目标资产");
        continue;
      }
      if (destinationKind === "missing") {
        operations[index] = {
          ...operations[index], type: "render", desiredContent: sourceBytes,
          desiredHash: digest(sourceBytes),
        };
      }
      addRemove(plan, from, "保留项目 tracker 原内容并退出旧路径", { action: "preserve-project-config", to });
      continue;
    }
    const recordedHash = managedFiles[from]?.contentHash;
    if (!recordedHash || digest(sourceBytes) !== recordedHash) {
      addConflict(plan, from, to, "缺少可信受管摘要或旧治理文件已被项目修改");
      continue;
    }
    const desired = desiredByPath.get(to);
    if (!desired && !RETIRED_SOURCE_ONLY.has(from)) {
      addConflict(plan, from, to, "目标阶段未安装对应治理资产，不能静默丢弃");
      continue;
    }
    if (destinationKind === "file" && (!desired || digest(fs.readFileSync(destination)) !== desired.desiredHash)) {
      addConflict(plan, from, to, "目标路径已存在且与当前模板不一致");
      continue;
    }
    addRemove(plan, from, desired ? "可信旧治理文件由新模板取代" : "可信模板专用文件退出实例", {
      action: desired ? "replace-with-current-template" : "retire-template-only",
      to: desired ? to : null,
    });
  }
  return { desiredOperations: operations, plan, legacyFiles };
}

function combineMigrationPlans(...plans) {
  const targetDir = plans[0]?.targetDir;
  const combined = createMigrationPlan(targetDir);
  for (const plan of plans) {
    combined.operations.push(...plan.operations);
    combined.legacy.push(...plan.legacy);
    combined.conflicts.push(...plan.conflicts);
    combined.unsafe.push(...plan.unsafe);
  }
  return combined;
}

module.exports = { prepareLayoutMigration, combineMigrationPlans, TRACKER_FROM, TRACKER_TO };
