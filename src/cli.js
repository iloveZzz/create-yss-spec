const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawnSync } = require("node:child_process");
const { treeHash } = require("./template-hash");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
);
const BUNDLED_TEMPLATE_ROOT = path.join(PACKAGE_ROOT, "template");
const BUNDLED_MANIFEST_PATH = path.join(PACKAGE_ROOT, "template.manifest.json");
const BUNDLED_SNAPSHOT_PATH = path.join(PACKAGE_ROOT, "template.snapshot.json");
const TEMPLATE_MANIFEST_TEXT = fs.readFileSync(BUNDLED_MANIFEST_PATH, "utf8");
const TEMPLATE_MANIFEST = JSON.parse(TEMPLATE_MANIFEST_TEXT);
const ROOT_EXCLUDED_ENTRIES = new Set(TEMPLATE_MANIFEST.excludeRootEntries);
const ROOT_EXCLUDED_FILES = new Set(TEMPLATE_MANIFEST.excludeRootFiles);
const EXCLUDED_RELATIVE_PATHS = new Set(TEMPLATE_MANIFEST.excludePaths);
const INIT_EXCLUDED_ROOT_ENTRIES = new Set(
  TEMPLATE_MANIFEST.initExcludeRootEntries || [],
);
const INIT_EXCLUDED_ROOT_FILES = new Set(
  TEMPLATE_MANIFEST.initExcludeRootFiles || [],
);
const INIT_EXCLUDED_RELATIVE_PATHS = new Set(
  TEMPLATE_MANIFEST.initExcludePaths || [],
);
const RENDERED_RELATIVE_PATHS = new Set(TEMPLATE_MANIFEST.renderPaths);
const EXAMPLE_DOC_PATHS = new Set(TEMPLATE_MANIFEST.exampleDocPaths);
const INSTANCE_FORBIDDEN_ROOT_PATHS = ["wiki", ".nvmrc", ".gitignore"];
const TEMPLATE_METADATA_FILENAME = ".yss-template.json";
const TEMPLATE_MANIFEST_VERSION = sha256(TEMPLATE_MANIFEST_TEXT);
const TEMPLATE_SOURCE = "github:iloveZzz/yss-spec-project-template";
const METADATA_SCHEMA_VERSION = 2;
const HELP_FLAGS = new Set(["--help", "-h", "-help"]);
const VERSION_FLAGS = new Set(["--version", "-v", "-version"]);
const AGENT_SKILL_ROOTS = [
  ".agents/skills",
  ".claude/skills",
  ".codex/skills",
  ".hermes/skills",
  ".pi/skills",
  ".qoder/skills",
  ".trae/skills",
];
const LEGACY_SKILL_MAPPINGS = [
  ["to-prd", "to-spec"],
  ["to-issues", "to-tickets"],
];
const LEGACY_FILE_MAPPINGS = [
  ["docs/templates/prd-template.md", "docs/templates/spec-template.md"],
  [
    "docs/templates/vertical-slice-issue-template.md",
    "docs/templates/vertical-slice-ticket-template.md",
  ],
];
let BUNDLED_PATH_TO_LOGICAL_PATH = null;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function nowIsoString() {
  return new Date().toISOString();
}

function readTemplateSnapshot() {
  if (!fs.existsSync(BUNDLED_SNAPSHOT_PATH)) {
    throw new Error(
      "缺少模板快照元数据，请先运行 npm run sync-template；正式发布不得使用浮动模板引用",
    );
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(BUNDLED_SNAPSHOT_PATH, "utf8"));
  } catch (error) {
    throw new Error(`模板快照元数据无法解析：${error.message}`);
  }

  if (!/^[0-9a-f]{40}$/.test(snapshot.templateCommit || "")) {
    throw new Error("模板快照必须绑定 40 位不可变 templateCommit");
  }

  if (!/^[0-9a-f]{64}$/.test(snapshot.snapshotHash || "")) {
    throw new Error("模板快照必须包含 64 位 snapshotHash");
  }

  if (
    snapshot.encodedPaths !== undefined &&
    (typeof snapshot.encodedPaths !== "object" ||
      snapshot.encodedPaths === null ||
      Array.isArray(snapshot.encodedPaths))
  ) {
    throw new Error("模板快照 encodedPaths 必须是 JSON 对象");
  }

  const encodedTargets = new Set();
  for (const [logicalPath, encodedPath] of Object.entries(snapshot.encodedPaths || {})) {
    for (const value of [logicalPath, encodedPath]) {
      const normalized = normalizeRelativePath(value);
      if (
        !normalized ||
        normalized === "." ||
        normalized.startsWith("../") ||
        normalized.includes("/../") ||
        path.posix.isAbsolute(normalized)
      ) {
        throw new Error(`模板快照包含越界路径：${value}`);
      }
    }
    if (encodedTargets.has(normalizeRelativePath(encodedPath))) {
      throw new Error(`模板快照 encodedPaths 存在重复目标：${encodedPath}`);
    }
    encodedTargets.add(normalizeRelativePath(encodedPath));
  }

  if (snapshot.snapshotHash !== treeHash(BUNDLED_TEMPLATE_ROOT)) {
    throw new Error("模板快照内容 hash 不匹配，请重新构建 CLI 包");
  }

  return snapshot;
}

function logicalTemplatePath(bundledPath) {
  if (BUNDLED_PATH_TO_LOGICAL_PATH === null) {
    const snapshot = readTemplateSnapshot();
    BUNDLED_PATH_TO_LOGICAL_PATH = new Map(
      Object.entries(snapshot.encodedPaths || {}).map(
        ([logicalPath, encodedPath]) => [
          normalizeRelativePath(encodedPath),
          normalizeRelativePath(logicalPath),
        ],
      ),
    );
  }
  return BUNDLED_PATH_TO_LOGICAL_PATH.get(normalizeRelativePath(bundledPath)) ||
    normalizeRelativePath(bundledPath);
}

function getTemplateSource() {
  return TEMPLATE_SOURCE;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (
      [
        "--project-name",
        "--business-domain",
        "--team-size",
        "--target-dir",
        "--issue-tracker",
      ].includes(current)
    ) {
      if (!next || next.startsWith("--")) {
        throw new Error(`${current} 需要一个值`);
      }
      const key = {
        "--project-name": "projectName",
        "--business-domain": "businessDomain",
        "--team-size": "teamSize",
        "--target-dir": "targetDir",
        "--issue-tracker": "issueTracker",
      }[current];
      options[key] = next;
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      options.dryRun = true;
    } else if (current === "--apply") {
      options.apply = true;
    } else if (current === "--force") {
      options.force = true;
    } else if (current === "--git-init") {
      options.gitInit = true;
    } else if (current === "--include-example-docs") {
      options.includeExampleDocs = true;
    } else if (current === "--no-example-docs") {
      options.includeExampleDocs = false;
    } else if (HELP_FLAGS.has(current)) {
      options.help = true;
    } else if (VERSION_FLAGS.has(current)) {
      options.version = true;
    } else {
      throw new Error(`不支持的参数：${current}`);
    }
  }

  return options;
}

async function promptForMissingOptions(options) {
  if (!process.stdin.isTTY) {
    return promptFromBufferedInput(options);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const projectName =
      options.projectName || (await rl.question("项目名称: ")).trim();
    const businessDomain =
      options.businessDomain || (await rl.question("业务领域: ")).trim();
    const teamSizeInput =
      options.teamSize !== undefined
        ? options.teamSize
        : await rl.question("团队规模（可留空）: ");
    const targetDir =
      options.targetDir || (await rl.question("目标目录: ")).trim();

    return normalizeInteractiveOptions(options, {
      projectName,
      businessDomain,
      teamSize: (teamSizeInput || "").trim() || "待补充",
      targetDir,
    });
  } finally {
    rl.close();
  }
}

