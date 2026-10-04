"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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
    ".template-spec/process/lifecycle-registry.yaml",
    ".template-spec/process/lifecycle-registry-baseline.json",
    ".template-spec/process/lifecycle-registry-baseline-v1.json",
    ".template-spec/process/lifecycle-artifact-map.md",
    ".template-spec/process/harness-process-tailoring.md",
    ".template-spec/process/script-execution.md",
    ".template-spec/process/document-writing.md",
    ".template-spec/process/contract-reading.md",
    ".template-spec/process/structured-assets.md",
    ".template-spec/process/runtime-storage.md",
    ".template-spec/process/schemas/approval-record.schema.json",
    ".template-spec/process/schemas/review-bundle.schema.json",
    ".template-spec/process/templates/lifecycle-checkpoint-template.json",
    ".template-spec/templates/approval-record-template.json",
    ".template-spec/process/reading-policy.yaml",
    ".template-spec/process/schemas/reading-policy.schema.json",
    ".template-spec/process/schemas/reading-manifest.schema.json",
    ".template-spec/process/schemas/domain-strategy-reading.schema.json",
    ".template-spec/process/schemas/stage-decision-package-reading.schema.json",
    ".template-spec/process/subagent-collaboration.md",
    ".template-spec/process/stage-tracking.md",
    ".template-spec/process/business-tickets.md",
    ".template-spec/process/schemas/business-tickets-v1.schema.json",
    ".template-spec/process/project-ci.md",
    ".template-spec/process/checkpoint-boundary.yaml",
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
    ".template-spec/templates/review-bundle-template.yaml",
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
    "scripts/prepare-read-only-intake",
    "scripts/prepare-review-package",
    "scripts/run-read-only-intake",
    "scripts/runtime-store",
    "scripts/contract",
    "scripts/check-plan-stage-coverage",
    "scripts/stage-tracking",
    "scripts/project-ci",
    "scripts/project-ci-transition",
    "scripts/lifecycle-status",
    "scripts/gitworks",
  ],
};

const BUSINESS_FILES = [".template-spec/templates/business-ticket-template.md", ".template-spec/templates/business-ticket-set-template.yaml", ".template-spec/templates/business-ticket-review-template.yaml"];
const STAGES = Object.freeze({
  "stage.entry-triage": { files: [], scripts: [], skills: [] },
  "stage.plan": {
    prefixes: [".template-spec/plan/"],
    files: [".template-spec/process/plan-migration.md", ".template-spec/process/plan-spec-quality.md"],
    scripts: ["scripts/verify-plan-spec-entry", "scripts/inspect-plan-spec"],
    skills: [],
  },
  "stage.spec-architecture": {
    files: [
      ...BUSINESS_FILES,
      ".template-spec/templates/spec-template.md",
      ".template-spec/templates/spec-delta-template.md",
      ".template-spec/architecture/templates/business-architecture-template.md",
      ".template-spec/architecture/templates/functional-architecture-template.md",
    ],
    scripts: ["scripts/verify-business-tickets"],
    skills: [],
  },
  "stage.product-design": {
    prefixes: [".template-spec/design/"],
    files: BUSINESS_FILES,
    scripts: ["scripts/design-md", "scripts/verify-business-tickets"],
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
      "scripts/verify-business-tickets",
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
    ],
    scripts: ["scripts/preflight-delivery"],
    skills: [],
  },
});

function assertContained(root, ref) {
  if (path.posix.isAbsolute(ref) || ref.includes("\\") || ref.split("/").includes("..")) throw new Error(`阶段资产路径越界：${ref}`);
  const file = path.join(root, ref);
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`阶段资产路径越界：${ref}`);
  return file;
}

function sourceFile(root, ref) {
  const file = path.join(root, ref);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`CLI 快照缺少阶段资产：${ref}`);
  return assertContained(root, ref);
}

function recordReason(result, ref, reason) {
  const reasons = result.inclusionReasons.get(ref) || [];
  if (!reasons.some(item => JSON.stringify(item) === JSON.stringify(reason))) reasons.push(reason);
  result.inclusionReasons.set(ref, reasons);
}

