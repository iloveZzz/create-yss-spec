"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { treeHash } = require("../template-hash");
const { targetPath, pathKind, normalizeRelativePath } = require("../filesystem/path-utils");
const { validateTemplateSnapshot } = require("../validation/snapshot");
const { validateTemplateMetadata } = require("../validation/metadata");
const { distributionForVariables, isIncludedInstancePath, selectedSkillLock, renderInstanceSkillSupplyChain, renderInstanceDesignSkillFile } = require("./distribution-runtime");
const {
  extractManagedGitignoreBlock,
  mergeManagedGitignoreBlock,
  markerState,
} = require("./gitignore-section");
const {
  parseRepositoryIdentity,
  convertTemplateSourceToInstance,
} = require("../validation/identity");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const PACKAGE_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
);
const BUNDLED_TEMPLATE_ROOT = path.join(PACKAGE_ROOT, "template");
const BUNDLED_MANIFEST_PATH = path.join(PACKAGE_ROOT, "template.manifest.json");
const BUNDLED_SNAPSHOT_PATH = path.join(PACKAGE_ROOT, "template.snapshot.json");
const TEMPLATE_MANIFEST_TEXT = fs.readFileSync(BUNDLED_MANIFEST_PATH, "utf8");
const TEMPLATE_MANIFEST = JSON.parse(TEMPLATE_MANIFEST_TEXT);
const TEMPLATE_METADATA_FILENAME = ".yss-template.json";
const TEMPLATE_SOURCE = "github:iloveZzz/yss-spec-project-template";
const METADATA_SCHEMA_VERSION = 3;

const ROOT_EXCLUDED_ENTRIES = new Set(TEMPLATE_MANIFEST.excludeRootEntries);
const ROOT_EXCLUDED_FILES = new Set(TEMPLATE_MANIFEST.excludeRootFiles);
const EXCLUDED_RELATIVE_PATHS = new Set(TEMPLATE_MANIFEST.excludePaths);
const ALLOWED_RELATIVE_PATHS = new Set(TEMPLATE_MANIFEST.allowFiles || []);
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const TEMPLATE_MANIFEST_VERSION = sha256(TEMPLATE_MANIFEST_TEXT);

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

  return validateTemplateSnapshot(snapshot, {
    manifestHash: TEMPLATE_MANIFEST_VERSION,
    treeHash: treeHash(BUNDLED_TEMPLATE_ROOT),
  });
}

function logicalPathMap(snapshot) {
  return new Map(
    Object.entries(snapshot.encodedPaths || {}).map(([logicalPath, encodedPath]) => [
      normalizeRelativePath(encodedPath),
      normalizeRelativePath(logicalPath),
    ]),
  );
}

function logicalTemplatePath(bundledPath, bundledPathToLogicalPath) {
  return (
    bundledPathToLogicalPath.get(normalizeRelativePath(bundledPath)) ||
    normalizeRelativePath(bundledPath)
  );
}

function shouldExcludeRelativePath(relativePath, mode = "managed") {
  const normalized = normalizeRelativePath(relativePath);
  if (
    [...ALLOWED_RELATIVE_PATHS].some(
      (allowedPath) =>
        allowedPath === normalized || allowedPath.startsWith(`${normalized}/`),
    )
  ) {
    return false;
  }
  return (
    EXCLUDED_RELATIVE_PATHS.has(normalized) ||
    (mode === "init" &&
      (INIT_EXCLUDED_RELATIVE_PATHS.has(normalized) ||
        INIT_EXCLUDED_ROOT_FILES.has(normalized)))
  );
}

