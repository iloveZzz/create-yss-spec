"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { treeHash } = require("../template-hash");
const { targetPath, pathKind, normalizeRelativePath } = require("../filesystem/path-utils");
const { validateTemplateSnapshot } = require("../validation/snapshot");
const { validateTemplateMetadata } = require("../validation/metadata");
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
const METADATA_SCHEMA_VERSION = 2;

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

let bundledPathToLogicalPath = null;

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

function logicalTemplatePath(bundledPath) {
  if (bundledPathToLogicalPath === null) {
    const snapshot = readTemplateSnapshot();
    bundledPathToLogicalPath = new Map(
      Object.entries(snapshot.encodedPaths || {}).map(([logicalPath, encodedPath]) => [
        normalizeRelativePath(encodedPath),
        normalizeRelativePath(logicalPath),
      ]),
    );
  }
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
  if (relativePath === "yss-project.yaml") {
    return convertTemplateSourceToInstance(content);
  }

  if (relativePath === "AGENTS.md") {
    return content
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
    if (!relativeDir && shouldSkipRootEntry(entry.name, mode)) continue;

    const bundledRelativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;
    const relativePath = logicalTemplatePath(bundledRelativePath);

    if (shouldExcludeRelativePath(relativePath, mode)) continue;
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
        ? true
        : Boolean(variables.includeExampleDocs),
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

  return {
    ...operation,
    desiredContent: fs.readFileSync(operation.sourcePath),
    desiredHash: fileHash(operation.sourcePath),
  };
}

function buildDesiredManagedOperations(targetDir, variables, mode = "managed") {
  return buildCopyPlan(BUNDLED_TEMPLATE_ROOT, targetDir, variables, "", mode)
    .filter((operation) => operation.type === "copy" || operation.type === "render")
    .map((operation) => buildDesiredManagedFile(operation, variables));
}

function buildSyncDesiredOperations(targetDir, metadata, identity) {
  const variables = buildSyncVariables(metadata);
  return buildDesiredManagedOperations(targetDir, variables, "init").map((operation) => {
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
  return buildDesiredManagedOperations(targetDir, variables, "managed").map((operation) => {
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
    if (pathKind(operation.targetPath) !== "file") continue;
    managedFiles[operation.relativePath] = {
      type: operation.type,
      contentHash: fileHash(operation.targetPath),
    };
  }
  return managedFiles;
}

function buildMetadata(variables, desiredOperations, timestamp = nowIsoString()) {
  return {
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    templateName: PACKAGE_MANIFEST.name,
    cliVersion: PACKAGE_MANIFEST.version,
    templateVersion: PACKAGE_MANIFEST.version,
    templateSource: TEMPLATE_SOURCE,
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

function buildNextSyncMetadata(metadata, syncPlan) {
  const nextManagedFiles = { ...(metadata.managedFiles || {}) };
  for (const relativePath of syncPlan.removed) {
    delete nextManagedFiles[relativePath];
  }
  for (const operation of syncPlan.desiredOperations) {
    if (pathKind(operation.targetPath) !== "file") continue;
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
    templateSource: TEMPLATE_SOURCE,
    templateCommit: readTemplateSnapshot().templateCommit,
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
  const readmeContent = fs.readFileSync(targetPath(targetDir, "README.md"), "utf8");
  if (agentsContent.includes("[填写]") || readmeContent.includes("[填写]")) {
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