function addFile(root, result, ref, reason, uri) {
  recordReason(result, ref, reason);
  if (!result.has(ref)) {
    sourceFile(root, ref);
    result.add(ref);
  } else if (!ref.endsWith(".schema.json")) return;
  if (ref.endsWith(".schema.json")) {
    const visited = result.schemaFiles.has(ref);
    const text = result.schemaFiles.get(ref) || fs.readFileSync(path.join(root, ref), "utf8"), schema = JSON.parse(text);
    const fileURI = pathToFileURL(path.join(root, ref)).href;
    for (const id of [uri, fileURI, schema.$id].filter(Boolean)) {
      if (result.schemaResources.has(id) && result.schemaResources.get(id) !== text) throw new Error(`阶段 Schema ID 冲突：${id}`);
      result.schemaResources.set(id, text);
    }
    if (visited) return;
    result.schemaFiles.set(ref, text);
    const base = schema.$id || uri || fileURI;
    function visit(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, dependency] of Object.entries(value)) {
        if (["$ref", "$dynamicRef"].includes(key) && typeof dependency === "string" && !dependency.startsWith("#")) {
          const file = dependency.split("#")[0];
          const resolvedURI = new URL(file, base).href;
          if (result.schemaResources.has(resolvedURI)) continue;
          if (/^[a-z][a-z0-9+.-]*:/i.test(file) || path.posix.isAbsolute(file) || file.includes("\\")) throw new Error(`阶段 Schema 依赖必须为本地相对路径：${ref} -> ${dependency}`);
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ref), file));
          if (!resolved.startsWith(".template-spec/") && !resolved.startsWith("scripts/")) throw new Error(`阶段 Schema 依赖路径越界：${ref} -> ${dependency}`);
          addFile(root, result, resolved, { kind: "schema-ref", from: ref, reference: dependency }, resolvedURI);
        } else visit(dependency);
      }
    }
    visit(schema);
  }
}

function addPrefix(root, result, prefix, reason, ancestors = []) {
  const directory = path.join(root, prefix);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(`CLI 快照缺少阶段目录：${prefix}`);
  assertContained(root, prefix);
  const physical = fs.realpathSync(directory);
  if (ancestors.includes(physical)) throw new Error(`阶段资产目录链接循环：${prefix}`);
  const nextAncestors = [...ancestors, physical];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const ref = `${prefix}${entry.name}`;
    const stat = entry.isSymbolicLink() ? fs.statSync(path.join(root, ref)) : entry;
    if (stat.isDirectory()) addPrefix(root, result, `${ref}/`, reason, nextAncestors);
    else if (stat.isFile()) addFile(root, result, ref, reason);
  }
}