function shouldSkipRootEntry(entryName, mode = "managed") {
  return (
    ROOT_EXCLUDED_ENTRIES.has(entryName) ||
    ROOT_EXCLUDED_FILES.has(entryName) ||
    (mode === "init" &&
      (INIT_EXCLUDED_ROOT_ENTRIES.has(entryName) ||
        INIT_EXCLUDED_ROOT_FILES.has(entryName)))
  );
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
  const distribution = variables.distribution || distributionForVariables(variables, BUNDLED_TEMPLATE_ROOT);
  if (relativePath === "skills-lock.json") return selectedSkillLock(content, distribution);
  if (relativePath === "scripts/lib/skill-supply-chain.mjs" && distribution.mode === "selected") return renderInstanceSkillSupplyChain(content);
  if (distribution.mode === "selected" && /^\.(agents|codex|cursor|pi)\/skills\/yss-design-system\/(SKILL\.md|references\/data-quality-theme\.md)$/.test(relativePath)) return renderInstanceDesignSkillFile(content);
  if (relativePath === "docs/engineering/backend-platforms.json" && distribution.mode === "selected") {
    return content.replaceAll(".template-source/evidence/maintenance/2026-09-18-yss-backend-components/aliyun-artifact-resolution.json", "docs/engineering/evidence/aliyun-artifact-resolution.json");
  }
  if (relativePath === "docs/agents/backend-architecture-profiles.md" && distribution.mode === "selected") {
    return content.replace(/；依据见 `\.template-source\/evidence\/maintenance\/2026-09-12-existing-project-delivery\/maven-adapters-04\.json`/, "；适配验证证据保留在模板源，项目实例须对自身工程重新验证");
  }
  if (relativePath === "docs/user-guide/用户手册.md" && distribution.mode === "selected") {
    return `# ${variables.projectName} 用户手册\n\n本仓是 \`project-instance\`，用于 ${variables.businessDomain} 的研发资产。先阅读根 [AGENTS.md](../../AGENTS.md)、[CONTEXT.md](../../CONTEXT.md) 与 [生命周期资产索引](../process/lifecycle-artifact-map.md)。\n\n初始化只安装四项入口 Skill 和所选 Agent 平台。阶段派发前，由 Agent 运行 \`create-yss-spec skills ensure <skill-id...> --plan\` 查看依赖与引用，再运行 \`--apply\` 安装；增加平台使用 \`create-yss-spec skills runtime add <codex|cursor|pi> --plan/--apply\`。CLI 快照必须与实例记录的模板提交一致；升级 CLI 后先运行 \`create-yss-spec sync\`。\n\n项目校验运行 \`scripts/verify-project-instance\`；实例 CI 应执行该命令和项目实际的构建、测试。\n`;
  }
  if (distribution.mode === "selected" && relativePath === "docs/design/README.md") {
    return content.replace(/^.*design-system-sync\.yaml.*\n/m, "");
  }
  if (distribution.mode === "selected" && relativePath.startsWith("docs/user-guide/") && relativePath.endsWith(".md")) {
    return content.replaceAll("[设备借用贯穿案例](设备借用贯穿案例.md)", "[项目用户手册](用户手册.md)")
      .replaceAll("本仓是 `template-source`", "模板源是 `template-source`");
  }
  if (relativePath === "yss-project.yaml") {
    return convertTemplateSourceToInstance(content);
  }

  if (relativePath === "AGENTS.md") {
    const rendered = content
      .replace(
        /(\*\*项目名称：\*\*\s*)\[填写\]/,
        (_, prefix) => `${prefix}${variables.projectName}`,
      )
      .replace(
        /(\*\*业务领域：\*\*\s*)\[填写\]/,
        (_, prefix) => `${prefix}${variables.businessDomain}`,
      )
      .replace(
        /(\*\*团队规模：\*\*\s*)\[填写\]/,
        (_, prefix) => `${prefix}${variables.teamSize}`,
      );
    return distribution.mode === "selected"
      ? `${rendered.replace(/## 4\. \`template-source\` 模板维护路由[\s\S]*?(?=## 5\.)/, "")
        .replace(/\| 影响面、\`not-applicable\`、模板维护强度 \|[^\n]*\n/, "| 影响面与 `not-applicable` | `docs/process/harness-process-tailoring.md` |\n")}\n## 按需 Skill\n\n阶段派发或专项任务开始前，根据 docs/agents/yss-skill-registry.yaml 选定 Skill，运行 \`create-yss-spec skills ensure <skill-id...> --plan\`，核对后运行 \`--apply\`。若 CLI 快照与实例模板提交不一致，先运行 \`create-yss-spec sync\`。\n`
      : rendered;
  }

  if (relativePath === "README.md") {
    return `# ${variables.projectName}\n\n本仓库用于管理 ${variables.businessDomain} 的研发资产。\n\n- 默认 Issue Tracker：${variables.issueTracker}\n- Agent 平台：${distribution.mode === "selected" ? distribution.runtimes.join(", ") : "legacy-all"}\n- 协作入口：[AGENTS.md](./AGENTS.md)\n- 业务词汇：[CONTEXT.md](./CONTEXT.md)\n- 用户指南：[docs/user-guide/用户手册.md](./docs/user-guide/用户手册.md)\n\n项目校验：\`scripts/verify-project-instance\`。按需安装 Skill：\`create-yss-spec skills ensure <skill-id> --plan\`，确认后使用 \`--apply\`。\n`;
  }

  if (relativePath === ".gitignore") return extractManagedGitignoreBlock(content);

  return content;
}

