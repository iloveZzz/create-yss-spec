"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ASSET_PROFILE = "stage-selective";
const INITIAL_STAGES = ["stage.entry-triage", "stage.plan"];
const TEMPLATE_ONLY_IMPORTS = new Set(["scripts/lib/maintenance-intensity.mjs"]);
const RENDERED_SKILL_SCRIPTS = Object.freeze({ "yss-design-system": ["scripts/design-md"] });
const SKILL_ASSET_PREFIXES = Object.freeze({ "yss-design-system": [".template-spec/design/tokens/"] });

// Paths here are the entry points for each stage. Relative JavaScript imports
// are included by moduleClosure; files named by an explicitly installed Skill
// are included by skillReferences. The CLI snapshot retains every source file.
const COMMON = {
  files: [
    ".template-spec/agents/yss-skill-registry.yaml",
    ".template-spec/agents/digital-human-roles.yaml",
    ".template-spec/agents/digital-human-roles.md",
    ".template-spec/agents/issue-tracker.md",
    ".template-spec/agents/triage-labels.md",
    ".template-spec/agents/domain.md",
    ".template-spec/process/lifecycle-registry.yaml",
    ".template-spec/process/lifecycle-registry-baseline.json",
    ".template-spec/process/lifecycle-artifact-map.md",
    ".template-spec/process/harness-process-tailoring.md",
    ".template-spec/process/document-writing.md",
    ".template-spec/process/contract-reading.md",
    ".template-spec/process/stage-tracking.md",
    ".template-spec/process/schemas/context-reconciliation.schema.json",
    ".template-spec/process/schemas/digital-human-task-package.schema.json",
    ".template-spec/process/schemas/lifecycle-checkpoint.schema.json",
    ".template-spec/process/schemas/stage-tracking.schema.json",
    ".template-spec/process/schemas/user-decision.schema.json",
    ".template-spec/process/templates/context-reconciliation-template.yaml",
    ".template-spec/process/templates/lifecycle-checkpoint-template.yaml",
    ".template-spec/process/templates/stage-checkpoint-template.md",
    ".template-spec/process/templates/user-decision-template.yaml",
    ".template-spec/templates/local-parent-ticket-template.md",
    ".template-spec/templates/approval-record-template.yaml",
    ".template-spec/templates/review-report-template.md",
    ".template-spec/user-guide/用户手册.md",
  ],
  scripts: [
    "scripts/verify-project-instance",
    "scripts/sync-skills",
    "scripts/update-skill-lock",
    "scripts/verify-context-contract",
    "scripts/verify-context-reconciliation",
    "scripts/verify-digital-human-roles",
    "scripts/verify-digital-human-task-package",
    "scripts/verify-lifecycle-checkpoint",
    "scripts/verify-user-decision",
    "scripts/verify-approval-record",
    "scripts/query-lifecycle-context",
    "scripts/contract",
    "scripts/stage-tracking",
    "scripts/gitworks",
  ],
};

const STAGES = Object.freeze({
  "stage.entry-triage": { files: [], scripts: [], skills: [] },
  "stage.plan": {
    prefixes: [".template-spec/plan/"],
    files: [".template-spec/process/plan-migration.md"],
    scripts: ["scripts/verify-plan-spec-entry"],
    skills: [],
  },
  "stage.spec-architecture": {
    files: [
      ".template-spec/templates/spec-template.md",
      ".template-spec/templates/spec-delta-template.md",
      ".template-spec/architecture/templates/business-architecture-template.md",
      ".template-spec/architecture/templates/functional-architecture-template.md",
    ],
    scripts: [],
    skills: [],
  },
  "stage.product-design": {
    prefixes: [".template-spec/design/"],
    files: [],
    scripts: ["scripts/design-md"],
    skills: ["yss-prototype-stage"],
  },
  "stage.system-data-engineering": {
    prefixes: [".template-spec/engineering/"],
    files: [
      ".template-spec/process/implementation-repo-integration.md",
      ".template-spec/process/existing-backend-architecture.md",
      ".template-spec/process/existing-ui-baseline.md",
      ".template-spec/process/frontend-backend-delivery.md",
      ".template-spec/templates/implementation-repo-registry-template.md",
    ],
    scripts: [
      "scripts/backend-platforms",
      "scripts/backend-delivery",
      "scripts/repository-scope-policy",
      "scripts/verify-scaffold-architecture-decisions",
    ],
    skills: ["yss-implementation-contract-compiler"],
  },
  "stage.ticket-formalization": {
    files: [".template-spec/templates/vertical-slice-ticket-template.md", ".template-spec/templates/cross-repo-slice-template.md"],
    scripts: ["scripts/dispatch-slice-task", "scripts/slice-contract"],
    skills: [],
  },
  "stage.vertical-slice-implementation": {
    files: [".template-spec/templates/verification-record-template.md"],
    scripts: ["scripts/implementation-path-policy", "scripts/complete-backend-delivery"],
    skills: [],
  },
  "stage.verification-release-retrospective": {
    files: [
      ".template-spec/process/delivery-preflight.md",
      ".template-spec/templates/release-note-template.md",
      ".template-spec/templates/retro-report-template.md",
      ".template-spec/templates/review-bundle-template.yaml",
    ],
    scripts: ["scripts/preflight-delivery"],
    skills: [],
  },
});