async function promptFromBufferedInput(options) {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const answers = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  let answerIndex = 0;
  const ask = (label) => {
    process.stdout.write(`${label}: `);
    const value = answers[answerIndex] ?? "";
    answerIndex += 1;
    return value.trim();
  };

  const projectName = options.projectName || ask("项目名称");
  const businessDomain = options.businessDomain || ask("业务领域");
  const teamSizeInput =
    options.teamSize !== undefined ? options.teamSize : ask("团队规模（可留空）");
  const targetDir = options.targetDir || ask("目标目录");

  return normalizeInteractiveOptions(options, {
    projectName,
    businessDomain,
    teamSize: teamSizeInput || "待补充",
    targetDir,
  });
}

function normalizeInteractiveOptions(options, values) {
  return {
    ...values,
    issueTracker: options.issueTracker || "github",
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    gitInit: Boolean(options.gitInit),
    includeExampleDocs:
      options.includeExampleDocs === undefined
        ? true
        : Boolean(options.includeExampleDocs),
  };
}

function assertRequiredOptions(options, command = "init") {
  if (!options.projectName) {
    throw new Error(`${command} 需要 --project-name，项目名称不能为空`);
  }

  if (!options.businessDomain) {
    throw new Error(`${command} 需要 --business-domain，业务领域不能为空`);
  }

  if (!options.targetDir) {
    throw new Error(`${command} 需要 --target-dir，目标目录不能为空`);
  }
}

function normalizeTargetDir(targetDir) {
  return path.resolve(process.cwd(), targetDir);
}

function isInsideTemplateRoot(targetDir) {
  const relativePath = path.relative(BUNDLED_TEMPLATE_ROOT, targetDir);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function targetPath(targetDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(targetDir, normalized);
  const relative = path.relative(targetDir, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`模板路径越界：${relativePath}`);
  }

  if (pathKind(targetDir) === "directory") {
    let current = targetDir;
    const segments = relative.split(path.sep).filter(Boolean);
    segments.forEach((segment, index) => {
      current = path.join(current, segment);
      const kind = pathKind(current);
      if (kind === "missing") {
        return;
      }
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() && index < segments.length - 1) {
        throw new Error(
          `模板目标路径包含中间符号链接，无法安全写入：${relativePath}`,
        );
      }
      if (index < segments.length - 1 && kind !== "directory") {
        throw new Error(`模板目标父路径不是目录：${relativePath}`);
      }
    });
  }
  return resolved;
}

function matchesExcludedPath(relativePath, excludedPaths) {
  const normalized = normalizeRelativePath(relativePath);
  for (const excludedPath of excludedPaths) {
    const excluded = normalizeRelativePath(excludedPath);
    if (normalized === excluded || normalized.startsWith(`${excluded}/`)) {
      return true;
    }
  }
  return false;
}

function shouldExcludeRelativePath(relativePath, mode = "managed") {
  const normalized = normalizeRelativePath(relativePath);
  if (matchesExcludedPath(normalized, EXCLUDED_RELATIVE_PATHS)) {
    return true;
  }
  if (mode === "init") {
    return matchesExcludedPath(normalized, INIT_EXCLUDED_RELATIVE_PATHS) ||
      INIT_EXCLUDED_ROOT_FILES.has(normalized);
  }
  return false;
}

function shouldSkipRootEntry(entryName, mode = "managed") {
  return ROOT_EXCLUDED_ENTRIES.has(entryName) ||
    ROOT_EXCLUDED_FILES.has(entryName) ||
    (mode === "init" &&
      (INIT_EXCLUDED_ROOT_ENTRIES.has(entryName) ||
        INIT_EXCLUDED_ROOT_FILES.has(entryName)));
}