function buildCopyPlan(
  sourceDir,
  targetDir,
  variables,
  relativeDir = "",
  mode = "managed",
  bundledPathToLogicalPath,
  distribution = { mode: "legacy-all" },
) {
  const operations = [];
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!relativeDir && shouldSkipRootEntry(entry.name, mode)) continue;

    const bundledRelativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;
    const relativePath = logicalTemplatePath(bundledRelativePath, bundledPathToLogicalPath);

    if (shouldExcludeRelativePath(relativePath, mode)) continue;
    if (!isIncludedInstancePath(relativePath, distribution)) continue;
    if (!variables.includeExampleDocs && EXAMPLE_DOC_PATHS.has(relativePath)) continue;

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
          bundledPathToLogicalPath,
          distribution,
        ),
      );
      continue;
    }
    if (!entry.isFile()) continue;

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

function buildSyncVariables(metadata) {
  const variables = metadata.variables || {};
  return {
    projectName: variables.projectName || "待补充",
    businessDomain: variables.businessDomain || "待补充",
    teamSize: variables.teamSize || "待补充",
    issueTracker: variables.issueTracker || "github",
    includeExampleDocs:
      variables.includeExampleDocs === undefined
        ? !(metadata.metadataSchemaVersion >= 3)
        : Boolean(variables.includeExampleDocs),
    distribution: metadata.metadataSchemaVersion >= 3 ? metadata.distribution : { mode: "legacy-all" },
  };
}

function buildDesiredManagedFile(operation, variables) {
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

  const desiredContent = fs.readFileSync(operation.sourcePath);
  return {
    ...operation,
    desiredContent,
    desiredHash: sha256(desiredContent),
  };
}

function buildDesiredManagedOperations(targetDir, variables, mode = "managed", snapshot = readTemplateSnapshot()) {
  const distribution = variables.distribution || distributionForVariables(variables, BUNDLED_TEMPLATE_ROOT);
  return buildCopyPlan(BUNDLED_TEMPLATE_ROOT, targetDir, { ...variables, distribution }, "", mode, logicalPathMap(snapshot), distribution)
    .filter((operation) => operation.type === "copy" || operation.type === "render")
    .map((operation) => buildDesiredManagedFile(operation, variables));
}

function adaptGitignoreOperation(
  operation,
  targetDir,
  { attach = false, legacyBaselineHash = null } = {},
) {
  if (operation.relativePath !== ".gitignore") return operation;
  const kind = pathKind(operation.targetPath);
  if (kind === "missing") return operation;
  if (kind !== "file") return { ...operation, unsafeReason: `.gitignore 路径类型为 ${kind}` };
  const currentContent = fs.readFileSync(operation.targetPath, "utf8");
  const state = markerState(currentContent);
  if (state.kind === "invalid") {
    return { ...operation, unsafeReason: ".gitignore managed rules 标记无效" };
  }
  const legacyBaselineMatch =
    state.kind === "absent" &&
    typeof legacyBaselineHash === "string" &&
    sha256(currentContent) === legacyBaselineHash;
  const desiredContent = legacyBaselineMatch
    ? operation.desiredContent
    : mergeManagedGitignoreBlock(currentContent, operation.desiredContent);
  return {
    ...operation,
    desiredContent,
    desiredHash: sha256(desiredContent),
    safeSectionMerge: state.kind === "valid" || attach || legacyBaselineMatch,
    legacyBaselineConversion: legacyBaselineMatch,
  };
}