function moduleClosure(root, result, ref, selectedSkills, reason) {
  addFile(root, result, ref, reason);
  if (result.modules.has(ref)) return;
  result.modules.add(ref);
  const source = fs.readFileSync(sourceFile(root, ref), "utf8");
  for (const match of source.matchAll(/\b(?:spawnSync|spawn|execFileSync|execFile)\(\s*['"](python3|node)['"]\s*,/g)) {
    const dependency = result.runtimeDependencies.get(match[1]) || { executable: match[1], requiredBy: new Set(), packages: new Set() };
    dependency.requiredBy.add(ref);
    if (match[1] === "python3") {
      for (const pkg of ["jsonschema", "referencing"]) if (new RegExp(`^from ${pkg}(?:\\.|\\s)`, "m").test(source)) dependency.packages.add(pkg);
    }
    result.runtimeDependencies.set(match[1], dependency);
  }
  if (/\b(?:spawnSync|spawn|execFileSync|execFile)\(\s*process\.execPath\s*,/.test(source)) {
    const dependency = result.runtimeDependencies.get("node") || { executable: "node", requiredBy: new Set(), packages: new Set() };
    dependency.requiredBy.add(ref);
    result.runtimeDependencies.set("node", dependency);
  }
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
      moduleClosure(root, result, candidate, selectedSkills, { kind: "module-import", from: ref, reference: match[1] });
    }
  }
  // File names passed to a subprocess or Schema loader are runtime resources,
  // not JavaScript imports. Include only complete, fixed local file references.
  for (const match of source.matchAll(/['"]((?:scripts\/[\p{L}\p{N}_.\/-]+\.py|\.template-spec\/[\p{L}\p{N}_.\/-]+\.(?:json|yaml)))['"]/gu)) {
    if (!fs.existsSync(path.join(root, match[1])) && !/\.(?:py|schema\.json)$/.test(match[1])) continue;
    addFile(root, result, match[1], { kind: "runtime-resource", from: ref });
  }
  for (const match of source.matchAll(/\bnew\s+URL\(\s*['"](\.[^'"]+\.(?:json|yaml|py))['"]\s*,\s*import\.meta\.url\s*\)/g)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ref), match[1]));
    if (!resolved.startsWith("scripts/") && !resolved.startsWith(".template-spec/")) throw new Error(`阶段资源依赖路径越界：${ref} -> ${match[1]}`);
    addFile(root, result, resolved, { kind: "runtime-resource", from: ref, reference: match[1] });
  }
  // Caller-supplied roots can address another registered project. Only the
  // module's fixed template root proves a dependency in this distribution.
  for (const match of source.matchAll(/\b(?:spawnSync|spawn|execFileSync|execFile)\(\s*(?:(?:process\.execPath|['"](?:node|python3)['"])\s*,\s*\[\s*)?(?:path\.)?(?:join|resolve)\(\s*(?:ROOT|TEMPLATE_ROOT)\s*,\s*['"](scripts\/[\p{L}\p{N}_.\/-]+)['"]\s*\)/gu)) {
    const reason = { kind: "subprocess-entry", from: ref };
    if (/\.(?:py|json|yaml)$/.test(match[1])) addFile(root, result, match[1], reason);
    else moduleClosure(root, result, match[1], selectedSkills, reason);
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
          const reason = { kind: "skill-reference", skill: skillId, from: path.relative(root, file).split(path.sep).join("/") };
          if (ref.startsWith("scripts/")) moduleClosure(root, result, ref, selectedSkills, reason);
          else addFile(root, result, ref, reason);
        }
      }
    }
  }
  visit(skillRoot);
  for (const prefix of SKILL_ASSET_PREFIXES[skillId] || []) addPrefix(root, result, prefix, { kind: "skill-resource", skill: skillId, prefix });
  for (const ref of RENDERED_SKILL_SCRIPTS[skillId] || []) moduleClosure(root, result, ref, selectedSkills, { kind: "skill-resource", skill: skillId });
}

function assetPaths(root, distribution) {
  if (distribution.mode !== "selected" || distribution.assetProfile !== ASSET_PROFILE) return null;
  const lifecycle = fs.readFileSync(sourceFile(root, ".template-spec/process/lifecycle-registry.yaml"), "utf8");
  const stageIds = [...lifecycle.matchAll(/^  - id: (stage\.[a-z0-9-]+)\s*$/gm)].map((match) => match[1]).sort();
  if (JSON.stringify(stageIds) !== JSON.stringify(Object.keys(STAGES).sort())) {
    throw new Error("CLI 阶段资产映射与生命周期注册表阶段 ID 不一致");
  }
  const result = new Set();
  result.inclusionReasons = new Map();
  result.runtimeDependencies = new Map();
  result.modules = new Set();
  result.schemaFiles = new Map();
  result.schemaResources = new Map();
  const selectedSkills = new Set(distribution.installedSkills);
  for (const ref of COMMON.files) {
    if (ref === ".template-spec/process/lifecycle-registry-baseline-v1.json" &&
        !fs.existsSync(path.join(root, ref))) {
      const baseline = JSON.parse(fs.readFileSync(sourceFile(root, ".template-spec/process/lifecycle-registry-baseline.json"), "utf8"));
      if (baseline.schema_version === 1) continue;
    }
    addFile(root, result, ref, { kind: "common-asset" });
  }
  for (const ref of COMMON.scripts) moduleClosure(root, result, ref, selectedSkills, { kind: "common-entry" });
  for (const stage of distribution.installedStages) {
    const bundle = STAGES[stage];
    if (!bundle) throw new Error(`未知生命周期阶段：${stage}`);
    for (const prefix of bundle.prefixes || []) addPrefix(root, result, prefix, { kind: "stage-asset", stage, prefix });
    for (const ref of bundle.files || []) addFile(root, result, ref, { kind: "stage-asset", stage });
    for (const ref of bundle.scripts || []) moduleClosure(root, result, ref, selectedSkills, { kind: "stage-entry", stage });
  }
  const resourceSkills = new Set(distribution.resourceSkills || []);
  if (selectedSkills.has("yss-harness-upgrade")) resourceSkills.add("yss-harness-upgrade");
  for (const skill of resourceSkills) skillReferences(root, result, skill, selectedSkills);
  return result;
}

function assetRequirements(root, distribution) {
  const files = assetPaths(root, distribution);
  if (!files) return { selective: false, inclusionReasons: {}, runtimeDependencies: [] };
  return {
    selective: true,
    inclusionReasons: Object.fromEntries([...files.inclusionReasons].sort(([a], [b]) => a.localeCompare(b)).map(([ref, reasons]) => [ref, reasons.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])),
    runtimeDependencies: [...files.runtimeDependencies.values()].sort((a, b) => a.executable.localeCompare(b.executable)).map(item => ({ executable: item.executable, requiredBy: [...item.requiredBy].sort(), packages: [...item.packages].sort() })),
  };
}

module.exports = { ASSET_PROFILE, INITIAL_STAGES, STAGES, assetPaths, assetRequirements };