function parseRepositoryIdentity(content) {
  const fields = {};

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([a-z_][a-z0-9_-]*):\s*([^\s#]+)\s*$/);
    if (!match) {
      throw new Error(`yss-project.yaml 第 ${index + 1} 行格式非法`);
    }
    const [, key, value] = match;
    if (fields[key] !== undefined) {
      throw new Error(`yss-project.yaml 不允许重复字段：${key}`);
    }
    fields[key] = value;
  }

  const keys = Object.keys(fields).sort();
  if (keys.join(",") !== "repository_mode,schema_version") {
    throw new Error("yss-project.yaml 只能包含 schema_version 和 repository_mode");
  }

  if (fields.schema_version !== "1") {
    throw new Error("yss-project.yaml 的 schema_version 必须为 1");
  }

  if (![
    "template-source",
    "project-instance",
  ].includes(fields.repository_mode)) {
    throw new Error(
      "yss-project.yaml 的 repository_mode 必须是 template-source 或 project-instance",
    );
  }

  return fields;
}

function readTargetIdentity(targetDir) {
  const identityPath = targetPath(targetDir, "yss-project.yaml");
  const identityKind = pathKind(identityPath);
  if (identityKind === "missing") {
    return { state: "missing", path: identityPath, content: null };
  }
  if (identityKind !== "file") {
    throw new Error("yss-project.yaml 不能是符号链接或其他特殊文件");
  }

  const content = fs.readFileSync(identityPath, "utf8");
  return {
    state: "valid",
    path: identityPath,
    content,
    fields: parseRepositoryIdentity(content),
  };
}

function renderTemplateFile(relativePath, content, variables) {
  if (relativePath === "yss-project.yaml") {
    const identity = parseRepositoryIdentity(content);
    if (identity.repository_mode !== "template-source") {
      throw new Error(
        "模板 yss-project.yaml 必须声明 repository_mode: template-source",
      );
    }

    const renderedContent = content.replace(
      /^repository_mode:\s*template-source$/m,
      "repository_mode: project-instance",
    );
    const renderedIdentity = parseRepositoryIdentity(renderedContent);
    if (renderedIdentity.repository_mode !== "project-instance") {
      throw new Error("生成项目 yss-project.yaml 未转换为 project-instance");
    }
    return renderedContent;
  }

  if (relativePath === "AGENTS.md") {
    return content
      .replace(/(\*\*项目名称：\*\*\s*)\[填写\]/, (_, prefix) => `${prefix}${variables.projectName}`)
      .replace(/(\*\*业务领域：\*\*\s*)\[填写\]/, (_, prefix) => `${prefix}${variables.businessDomain}`)
      .replace(/(\*\*团队规模：\*\*\s*)\[填写\]/, (_, prefix) => `${prefix}${variables.teamSize}`);
  }

  if (relativePath === "README.md") {
    const renderedContent = content
      .replace(/^# YSS Spec Project Template/m, `# ${variables.projectName}`)
      .replace(
        /^> Matt Pocock Engineering Skills/m,
        `> 默认 Issue Tracker：${variables.issueTracker}\n>\n> Matt Pocock Engineering Skills`,
      );

    if (!variables.includeExampleDocs) {
      return renderedContent.replace(
        /^\| \[docs\/discovery\/IDEATION\.md\]\(\.\/docs\/discovery\/IDEATION\.md\) \|.*\r?\n/m,
        "",
      );
    }

    return renderedContent;
  }

  return content;
}

function buildCopyPlan(
  sourceDir,
  targetDir,
  variables,
  relativeDir = "",
  mode = "managed",
) {
  const operations = [];
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!relativeDir && shouldSkipRootEntry(entry.name, mode)) {
      continue;
    }

    const bundledRelativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;
    const relativePath = logicalTemplatePath(bundledRelativePath);

    if (shouldExcludeRelativePath(relativePath, mode)) {
      continue;
    }

    if (!variables.includeExampleDocs && EXAMPLE_DOC_PATHS.has(relativePath)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPathValue = targetPath(targetDir, relativePath);

    if (entry.isDirectory()) {
      operations.push({ type: "mkdir", relativePath, targetPath: targetPathValue });
      operations.push(
        ...buildCopyPlan(
          sourcePath,
          targetDir,
          variables,
          bundledRelativePath,
          mode,
        ),
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    operations.push({
      type: RENDERED_RELATIVE_PATHS.has(relativePath) ? "render" : "copy",
      relativePath,
      sourcePath,
      targetPath: targetPathValue,
    });
  }

  return operations;
}

function fileHash(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function pathKind(absolutePath) {
  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
  if (stat.isDirectory()) {
    return "directory";
  }
  if (stat.isFile()) {
    return "file";
  }
  return "other";
}

function pathContentHash(absolutePath) {
  const kind = pathKind(absolutePath);
  if (kind === "file") {
    return fileHash(absolutePath);
  }
  if (kind === "directory") {
    return treeHash(absolutePath);
  }
  if (kind === "missing") {
    return null;
  }
  return sha256(`${kind}:${fs.realpathSync(absolutePath)}`);
}

function pathsEqual(leftPath, rightPath) {
  const leftKind = pathKind(leftPath);
  const rightKind = pathKind(rightPath);
  return leftKind === rightKind &&
    leftKind !== "missing" &&
    pathContentHash(leftPath) === pathContentHash(rightPath);
}

function buildDesiredManagedFile(operation, metadata) {
  const variables = buildSyncVariables(metadata);
  if (operation.type === "render") {
    const desiredContent = renderTemplateFile(
      operation.relativePath,
      fs.readFileSync(operation.sourcePath, "utf8"),
      variables,
    );
    return {
      ...operation,
      desiredContent,
      desiredHash: sha256(desiredContent),
    };
  }

  return {
    ...operation,
    desiredContent: fs.readFileSync(operation.sourcePath),
    desiredHash: fileHash(operation.sourcePath),
  };
}

function buildSyncVariables(metadata) {
  const variables = metadata.variables || {};
  return {
    projectName: variables.projectName || "待补充",
    businessDomain: variables.businessDomain || "待补充",
    teamSize: variables.teamSize || "待补充",
    issueTracker: variables.issueTracker || "github",
    includeExampleDocs:
      variables.includeExampleDocs === undefined
        ? true
        : Boolean(variables.includeExampleDocs),
  };
}

function buildDesiredManagedOperations(targetDir, variables, mode = "managed") {
  return buildCopyPlan(BUNDLED_TEMPLATE_ROOT, targetDir, variables, "", mode)
    .filter((operation) => operation.type === "copy" || operation.type === "render")
    .map((operation) => buildDesiredManagedFile(operation, { variables }));
}

function buildSyncDesiredOperations(targetDir, variables, identity) {
  return buildDesiredManagedOperations(targetDir, variables, "init").map((operation) => {
    if (
      operation.relativePath !== "yss-project.yaml" ||
      identity.state !== "valid" ||
      identity.fields.repository_mode !== "template-source"
    ) {
      return operation;
    }

    const desiredContent = identity.content.replace(
      /^repository_mode:\s*template-source$/m,
      "repository_mode: project-instance",
    );
    parseRepositoryIdentity(desiredContent);
    return {
      ...operation,
      desiredContent,
      desiredHash: sha256(desiredContent),
      identityConversion: true,
      identitySourceHash: sha256(identity.content),
    };
  });
}

function buildAttachDesiredOperations(targetDir, variables, identity) {
  return buildDesiredManagedOperations(targetDir, variables).map((operation) => {
    if (operation.relativePath !== "yss-project.yaml" || identity.state === "missing") {
      return operation;
    }

    if (identity.fields.repository_mode === "project-instance") {
      return {
        ...operation,
        desiredContent: identity.content,
        desiredHash: sha256(identity.content),
        identityPreserved: true,
      };
    }

    const desiredContent = identity.content.replace(
      /^repository_mode:\s*template-source$/m,
      "repository_mode: project-instance",
    );
    parseRepositoryIdentity(desiredContent);
    return {
      ...operation,
      desiredContent,
      desiredHash: sha256(desiredContent),
      identityConversion: true,
    };
  });
}

function managedPathPrefix(relativePath, desiredPathSet) {
  return desiredPathSet.has(relativePath) ||
    [...desiredPathSet].some((candidate) => candidate.startsWith(`${relativePath}/`));
}

function addMigrationDestination(from, to, reason, desiredPathSet, plan) {
  const fromPath = from;
  const toPath = to;
  const source = targetPath(plan.targetDir, fromPath);
  const destination = targetPath(plan.targetDir, toPath);
  if (pathKind(source) === "missing") {
    return;
  }

  if ([pathKind(source), pathKind(destination)].includes("other")) {
    plan.unsafe.push({
      path: fromPath,
      reason: `${reason}：源或目标路径是符号链接或其他不可安全判断的类型`,
    });
    return;
  }

  if (managedPathPrefix(toPath, desiredPathSet)) {
    plan.operations.push({ kind: "remove", path: fromPath, reason });
    plan.legacy.push({ action: "replace-with-template", from: fromPath, to: toPath, reason });
    return;
  }

  if (!fs.existsSync(destination)) {
    plan.operations.push({ kind: "move", from: fromPath, to: toPath, reason });
    plan.legacy.push({ action: "move", from: fromPath, to: toPath, reason });
    return;
  }

  if (pathsEqual(source, destination)) {
    plan.operations.push({ kind: "remove", path: fromPath, reason: `${reason}（新旧内容一致）` });
    plan.legacy.push({ action: "remove-duplicate", from: fromPath, to: toPath, reason });
    return;
  }

  plan.conflicts.push({ from: fromPath, to: toPath, reason: `${reason}：迁移目标已存在且内容不一致` });
  plan.legacy.push({ action: "conflict", from: fromPath, to: toPath, reason });
}

function addDirectoryMigration(from, to, reason, desiredPathSet, plan) {
  const source = targetPath(plan.targetDir, from);
  const destination = targetPath(plan.targetDir, to);
  const sourceKind = pathKind(source);
  const destinationKind = pathKind(destination);

  if (sourceKind === "missing") {
    return;
  }
  if (sourceKind !== "directory" || destinationKind === "other") {
    plan.unsafe.push({
      path: from,
      reason: `${reason}：源或目标路径不是可安全遍历的目录`,
    });
    return;
  }
  if (destinationKind === "file") {
    plan.conflicts.push({
      from,
      to,
      reason: `${reason}：迁移目标是文件而不是目录`,
    });
    plan.legacy.push({ action: "conflict", from, to, reason });
    return;
  }

  const entries = fs.readdirSync(source).filter((entry) => entry !== ".DS_Store");
  if (entries.length === 0) {
    plan.operations.push({ kind: "remove", path: from, reason });
    plan.legacy.push({ action: "remove-empty", from, to, reason });
    return;
  }

  for (const entry of entries) {
    const childFrom = `${from}/${entry}`;
    const childTo = `${to}/${entry}`;
    if (pathKind(targetPath(plan.targetDir, childFrom)) === "directory") {
      addDirectoryMigration(childFrom, childTo, reason, desiredPathSet, plan);
    } else {
      addMigrationDestination(childFrom, childTo, reason, desiredPathSet, plan);
    }
  }

  plan.operations.push({ kind: "remove", path: from, reason });
  plan.legacy.push({ action: "remove-migrated-directory", from, to, reason });
}

function buildLegacyMigrationPlan(targetDir, desiredOperations) {
  const desiredPathSet = new Set(desiredOperations.map((operation) => operation.relativePath));
  const plan = {
    targetDir,
    operations: [],
    legacy: [],
    conflicts: [],
    unsafe: [],
  };

  for (const [oldName, newName] of LEGACY_SKILL_MAPPINGS) {
    for (const agentRoot of AGENT_SKILL_ROOTS) {
      addMigrationDestination(
        `${agentRoot}/${oldName}`,
        `${agentRoot}/${newName}`,
        `旧 skill ${oldName} 迁移为 ${newName}`,
        desiredPathSet,
        plan,
      );
    }
  }

  for (const [oldPath, newPath] of LEGACY_FILE_MAPPINGS) {
    addMigrationDestination(oldPath, newPath, "旧模板路径迁移", desiredPathSet, plan);
  }

  addDirectoryMigration(
    "docs/requirements/issues",
    "docs/requirements/tickets",
    "旧 Ticket 目录迁移",
    desiredPathSet,
    plan,
  );

  const requirementsPath = targetPath(targetDir, "docs/requirements");
  if (fs.existsSync(requirementsPath) && pathKind(requirementsPath) === "directory") {
    for (const entry of fs.readdirSync(requirementsPath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith("-prd.md")) {
        const oldPath = `docs/requirements/${entry.name}`;
        const newPath = `docs/requirements/${entry.name.replace(/-prd\.md$/, "-spec.md")}`;
        addMigrationDestination(oldPath, newPath, "旧规格文件名迁移", desiredPathSet, plan);
      }
    }
  }

  const legacyScratch = targetPath(targetDir, ".scratch");
  if (fs.existsSync(legacyScratch) && pathKind(legacyScratch) === "directory") {
    for (const entry of fs.readdirSync(legacyScratch, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const oldPath = `.scratch/${entry.name}`;
      const newPath = `docs/.scratch/${entry.name}`;
      addMigrationDestination(oldPath, newPath, "根 scratch 目录迁移", desiredPathSet, plan);
    }
  }

  for (const legacyDirectory of [
    "docs/requirements/tickets",
  ]) {
    const directoryPath = targetPath(targetDir, legacyDirectory);
    if (!fs.existsSync(directoryPath) || pathKind(directoryPath) !== "directory") {
      continue;
    }

    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    const unsafeEntries = entries.filter(
      (entry) => entry.name !== ".gitkeep" && entry.name !== ".DS_Store",
    );
    if (unsafeEntries.length > 0) {
      for (const entry of unsafeEntries) {
        plan.unsafe.push({
          path: `${legacyDirectory}/${entry.name}`,
          reason: "扁平 Ticket 无法可靠推断功能归属，不能自动迁移",
        });
      }
      continue;
    }

    if (desiredPathSet.has(`${legacyDirectory}/.gitkeep`)) {
      continue;
    }

    plan.operations.push({
      kind: "remove",
      path: legacyDirectory,
      reason: "删除空的旧 Ticket 目录",
    });
    plan.legacy.push({ action: "remove-empty", from: legacyDirectory, to: null, reason: "旧 Ticket 目录为空" });
  }

  return plan;
}

function classifyAttachPlan(targetDir, variables) {
  const identity = readTargetIdentity(targetDir);
  const desiredOperations = buildAttachDesiredOperations(targetDir, variables, identity);
  const plan = {
    targetDir,
    identityInfo: identity,
    desiredOperations,
    missing: [],
    matched: [],
    identity: [],
    conflicts: [],
    unsafe: [],
    migration: buildLegacyMigrationPlan(targetDir, desiredOperations),
  };

  for (const operation of desiredOperations) {
    const kind = pathKind(operation.targetPath);
    if (kind === "missing") {
      plan.missing.push(operation);
      continue;
    }

    if (kind !== "file") {
      plan.unsafe.push({
        ...operation,
        reason: `目标路径类型为 ${kind}，无法安全判断是否可以替换`,
      });
      continue;
    }

    const currentHash = fileHash(operation.targetPath);
    if (currentHash === operation.desiredHash) {
      plan.matched.push(operation);
    } else if (operation.identityConversion) {
      plan.identity.push(operation);
    } else {
      plan.conflicts.push({
        ...operation,
        reason: "目标受管文件已存在且内容不一致",
      });
    }
  }

  return plan;
}

function classifySyncPlan(targetDir, metadata, identity = readTargetIdentity(targetDir)) {
  const managedFiles = metadata.managedFiles || {};
  const variables = buildSyncVariables(metadata);
  const desiredOperations = buildSyncDesiredOperations(targetDir, variables, identity);
  const updated = [];
  const added = [];
  const unchanged = [];
  const skipped = [];
  const conflicts = [];
  const forceableConflicts = [];
  const unsafe = [];

  for (const operation of desiredOperations) {
    const existingRecord = managedFiles[operation.relativePath];
    const existingKind = pathKind(operation.targetPath);

    if (existingKind === "missing") {
      added.push(operation);
      continue;
    }

    if (existingKind !== "file") {
      unsafe.push({
        ...operation,
        reason: `目标路径类型为 ${existingKind}，无法安全判断是否可以替换`,
      });
      continue;
    }

    const currentHash = fileHash(operation.targetPath);
    if (
      operation.identityConversion &&
      currentHash === operation.identitySourceHash
    ) {
      updated.push(operation);
      continue;
    }
    if (!existingRecord) {
      if (currentHash === operation.desiredHash) {
        unchanged.push(operation);
      } else {
        const conflict = {
          ...operation,
          reason: "文件已存在，但不在受管模板文件基线中",
        };
        conflicts.push(conflict);
        skipped.push(conflict);
      }
      continue;
    }

    if (currentHash === operation.desiredHash) {
      unchanged.push(operation);
      continue;
    }

    if (currentHash !== existingRecord.contentHash) {
      const conflict = {
        ...operation,
        reason: "检测到本地已修改的受管文件",
      };
      conflicts.push(conflict);
      forceableConflicts.push(conflict);
      skipped.push(conflict);
      continue;
    }

    updated.push(operation);
  }

  const desiredPathSet = new Set(desiredOperations.map((operation) => operation.relativePath));
  const removed = Object.keys(managedFiles).filter((relativePath) => !desiredPathSet.has(relativePath));

  return {
    updated,
    added,
    unchanged,
    skipped,
    conflicts,
    forceableConflicts,
    unsafe,
    removed,
    desiredOperations,
  };
}

function collectManagedFiles(desiredOperations, targetDir) {
  const managedFiles = {};
  for (const operation of desiredOperations) {
    if (pathKind(operation.targetPath) !== "file") {
      continue;
    }
    managedFiles[operation.relativePath] = {
      type: operation.type,
      contentHash: fileHash(operation.targetPath),
    };
  }
  return managedFiles;
}

function buildMetadata(variables, desiredOperations, targetDir, timestamp = nowIsoString()) {
  return {
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    templateName: PACKAGE_MANIFEST.name,
    cliVersion: PACKAGE_MANIFEST.version,
    templateVersion: PACKAGE_MANIFEST.version,
    templateSource: getTemplateSource(),
    templateCommit: readTemplateSnapshot().templateCommit,
    initializedAt: timestamp,
    lastSyncedAt: timestamp,
    managedFilesManifestVersion: TEMPLATE_MANIFEST_VERSION,
    variables: {
      projectName: variables.projectName,
      businessDomain: variables.businessDomain,
      teamSize: variables.teamSize,
      issueTracker: variables.issueTracker,
      includeExampleDocs: variables.includeExampleDocs,
    },
    managedFiles: collectManagedFiles(desiredOperations, targetDir),
  };
}

function writeTemplateMetadata(targetDir, metadata, transaction = null) {
  const metadataPath = targetPath(targetDir, TEMPLATE_METADATA_FILENAME);
  const content = `${JSON.stringify(metadata, null, 2)}\n`;
  if (transaction) {
    transaction.writeFile(metadataPath, content);
    return;
  }
  fs.writeFileSync(metadataPath, content, "utf8");
}

function inspectTargetDir(targetDir, force) {
  if (isInsideTemplateRoot(targetDir)) {
    throw new Error("目标目录不能位于模板源仓库内部");
  }

  if (!fs.existsSync(targetDir)) {
    return { exists: false, clearEntries: false };
  }

  if (pathKind(targetDir) !== "directory") {
    throw new Error("目标目录必须是目录");
  }

  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error("目标目录非空，当前主路径不支持覆盖已有内容");
  }

  return { exists: true, clearEntries: entries.length > 0 && force };
}

function inspectExistingTargetDir(targetDir) {
  if (isInsideTemplateRoot(targetDir)) {
    throw new Error("目标目录不能位于模板源仓库内部");
  }
  if (!fs.existsSync(targetDir) || pathKind(targetDir) !== "directory") {
    throw new Error("attach 目标目录必须是已经存在的项目目录");
  }
}

function prepareTargetDir(targetDir, targetState) {
  if (!targetState.exists) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  if (!targetState.clearEntries) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir)) {
    fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
  }
}

function writeFileWithMode(targetFile, content, mode = null) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content);
  if (mode !== null) {
    fs.chmodSync(targetFile, mode & 0o777);
  }
}