function buildSyncDesiredOperations(targetDir, metadata, identity, snapshot = readTemplateSnapshot()) {
  const variables = buildSyncVariables(metadata);
  return buildDesiredManagedOperations(targetDir, variables, "init", snapshot)
    .filter((operation) => operation.relativePath !== "README.md")
    .map((operation) =>
      adaptGitignoreOperation(operation, targetDir, {
        legacyBaselineHash: metadata.managedFiles?.[".gitignore"]?.contentHash || null,
      }),
    )
    .map((operation) => {
    if (
      operation.relativePath !== "yss-project.yaml" ||
      identity.state !== "valid" ||
      identity.fields.repository_mode !== "template-source"
    ) {
      return operation;
    }

    const desiredContent = convertTemplateSourceToInstance(identity.content);
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
  return buildDesiredManagedOperations(targetDir, variables, "init")
    .filter((operation) => operation.relativePath !== "README.md")
    .map((operation) => adaptGitignoreOperation(operation, targetDir, { attach: true }))
    .map((operation) => {
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

    const desiredContent = convertTemplateSourceToInstance(identity.content);
    return {
      ...operation,
      desiredContent,
      desiredHash: sha256(desiredContent),
      identityConversion: true,
    };
  });
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

  validateTemplateMetadata(metadata, {
    currentSchemaVersion: METADATA_SCHEMA_VERSION,
    templateName: PACKAGE_MANIFEST.name,
    templateSource: TEMPLATE_SOURCE,
  });

  return { metadataPath, metadata };
}

function collectManagedFiles(desiredOperations) {
  const managedFiles = {};
  for (const operation of desiredOperations) {
    if (operation.relativePath === "README.md" || pathKind(operation.targetPath) !== "file") continue;
    managedFiles[operation.relativePath] = {
      type: operation.type,
      contentHash: fileHash(operation.targetPath),
    };
  }
  return managedFiles;
}

function buildMetadata(variables, desiredOperations, timestamp = nowIsoString()) {
  const snapshot = readTemplateSnapshot();
  const distribution = variables.distribution || distributionForVariables(variables, BUNDLED_TEMPLATE_ROOT);
  return {
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    templateName: PACKAGE_MANIFEST.name,
    cliVersion: PACKAGE_MANIFEST.version,
    templateVersion: PACKAGE_MANIFEST.version,
    templateSource: TEMPLATE_SOURCE,
    templateCommit: snapshot.templateCommit,
    templateSourceState: snapshot.sourceState,
    snapshotHash: snapshot.snapshotHash,
    initializedAt: timestamp,
    lastSyncedAt: timestamp,
    managedFilesManifestVersion: TEMPLATE_MANIFEST_VERSION,
    distribution,
    variables: {
      projectName: variables.projectName,
      businessDomain: variables.businessDomain,
      teamSize: variables.teamSize,
      issueTracker: variables.issueTracker,
      includeExampleDocs: variables.includeExampleDocs,
    },
    managedFiles: collectManagedFiles(desiredOperations),
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

function buildNextSyncMetadata(metadata, syncPlan, {
  snapshot = readTemplateSnapshot(),
  currentHashes = null,
} = {}) {
  const nextManagedFiles = { ...(metadata.managedFiles || {}) };
  delete nextManagedFiles["README.md"];
  for (const relativePath of syncPlan.alreadyMissing || []) delete nextManagedFiles[relativePath];
  for (const relativePath of syncPlan.pruned || []) delete nextManagedFiles[relativePath];
  for (const operation of syncPlan.desiredOperations) {
    if (pathKind(operation.targetPath) !== "file") continue;
    const currentHash = currentHashes?.[operation.relativePath] ?? fileHash(operation.targetPath);
    if (currentHash === operation.desiredHash || operation.relativePath === "skills-lock.json") {
      nextManagedFiles[operation.relativePath] = {
        type: operation.type,
        contentHash: currentHash,
      };
    }
  }

  return {
    ...metadata,
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    distribution: metadata.metadataSchemaVersion >= 3 ? metadata.distribution : { mode: "legacy-all" },
    templateName: PACKAGE_MANIFEST.name,
    cliVersion: PACKAGE_MANIFEST.version,
    templateVersion: PACKAGE_MANIFEST.version,
    templateSource: TEMPLATE_SOURCE,
    templateCommit: snapshot.templateCommit,
    templateSourceState: snapshot.sourceState,
    snapshotHash: snapshot.snapshotHash,
    lastSyncedAt: nowIsoString(),
    managedFilesManifestVersion: TEMPLATE_MANIFEST_VERSION,
    managedFiles: nextManagedFiles,
  };
}

function verifyGeneratedSyncInstance(targetDir) {
  const identity = readTargetIdentity(targetDir);
  if (
    identity.state !== "valid" ||
    identity.fields.repository_mode !== "project-instance"
  ) {
    throw new Error("初始化结果的 yss-project.yaml 必须是 project-instance");
  }

  const agentsContent = fs.readFileSync(targetPath(targetDir, "AGENTS.md"), "utf8");
  if (agentsContent.includes("[填写]")) {
    throw new Error("初始化结果仍包含模板占位信息");
  }
}

module.exports = {
  PACKAGE_ROOT,
  PACKAGE_MANIFEST,
  BUNDLED_TEMPLATE_ROOT,
  TEMPLATE_MANIFEST,
  TEMPLATE_MANIFEST_VERSION,
  TEMPLATE_METADATA_FILENAME,
  TEMPLATE_SOURCE,
  METADATA_SCHEMA_VERSION,
  sha256,
  fileHash,
  readTemplateSnapshot,
  readTargetIdentity,
  buildSyncVariables,
  buildDesiredManagedOperations,
  buildSyncDesiredOperations,
  buildAttachDesiredOperations,
  loadTemplateMetadata,
  buildMetadata,
  writeTemplateMetadata,
  buildNextSyncMetadata,
  verifyGeneratedSyncInstance,
};