function sourceFile(root, ref) {
  const file = path.join(root, ref);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`CLI 快照缺少阶段资产：${ref}`);
  return file;
}

function addFile(root, result, ref) {
  sourceFile(root, ref);
  result.add(ref);
}

function addPrefix(root, result, prefix) {
  const directory = path.join(root, prefix);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(`CLI 快照缺少阶段目录：${prefix}`);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const ref = `${prefix}${entry.name}`;
    if (entry.isDirectory()) addPrefix(root, result, `${ref}/`);
    else if (entry.isFile()) result.add(ref);
  }
}

function moduleClosure(root, result, ref, selectedSkills) {
  if (result.has(ref)) return;
  const source = fs.readFileSync(sourceFile(root, ref), "utf8");
  result.add(ref);
  const expressions = [
    /\b(?:import|export)\s+(?:[^'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) {
      if (!match[1].startsWith(".")) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ref), match[1]));
      const candidate = [resolved, `${resolved}.mjs`, `${resolved}.js`].find((name) => fs.existsSync(path.join(root, name)));
      if (!candidate && TEMPLATE_ONLY_IMPORTS.has(resolved)) continue;
      if (candidate?.startsWith(".agents/skills/")) {
        const skill = candidate.split("/")[2];
        if (!selectedSkills.has(skill)) {
          const error = new Error(`阶段脚本依赖未安装 Skill：${ref} -> ${skill}`);
          error.requiredSkill = skill;
          throw error;
        }
        continue;
      }
      if (!candidate || !candidate.startsWith("scripts/")) throw new Error(`阶段脚本依赖未分发：${ref} -> ${match[1]}`);
      moduleClosure(root, result, candidate, selectedSkills);
    }
  }
}

function skillReferences(root, result, skillId, selectedSkills) {
  const skillRoot = path.join(root, ".agents/skills", skillId);
  if (!fs.existsSync(skillRoot)) throw new Error(`CLI 快照缺少 Skill：${skillId}`);
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(?:md|yaml|json)$/.test(entry.name)) {
        const source = fs.readFileSync(file, "utf8");
        for (const match of source.matchAll(/(?:\.template-spec|scripts)\/[\p{L}\p{N}_.\/-]+/gu)) {
          const ref = match[0].replace(/[.,;]+$/, "");
          if (!fs.existsSync(path.join(root, ref)) || !fs.statSync(path.join(root, ref)).isFile()) continue;
          if (ref.startsWith("scripts/")) moduleClosure(root, result, ref, selectedSkills);
          else addFile(root, result, ref);
        }
      }
    }
  }
  visit(skillRoot);
  for (const prefix of SKILL_ASSET_PREFIXES[skillId] || []) addPrefix(root, result, prefix);
  for (const ref of RENDERED_SKILL_SCRIPTS[skillId] || []) moduleClosure(root, result, ref, selectedSkills);
}

function assetPaths(root, distribution) {
  if (distribution.mode !== "selected" || distribution.assetProfile !== ASSET_PROFILE) return null;
  const lifecycle = fs.readFileSync(sourceFile(root, ".template-spec/process/lifecycle-registry.yaml"), "utf8");
  const stageIds = [...lifecycle.matchAll(/^  - id: (stage\.[a-z0-9-]+)\s*$/gm)].map((match) => match[1]).sort();
  if (JSON.stringify(stageIds) !== JSON.stringify(Object.keys(STAGES).sort())) {
    throw new Error("CLI 阶段资产映射与生命周期注册表阶段 ID 不一致");
  }
  const result = new Set();
  const selectedSkills = new Set(distribution.installedSkills);
  for (const ref of COMMON.files) addFile(root, result, ref);
  for (const ref of COMMON.scripts) moduleClosure(root, result, ref, selectedSkills);
  for (const stage of distribution.installedStages) {
    const bundle = STAGES[stage];
    if (!bundle) throw new Error(`未知生命周期阶段：${stage}`);
    for (const prefix of bundle.prefixes || []) addPrefix(root, result, prefix);
    for (const ref of bundle.files || []) addFile(root, result, ref);
    for (const ref of bundle.scripts || []) moduleClosure(root, result, ref, selectedSkills);
  }
  for (const skill of distribution.resourceSkills || []) skillReferences(root, result, skill, selectedSkills);
  return result;
}

module.exports = { ASSET_PROFILE, INITIAL_STAGES, STAGES, assetPaths };
