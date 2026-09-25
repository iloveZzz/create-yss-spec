"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ASSET_PROFILE, INITIAL_STAGES } = require("./asset-runtime");

const RUNTIMES = Object.freeze({ codex: ".codex/skills", cursor: ".cursor/skills", pi: ".pi/skills" });
const OMIT_INSTANCE_PATHS = [
  ".template-source/process/github-workflows.md",
  ".template-spec/process/harness-executive-blueprint.md",
  ".template-spec/process/PDCA-SCRUM.md",
  ".template-spec/design/preview.html", ".template-spec/design/preview.css", ".template-spec/design/preview.js", ".template-spec/design/preview-dark.html",
  ".template-spec/design/facts/antdv-next", ".template-spec/user-guide/设备借用贯穿案例.md",
  ".template-spec/design/design-system-sync.yaml",
];

function readDistributionRegistry(templateRoot) {
  const registry = fs.readFileSync(path.join(templateRoot, ".template-spec/agents/yss-skill-registry.yaml"), "utf8");
  const match = registry.match(/^instance_distribution:\n([\s\S]*?)(?=^[^\s#][^\n]*:\s*$)/m);
  if (!match) throw new Error("Skill 注册表缺少 instance_distribution");
  const initial = match[1].match(/^  initial_skills: \[([^\]]+)\]/m);
  if (!initial) throw new Error("Skill 注册表缺少 initial_skills");
  return {
    initialSkills: initial[1].split(",").map((item) => item.trim()),
    text: registry,
  };
}

function assertRuntime(runtime) {
  if (!Object.hasOwn(RUNTIMES, runtime)) throw new Error(`--agent-runtime 必须是 ${Object.keys(RUNTIMES).join("| ")}`);
  return runtime;
}

function distributionForVariables(variables, templateRoot) {
  if (variables.distribution?.mode === "legacy-all") return { mode: "legacy-all" };
  if (variables.distribution?.mode === "selected") return variables.distribution;
  const runtime = assertRuntime(variables.agentRuntime);
  return {
    mode: "selected",
    runtimes: [runtime],
    installedSkills: [...readDistributionRegistry(templateRoot).initialSkills],
    assetProfile: ASSET_PROFILE,
    installedStages: [...INITIAL_STAGES],
    resourceSkills: [],
  };
}

function isIncludedInstancePath(relativePath, distribution) {
  if (distribution.mode === "legacy-all") return true;
  if (relativePath === ".cursorrules" && !distribution.runtimes.includes("cursor")) return false;
  if (OMIT_INSTANCE_PATHS.some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`))) return false;
  if (distribution.assetProfile === ASSET_PROFILE &&
      (relativePath.startsWith(".template-spec/") || relativePath.startsWith("scripts/") || relativePath.startsWith(".vscode/"))) {
    return distribution.assetPaths.has(relativePath) ||
      [...distribution.assetPaths].some((ref) => ref.startsWith(`${relativePath}/`));
  }
  for (const [runtime, root] of Object.entries(RUNTIMES)) {
    const runtimeRoot = root.split("/")[0];
    if (relativePath === runtimeRoot || relativePath.startsWith(`${runtimeRoot}/`)) {
      if (!distribution.runtimes.includes(runtime)) return false;
      if (relativePath.startsWith(`${root}/`)) {
        const name = relativePath.slice(root.length + 1).split("/")[0];
        if (name && !name.startsWith(".") && !distribution.installedSkills.includes(name)) return false;
      }
    }
  }
  if (relativePath.startsWith(".agents/skills/")) {
    const name = relativePath.slice(".agents/skills/".length).split("/")[0];
    if (name && !name.startsWith(".") && !distribution.installedSkills.includes(name)) return false;
  }
  return true;
}

function selectedSkillLock(sourceText, distribution) {
  if (distribution.mode === "legacy-all") return sourceText;
  const source = JSON.parse(sourceText);
  const roots = distribution.runtimes.map((runtime) => RUNTIMES[assertRuntime(runtime)]);
  source.projectionRoots = roots;
  source.skills.shared = Object.fromEntries(Object.entries(source.skills.shared).filter(([name]) => distribution.installedSkills.includes(name)).map(([name, record]) => [name, { ...record, targets: [".agents/skills", ...roots] }]));
  source.skills.platform = Object.fromEntries(roots.map((root) => [root, Object.fromEntries(Object.entries(source.skills.platform?.[root] || {}).filter(([name]) => distribution.installedSkills.includes(name)))]).filter(([, entries]) => Object.keys(entries).length));
  return `${JSON.stringify(source, null, 2)}\n`;
}

function renderInstanceSkillSupplyChain(sourceText) {
  const additions = `\nfunction projectionRootsFor(lock) {
  const identityPath = path.join(ROOT, "yss-project.yaml");
  const isInstance = existsSync(identityPath) && /^repository_mode:\\s*project-instance\\s*$/m.test(readFileSync(identityPath, "utf8"));
  if (!isInstance) return PROJECTION_ROOTS;
  const roots = lock?.projectionRoots;
  if (!Array.isArray(roots) || !roots.length || roots.some((root) => !PROJECTION_ROOTS.includes(root))) throw new TypeError("project-instance skills-lock.json 缺少有效 projectionRoots");
  return [...new Set(roots)];
}\n`;
  const marker = 'export const PROJECTION_ROOTS = [".codex/skills", ".cursor/skills", ".pi/skills"];';
  if (!sourceText.includes(marker)) throw new Error("Skill 投影脚本分发基线已变化");
  return sourceText.replace(marker, marker + additions)
    .replace("  const shared = sharedFromLock(lock);", "  const shared = sharedFromLock(lock);\n  const projectionRoots = projectionRootsFor(lock);")
    .replace("  const oldLock = parseLock(); const previous = priorMetadata(oldLock);", "  const oldLock = parseLock(); const projectionRoots = projectionRootsFor(oldLock); const previous = priorMetadata(oldLock);")
    .replaceAll("for (const root of PROJECTION_ROOTS) {", "for (const root of projectionRoots) {")
    .replace("const targets = [\".agents/skills\", ...PROJECTION_ROOTS];", "const targets = [\".agents/skills\", ...projectionRoots];")
    .replace("projectionRoots: PROJECTION_ROOTS, sources, skills", "projectionRoots, sources, skills");
}

function renderInstanceDesignSkillFile(sourceText) {
  return sourceText
    .replaceAll("node .template-source/tooling/node/scripts/design-md.mjs", "scripts/design-md")
    .replace("运行前先更新 `.template-spec/design/design-system-sync.yaml` 的规范源摘要。", "项目实例无需模板间的 design-system-sync 摘要。")
    .replace("修改根 DESIGN.md → 更新 design-system-sync.yaml 摘要 →", "修改根 DESIGN.md →");
}

function linkedSkillDependencies(templateRoot, name) {
  const skillRoot = path.join(templateRoot, ".agents/skills");
  const current = path.join(skillRoot, name);
  const result = new Set();
  function visitDir(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visitDir(file);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = fs.readFileSync(file, "utf8");
        for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
          const ref = match[1].split("#")[0];
          if (!ref || ref.startsWith("/") || ref.includes("://")) continue;
          const resolved = path.resolve(path.dirname(file), ref);
          const relative = path.relative(skillRoot, resolved).split(path.sep);
          if (relative.length > 1 && relative[0] !== name && !relative[0].startsWith(".") && !relative[0].includes("..") && fs.existsSync(resolved)) result.add(relative[0]);
        }
      }
    }
  }
  visitDir(current);
  return [...result];
}

function requiredSkills(registryText, requested, triggers = [], templateRoot = null) {
  const skillBlock = registryText.split(/^skills:\s*$/m)[1]?.split(/^platform_skills:\s*$/m)[0] || "";
  const available = new Set([...skillBlock.matchAll(/^  - (?:\{ )?id: ([a-z][a-z0-9-]+)/gm)].map((match) => match[1]));
  const platformBlock = registryText.split(/^platform_skills:\s*$/m)[1]?.split(/^external_skills:\s*$/m)[0] || "";
  const platformSkills = new Set([...platformBlock.matchAll(/^  - id: ([a-z][a-z0-9-]+)/gm)].map((match) => match[1]));
  const block = registryText.split(/^skill_dependencies:\s*$/m)[1]?.split(/^[^\s#][^\n]*:\s*$/m)[0] || "";
  const dependencies = new Map();
  let current = null;
  for (const line of block.split("\n")) {
    const header = line.match(/^  ([a-z][a-z0-9-]+):\s*$/);
    if (header) { current = header[1]; continue; }
    const item = line.match(/^    - \{ skill: ([a-z][a-z0-9-]+), type: ([a-z-]+)(?:, when: ([a-z0-9-]+))? \}/);
    if (current && item) {
      if (!dependencies.has(current)) dependencies.set(current, []);
      dependencies.get(current).push({ name: item[1], type: item[2], when: item[3] });
    }
  }
  const result = new Set();
  function visit(name) {
    if (!available.has(name)) throw new Error(platformSkills.has(name) ? `平台专属 Skill 不可作为共享 Skill 补装：${name}` : `Skill 未在注册表登记：${name}`);
    if (result.has(name)) return;
    result.add(name);
    for (const dep of dependencies.get(name) || []) {
      if (dep.type === "context-required" || (dep.type === "context-conditional" && triggers.includes(dep.when))) visit(dep.name);
    }
    if (templateRoot) for (const linked of linkedSkillDependencies(templateRoot, name)) visit(linked);
  }
  requested.forEach(visit);
  return [...result].sort();
}

module.exports = { RUNTIMES, assertRuntime, readDistributionRegistry, distributionForVariables, isIncludedInstancePath, selectedSkillLock, renderInstanceSkillSupplyChain, renderInstanceDesignSkillFile, requiredSkills };