function executePlan(operations, variables) {
  for (const operation of operations) {
    if (operation.type === "mkdir") {
      fs.mkdirSync(operation.targetPath, { recursive: true });
      continue;
    }

    if (operation.type === "render") {
      const renderedContent = renderTemplateFile(
        operation.relativePath,
        fs.readFileSync(operation.sourcePath, "utf8"),
        variables,
      );
      writeFileWithMode(
        operation.targetPath,
        renderedContent,
        fs.statSync(operation.sourcePath).mode,
      );
      continue;
    }

    fs.mkdirSync(path.dirname(operation.targetPath), { recursive: true });
    fs.copyFileSync(operation.sourcePath, operation.targetPath);
    fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
  }
}

function initializeGitRepository(targetDir) {
  const result = spawnSync("git", ["init"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git init 执行失败");
  }
}

function runTemplateVerification(targetDir, scriptPath) {
  const commandPath = targetPath(targetDir, scriptPath);
  const result = spawnSync(commandPath, ["--check"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("");
  if (output) {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  if (result.status !== 0) {
    const detail = result.error?.message || output.trim();
    throw new Error(`生成项目校验失败：${scriptPath}${detail ? `\n${detail}` : ""}`);
  }
}

function verifyGeneratedTemplate(targetDir, mode = "managed") {
  if (mode === "init") {
    verifyGeneratedInstance(targetDir);
    return;
  }

  for (const scriptPath of [
    "scripts/sync-skills",
    "scripts/update-skill-lock",
    "scripts/verify-template",
  ]) {
    runTemplateVerification(targetDir, scriptPath);
  }
}

function verifyGeneratedInstance(targetDir) {
  const forbiddenPaths = [
    ...INSTANCE_FORBIDDEN_ROOT_PATHS,
    ...[...INIT_EXCLUDED_ROOT_ENTRIES],
    ...[...INIT_EXCLUDED_ROOT_FILES],
    ...[...INIT_EXCLUDED_RELATIVE_PATHS],
    ...[...EXCLUDED_RELATIVE_PATHS],
  ];
  for (const relativePath of forbiddenPaths) {
    if (pathKind(targetPath(targetDir, relativePath)) !== "missing") {
      throw new Error(`初始化结果包含禁止分发的模板源资产：${relativePath}`);
    }
  }

  const identity = readTargetIdentity(targetDir);
  if (
    identity.state !== "valid" ||
    identity.fields.repository_mode !== "project-instance"
  ) {
    throw new Error("初始化结果的 yss-project.yaml 必须是 project-instance");
  }

  const agentsContent = fs.readFileSync(targetPath(targetDir, "AGENTS.md"), "utf8");
  const readmeContent = fs.readFileSync(targetPath(targetDir, "README.md"), "utf8");
  if (agentsContent.includes("[填写]") || readmeContent.includes("[填写]")) {
    throw new Error("初始化结果仍包含模板占位信息");
  }
}

function loadTemplateMetadata(targetDir) {
  const metadataPath = targetPath(targetDir, TEMPLATE_METADATA_FILENAME);
  const metadataKind = pathKind(metadataPath);
  if (metadataKind === "missing") {
    throw new Error(
      `当前目录不是受支持的模板实例仓库，缺少模板元数据文件 ${TEMPLATE_METADATA_FILENAME}；请先使用 attach`,
    );
  }
  if (metadataKind !== "file") {
    throw new Error("模板元数据不能是符号链接或其他特殊文件");
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch (error) {
    throw new Error(`模板元数据无法解析：${error.message}`);
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("模板元数据必须是 JSON 对象");
  }
  if (
    metadata.metadataSchemaVersion !== undefined &&
    (!Number.isInteger(metadata.metadataSchemaVersion) ||
      metadata.metadataSchemaVersion < 1)
  ) {
    throw new Error("模板元数据 metadataSchemaVersion 必须是正整数");
  }
  if (metadata.metadataSchemaVersion > METADATA_SCHEMA_VERSION) {
    throw new Error(`不支持的模板元数据版本：${metadata.metadataSchemaVersion}`);
  }
  if (
    metadata.managedFiles !== undefined &&
    (typeof metadata.managedFiles !== "object" ||
      metadata.managedFiles === null ||
      Array.isArray(metadata.managedFiles))
  ) {
    throw new Error("模板元数据 managedFiles 必须是 JSON 对象");
  }

  if (metadata.metadataSchemaVersion === METADATA_SCHEMA_VERSION) {
    if (metadata.templateName !== PACKAGE_MANIFEST.name) {
      throw new Error("模板元数据 templateName 与当前 CLI 不匹配");
    }
    if (typeof metadata.cliVersion !== "string" || !metadata.cliVersion) {
      throw new Error("模板元数据 cliVersion 缺失或非法");
    }
    if (metadata.templateSource !== TEMPLATE_SOURCE) {
      throw new Error("模板元数据 templateSource 缺失或非法");
    }
    if (!/^[0-9a-f]{40}$/.test(metadata.templateCommit || "")) {
      throw new Error("模板元数据必须包含 40 位不可变 templateCommit");
    }
    if (!/^[0-9a-f]{64}$/.test(metadata.managedFilesManifestVersion || "")) {
      throw new Error("模板元数据 managedFilesManifestVersion 缺失或非法");
    }
    if (
      typeof metadata.variables !== "object" ||
      metadata.variables === null ||
      Array.isArray(metadata.variables)
    ) {
      throw new Error("模板元数据 variables 必须是 JSON 对象");
    }
  }

  return { metadataPath, metadata };
}

function gitDirtyWarning(targetDir) {
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  if (probe.status !== 0 || probe.stdout.trim() !== "true") {
    return null;
  }
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: targetDir,
    encoding: "utf8",
  });
  if (status.status === 0 && status.stdout.trim()) {
    return "警告：目标 Git worktree 存在未提交改动；CLI 不会自动 stash 或提交，请在结果后检查 git diff / git status";
  }
  return null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function copyPath(sourcePath, destinationPath) {
  const kind = pathKind(sourcePath);
  if (kind === "other") {
    throw new Error(`拒绝复制符号链接或特殊文件：${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (kind === "directory") {
    fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(sourcePath, destinationPath);
  if (kind === "file") {
    fs.chmodSync(destinationPath, fs.statSync(sourcePath).mode & 0o777);
  }
}

class Transaction {
  constructor(targetDir) {
    this.targetDir = targetDir;
    this.backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-backup-"));
    this.backups = [];
    this.mutated = [];
    this.createdDirectories = [];
  }

  relative(absolutePath) {
    return normalizeRelativePath(path.relative(this.targetDir, absolutePath));
  }

  backupPath(relativePath) {
    return path.join(this.backupRoot, relativePath);
  }

  prepare(relativePaths) {
    const candidates = [...new Set(relativePaths)]
      .map((relativePath) => normalizeRelativePath(relativePath))
      .filter((relativePath) => relativePath && pathKind(targetPath(this.targetDir, relativePath)) !== "missing")
      .sort((left, right) => left.split("/").length - right.split("/").length);

    for (const relativePath of candidates) {
      if (this.backups.some((backup) =>
        relativePath === backup.relativePath || relativePath.startsWith(`${backup.relativePath}/`))) {
        continue;
      }
      const source = targetPath(this.targetDir, relativePath);
      const destination = this.backupPath(relativePath);
      copyPath(source, destination);
      this.backups.push({ relativePath, destination });
    }
  }

  ensureParent(absolutePath) {
    const missing = [];
    let current = path.dirname(absolutePath);
    while (current !== this.targetDir && !fs.existsSync(current)) {
      missing.push(current);
      current = path.dirname(current);
    }
    if (current !== this.targetDir && pathKind(current) !== "directory") {
      throw new Error(`目标父路径不是目录：${this.relative(current)}`);
    }
    for (const directory of missing.reverse()) {
      fs.mkdirSync(directory);
      this.createdDirectories.push(this.relative(directory));
    }
  }

  mark(absolutePath) {
    this.mutated.push(this.relative(absolutePath));
  }

  writeFile(absolutePath, content) {
    this.ensureParent(absolutePath);
    fs.writeFileSync(absolutePath, content, "utf8");
    this.mark(absolutePath);
  }

  copyFile(sourcePath, destinationPath) {
    this.ensureParent(destinationPath);
    copyPath(sourcePath, destinationPath);
    this.mark(destinationPath);
  }

  remove(absolutePath) {
    if (!fs.existsSync(absolutePath)) {
      return;
    }
    fs.rmSync(absolutePath, { recursive: true, force: true });
    this.mark(absolutePath);
  }

  move(sourcePath, destinationPath) {
    this.ensureParent(destinationPath);
    copyPath(sourcePath, destinationPath);
    this.mark(destinationPath);
    this.remove(sourcePath);
  }

  rollback() {
    for (const relativePath of [...new Set(this.mutated)].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    )) {
      fs.rmSync(targetPath(this.targetDir, relativePath), { recursive: true, force: true });
    }
    for (const relativePath of [...new Set(this.createdDirectories)].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    )) {
      const directory = targetPath(this.targetDir, relativePath);
      if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
        fs.rmdirSync(directory);
      }
    }
    for (const backup of this.backups.sort(
      (left, right) => left.relativePath.split("/").length - right.relativePath.split("/").length,
    )) {
      copyPath(backup.destination, targetPath(this.targetDir, backup.relativePath));
    }
  }

  finish() {
    if (this.backups.length === 0) {
      fs.rmSync(this.backupRoot, { recursive: true, force: true });
      return null;
    }
    return this.backupRoot;
  }
}

function applyMigrationPlan(migrationPlan, transaction) {
  for (const operation of migrationPlan.operations) {
    if (operation.kind === "remove") {
      transaction.remove(targetPath(migrationPlan.targetDir, operation.path));
    } else if (operation.kind === "move") {
      transaction.move(
        targetPath(migrationPlan.targetDir, operation.from),
        targetPath(migrationPlan.targetDir, operation.to),
      );
    }
  }
}

function applyManagedOperation(operation, transaction) {
  if (operation.type === "render") {
    transaction.ensureParent(operation.targetPath);
    writeFileWithMode(
      operation.targetPath,
      operation.desiredContent,
      fs.statSync(operation.sourcePath).mode,
    );
    transaction.mark(operation.targetPath);
    return;
  }
  transaction.copyFile(operation.sourcePath, operation.targetPath);
  fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
}

function printMigrationPlan(migrationPlan) {
  for (const item of migrationPlan.legacy) {
    const destination = item.to ? ` -> ${item.to}` : "";
    console.log(`legacy: ${item.action} ${item.from}${destination}`);
  }
  for (const item of migrationPlan.unsafe) {
    console.log(`unsafe: ${item.path} (${item.reason})`);
  }
  for (const item of migrationPlan.conflicts) {
    console.log(`conflict: ${item.from} -> ${item.to} (${item.reason})`);
  }
}

function printLimitedOperations(operations, formatter, limit = 40) {
  const prioritized = [...operations].sort((left, right) => {
    const leftPath = typeof left === "string" ? left : left.relativePath;
    const rightPath = typeof right === "string" ? right : right.relativePath;
    const leftIsRoot = !leftPath.includes("/");
    const rightIsRoot = !rightPath.includes("/");
    if (leftIsRoot !== rightIsRoot) {
      return leftIsRoot ? -1 : 1;
    }
    return leftPath.localeCompare(rightPath);
  });
  for (const operation of prioritized.slice(0, limit)) {
    console.log(formatter(operation));
  }
  if (operations.length > limit) {
    console.log(`... 其余 ${operations.length - limit} 项省略，可用 manifest / git diff 查看完整清单`);
  }
}

function printAttachDryRun(plan, targetDir) {
  console.log("attach dry-run 预览");
  console.log(`目标目录：${targetDir}`);
  printLimitedOperations(plan.missing, (operation) => `add: ${operation.relativePath}`);
  printLimitedOperations(plan.identity, (operation) => `identity: ${operation.relativePath}（规范化为 project-instance）`);
  printLimitedOperations(plan.conflicts, (operation) => `conflict: ${operation.relativePath} (${operation.reason})`);
  printLimitedOperations(plan.unsafe, (operation) => `unsafe: ${operation.relativePath} (${operation.reason})`);
  if (plan.matched.length > 0) {
    console.log(`matched: ${plan.matched.length} 项内容一致，已纳入 managed baseline`);
  }
  printMigrationPlan(plan.migration);
  console.log(`统计：新增 ${plan.missing.length}，一致 ${plan.matched.length}，身份转换 ${plan.identity.length}，冲突 ${plan.conflicts.length}，unsafe ${plan.unsafe.length}`);
  if (plan.conflicts.length > 0) {
    console.log("提示：apply 需要显式传入 --force 才能覆盖冲突受管文件");
  }
}

function printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan) {
  console.log("sync dry-run 预览");
  console.log(`目标目录：${targetDir}`);
  console.log(
    `模板版本：${metadata.templateVersion || metadata.cliVersion || "unknown"} -> ${PACKAGE_MANIFEST.version}`,
  );
  printLimitedOperations(syncPlan.updated, (operation) => `update: ${operation.relativePath}`);
  printLimitedOperations(syncPlan.added, (operation) => `add: ${operation.relativePath}`);
  printLimitedOperations(syncPlan.skipped, (operation) => `conflict: ${operation.relativePath} (${operation.reason})`);
  printLimitedOperations(syncPlan.unsafe, (operation) => `unsafe: ${operation.relativePath} (${operation.reason})`);
  printLimitedOperations(syncPlan.removed, (relativePath) => `remove-report: ${relativePath}`);
  console.log(`unchanged: ${syncPlan.unchanged.length}`);
  printMigrationPlan(migrationPlan);
}

function buildNextSyncMetadata(metadata, syncPlan, targetDir) {
  const nextManagedFiles = { ...(metadata.managedFiles || {}) };
  for (const relativePath of syncPlan.removed) {
    delete nextManagedFiles[relativePath];
  }
  for (const operation of syncPlan.desiredOperations) {
    if (pathKind(operation.targetPath) !== "file") {
      continue;
    }
    const currentHash = fileHash(operation.targetPath);
    if (currentHash === operation.desiredHash) {
      nextManagedFiles[operation.relativePath] = {
        type: operation.type,
        contentHash: operation.desiredHash,
      };
    }
  }

  return {
    ...metadata,
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    templateName: PACKAGE_MANIFEST.name,
    cliVersion: PACKAGE_MANIFEST.version,
    templateVersion: PACKAGE_MANIFEST.version,
    templateSource: getTemplateSource(),
    templateCommit: readTemplateSnapshot().templateCommit,
    lastSyncedAt: nowIsoString(),
    managedFilesManifestVersion: TEMPLATE_MANIFEST_VERSION,
    managedFiles: nextManagedFiles,
  };
}

function affectedPathsForManagedOperations(operations) {
  return operations.map((operation) => normalizeRelativePath(operation.relativePath));
}

function affectedPathsForMigration(migrationPlan) {
  return migrationPlan.operations.flatMap((operation) =>
    operation.kind === "move" ? [operation.from, operation.to] : [operation.path],
  );
}

function attachVariables(options) {
  return {
    projectName: options.projectName,
    businessDomain: options.businessDomain,
    teamSize: options.teamSize || "待补充",
    issueTracker: options.issueTracker || "github",
    includeExampleDocs:
      options.includeExampleDocs === undefined
        ? true
        : Boolean(options.includeExampleDocs),
  };
}

function runInit(argv = []) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (options.version) {
    printVersion();
    return;
  }
  return promptForMissingOptions(options).then((promptedOptions) => {
    assertRequiredOptions(promptedOptions, "init");
    readTemplateSnapshot();
    const targetDir = normalizeTargetDir(promptedOptions.targetDir);
    const targetState = inspectTargetDir(targetDir, promptedOptions.force);
    const operations = buildCopyPlan(
      BUNDLED_TEMPLATE_ROOT,
      targetDir,
      promptedOptions,
      "",
      "init",
    );

    if (promptedOptions.dryRun) {
      console.log("dry-run 预览");
      console.log(`输出目录：${targetDir}`);
      for (const operation of operations) {
        console.log(`${operation.type}: ${operation.relativePath}`);
      }
      return;
    }

    prepareTargetDir(targetDir, targetState);
    executePlan(operations, promptedOptions);
    verifyGeneratedTemplate(targetDir, "init");
    writeTemplateMetadata(
      targetDir,
      buildMetadata(promptedOptions, operations.filter((operation) => operation.type !== "mkdir"), targetDir),
    );

    if (promptedOptions.gitInit) {
      initializeGitRepository(targetDir);
    }

    console.log("初始化完成");
    console.log(`输出目录：${targetDir}`);
    console.log("下一步建议：");
    console.log(`1. cd ${targetDir}`);
    console.log(
      promptedOptions.gitInit
        ? "2. 运行 git status 检查初始化结果"
        : "2. 如需版本管理，可执行 git init",
    );
    console.log("3. 检查 AGENTS.md、README 和 docs 目录是否符合预期");
  });
}

function runAttach(argv = []) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (options.version) {
    printVersion();
    return;
  }
  assertRequiredOptions(options, "attach");
  if (options.dryRun && options.apply) {
    throw new Error("attach 的 --dry-run 与 --apply 互斥");
  }
  if (!options.dryRun && !options.apply) {
    throw new Error("attach 必须显式传入 --dry-run 或 --apply");
  }

  readTemplateSnapshot();
  const targetDir = normalizeTargetDir(options.targetDir);
  inspectExistingTargetDir(targetDir);
  if (pathKind(targetPath(targetDir, TEMPLATE_METADATA_FILENAME)) !== "missing") {
    throw new Error("当前项目已有模板元数据，请使用 sync，不要重复 attach");
  }

  const variables = attachVariables(options);
  const plan = classifyAttachPlan(targetDir, variables);
  const warning = gitDirtyWarning(targetDir);
  if (warning) {
    console.log(warning);
  }

  if (options.dryRun) {
    printAttachDryRun(plan, targetDir);
    return;
  }

  if (plan.migration.unsafe.length > 0) {
    printMigrationPlan(plan.migration);
    throw new Error("attach 被 unsafe 迁移项阻断；--force 不能绕过，请先人工整理 Ticket 归属");
  }
  if (plan.unsafe.length > 0) {
    printAttachDryRun(plan, targetDir);
    throw new Error("attach 被 unsafe 受管路径阻断；--force 不能绕过，请先人工整理目标路径");
  }
  if (plan.migration.conflicts.length > 0) {
    printMigrationPlan(plan.migration);
    throw new Error("attach 被旧路径迁移冲突阻断，请先处理目标冲突");
  }
  if (plan.conflicts.length > 0 && !options.force) {
    printAttachDryRun(plan, targetDir);
    throw new Error("attach 检测到受管文件冲突；请先 dry-run，再使用 --apply --force");
  }

  const managedToApply = [
    ...plan.missing,
    ...plan.identity,
    ...(options.force ? plan.conflicts : []),
  ];
  const transaction = new Transaction(targetDir);

  try {
    transaction.prepare([
      ...affectedPathsForManagedOperations(managedToApply),
      ...affectedPathsForMigration(plan.migration),
      TEMPLATE_METADATA_FILENAME,
    ]);
    for (const operation of managedToApply) {
      applyManagedOperation(operation, transaction);
    }
    applyMigrationPlan(plan.migration, transaction);
    verifyGeneratedTemplate(targetDir);
    writeTemplateMetadata(
      targetDir,
      buildMetadata(
        variables,
        plan.desiredOperations,
        targetDir,
      ),
      transaction,
    );
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new Error(`${error.message}\n回滚失败：${rollbackError.message}`);
    }
    throw new Error(`${error.message}\n已回滚本次 attach；临时备份保留于 ${transaction.backupRoot}`);
  }

  const backupPath = transaction.finish();
  console.log("接管完成");
  console.log(`目标目录：${targetDir}`);
  console.log(`新增研发管理资产：${plan.missing.length + plan.identity.length}`);
  if (plan.conflicts.length > 0) {
    console.log(`force 覆盖冲突：${plan.conflicts.length}`);
  }
  if (backupPath) {
    console.log(`备份目录：${backupPath}`);
    console.log(`清理命令：rm -rf ${shellQuote(backupPath)}`);
  }
  console.log("下一步建议：运行 git diff 或 git status 检查接管结果");
}

function runSync(argv = []) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (options.version) {
    printVersion();
    return;
  }
  readTemplateSnapshot();
  const targetDir = normalizeTargetDir(options.targetDir || ".");
  inspectExistingTargetDir(targetDir);
  const { metadata } = loadTemplateMetadata(targetDir);
  const identity = readTargetIdentity(targetDir);
  const syncPlan = classifySyncPlan(targetDir, metadata, identity);
  const migrationPlan = buildLegacyMigrationPlan(targetDir, syncPlan.desiredOperations);
  const warning = gitDirtyWarning(targetDir);
  if (warning) {
    console.log(warning);
  }

  if (options.dryRun) {
    printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan);
    return;
  }
  if (migrationPlan.unsafe.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error("sync 被 unsafe 迁移项阻断；请先人工整理 Ticket 归属");
  }
  if (syncPlan.unsafe.length > 0) {
    printSyncDryRun(targetDir, metadata, syncPlan, migrationPlan);
    throw new Error("sync 被 unsafe 受管路径阻断；--force 不能绕过，请先人工整理目标路径");
  }
  if (migrationPlan.conflicts.length > 0) {
    printMigrationPlan(migrationPlan);
    throw new Error("sync 被旧路径迁移冲突阻断，请先处理目标冲突");
  }

  const managedToApply = [
    ...syncPlan.updated,
    ...syncPlan.added,
    ...(options.force ? syncPlan.forceableConflicts : []),
  ];
  const transaction = new Transaction(targetDir);

  try {
    transaction.prepare([
      ...affectedPathsForManagedOperations(managedToApply),
      ...affectedPathsForMigration(migrationPlan),
      TEMPLATE_METADATA_FILENAME,
    ]);
    for (const operation of managedToApply) {
      applyManagedOperation(operation, transaction);
    }
    applyMigrationPlan(migrationPlan, transaction);
    verifyGeneratedTemplate(targetDir, "init");
    writeTemplateMetadata(
      targetDir,
      buildNextSyncMetadata(metadata, syncPlan, targetDir),
      transaction,
    );
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new Error(`${error.message}\n回滚失败：${rollbackError.message}`);
    }
    throw new Error(`${error.message}\n已回滚本次 sync；临时备份保留于 ${transaction.backupRoot}`);
  }

  const backupPath = transaction.finish();
  console.log("同步完成");
  console.log(`模板版本：${metadata.templateVersion || metadata.cliVersion || "unknown"} -> ${PACKAGE_MANIFEST.version}`);
  console.log(`自动更新：${syncPlan.updated.length}`);
  console.log(`新增文件：${syncPlan.added.length}`);
  console.log(`跳过文件：${syncPlan.skipped.length}`);
  console.log(`删除差异：${syncPlan.removed.length}`);
  if (syncPlan.skipped.length > 0) {
    console.log("本地已修改，已跳过：");
    for (const operation of syncPlan.skipped) {
      console.log(`- ${operation.relativePath}: ${operation.reason}`);
    }
  }
  if (syncPlan.removed.length > 0) {
    console.log("模板已移除但未自动删除：");
    for (const relativePath of syncPlan.removed) {
      console.log(`- ${relativePath}`);
    }
  }
  if (backupPath) {
    console.log(`备份目录：${backupPath}`);
    console.log(`清理命令：rm -rf ${shellQuote(backupPath)}`);
  }
  console.log("下一步建议：");
  console.log("1. 运行 git diff 或 git status 检查同步结果");
  console.log("2. 人工处理被跳过文件和删除差异（如有）");
  console.log("3. 确认无误后提交本次模板同步结果");
}

function argvIncludesFlag(argv, flags) {
  return argv.some((arg) => flags.has(arg));
}

function printVersion() {
  console.log(`create-yss-spec ${PACKAGE_MANIFEST.version}`);
}

function printHelp() {
  console.log(`create-yss-spec ${PACKAGE_MANIFEST.version}

USAGE
  $ create-yss-spec [COMMAND] [OPTIONS]

COMMANDS
  (default)  初始化新的模板实例仓库
  attach     向已有项目补齐受管研发管理资产
  sync       同步已有模板实例的受管资产

OPTIONS
  --project-name <name>              项目名称；init 不传则进入交互输入
  --business-domain <domain>         业务领域；init 不传则进入交互输入
  --team-size <size>                 团队规模；init 不传则可留空，默认「待补充」
  --target-dir <dir>                 目标目录；init 不传则进入交互输入，sync 默认为当前目录
  --issue-tracker github|gitlab      默认 issue tracker 偏好（默认 github）
  --dry-run                          只预览计划，不写入文件
  --apply                            attach 确认执行写入；不能与 --dry-run 同时使用
  --force                            init：允许清空非空目录后重新生成
                                     attach / sync：覆盖受管冲突文件；unsafe 路径始终阻断
  --git-init                         初始化完成后执行 git init
  --include-example-docs             显式保留示例文档（默认开启）
  --no-example-docs                  不生成示例文档
  -h, --help                         显示本帮助信息
  -v, --version                      显示 CLI 版本

EXAMPLES
  $ npm create yss-spec@latest
  $ npx create-yss-spec@latest --help
  $ npx create-yss-spec@latest --version
  $ npx create-yss-spec@latest \\
      --project-name "Acme Spec Repo" \\
      --business-domain "Investment Research" \\
      --team-size "12" \\
      --target-dir "./acme-spec-repo" \\
      --issue-tracker github \\
      --git-init
  $ npx create-yss-spec@latest \\
      --project-name "Preview Repo" \\
      --business-domain "Data Platform" \\
      --target-dir "./preview-repo" \\
      --dry-run
  $ npx create-yss-spec@latest attach \\
      --target-dir . \\
      --project-name "Acme Application" \\
      --business-domain "Data Platform" \\
      --dry-run
  $ npx create-yss-spec@latest attach \\
      --target-dir . \\
      --project-name "Acme Application" \\
      --business-domain "Data Platform" \\
      --apply
  $ npx create-yss-spec@latest sync
  $ npx create-yss-spec@latest sync --dry-run
  $ npx create-yss-spec@latest sync --target-dir . --force

LEARN MORE
  仓库 README：https://github.com/iloveZzz/create-yss-spec#readme
  使用手册：https://github.com/iloveZzz/create-yss-spec/blob/main/docs/user-guide/create-yss-spec-cli-guide.md
  模板仓库：https://github.com/iloveZzz/yss-spec-project-template
`);
}

async function runCli(argv = []) {
  if (argvIncludesFlag(argv, HELP_FLAGS)) {
    printHelp();
    return;
  }
  if (argvIncludesFlag(argv, VERSION_FLAGS)) {
    printVersion();
    return;
  }
  if (argv[0] === "sync") {
    runSync(argv.slice(1));
    return;
  }
  if (argv[0] === "attach") {
    runAttach(argv.slice(1));
    return;
  }
  await runInit(argv);
}

module.exports = {
  runCli,
};
