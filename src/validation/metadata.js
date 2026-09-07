"use strict";

const OWNERSHIP_TYPES = new Set([
  "managed",
  "managed-customizable",
  "generated",
  "user-owned",
  "protected",
]);
const MERGE_STRATEGIES = new Set(["replace-with-force", "manual"]);

function assertPositiveInteger(value, name) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new Error(`模板元数据 ${name} 必须是正整数`);
  }
}

function assertSha256(value, name) {
  if (value !== undefined && !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`模板元数据 ${name} 必须是 64 位 sha256`);
  }
}

function validateTemplateMetadata(metadata, {
  currentSchemaVersion = 2,
  templateName,
  templateSource,
} = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("模板元数据必须是 JSON 对象");
  }
  if (metadata.metadataSchemaVersion !== undefined && (!Number.isInteger(metadata.metadataSchemaVersion) || metadata.metadataSchemaVersion < 1)) {
    throw new Error("模板元数据 metadataSchemaVersion 必须是正整数");
  }
  if (metadata.metadataSchemaVersion > currentSchemaVersion) {
    throw new Error(`不支持的模板元数据版本：${metadata.metadataSchemaVersion}`);
  }
  if (metadata.managedFiles !== undefined && (typeof metadata.managedFiles !== "object" || metadata.managedFiles === null || Array.isArray(metadata.managedFiles))) {
    throw new Error("模板元数据 managedFiles 必须是 JSON 对象");
  }

  assertPositiveInteger(metadata.ownershipPolicyVersion, "ownershipPolicyVersion");
  assertSha256(metadata.ownershipPolicyHash, "ownershipPolicyHash");
  assertPositiveInteger(metadata.customizationPolicyVersion, "customizationPolicyVersion");
  assertSha256(metadata.customizationPolicyHash, "customizationPolicyHash");
  assertPositiveInteger(metadata.generatorPolicyVersion, "generatorPolicyVersion");
  assertSha256(metadata.generatorPolicyHash, "generatorPolicyHash");

  for (const [relativePath, record] of Object.entries(metadata.managedFiles || {})) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`模板元数据 managedFiles.${relativePath} 必须是对象`);
    }
    if (record.ownership !== undefined && !OWNERSHIP_TYPES.has(record.ownership)) {
      throw new Error(`模板元数据 managedFiles.${relativePath}.ownership 非法：${record.ownership}`);
    }
    if (
      record.mergeStrategy !== undefined &&
      !MERGE_STRATEGIES.has(record.mergeStrategy)
    ) {
      throw new Error(
        `模板元数据 managedFiles.${relativePath}.mergeStrategy 非法：${record.mergeStrategy}`,
      );
    }
    if (
      record.generatorId !== undefined &&
      !/^[a-z][a-z0-9-]*$/.test(record.generatorId)
    ) {
      throw new Error(
        `模板元数据 managedFiles.${relativePath}.generatorId 非法：${record.generatorId}`,
      );
    }
    if (
      record.generatorVersion !== undefined &&
      (!Number.isInteger(record.generatorVersion) || record.generatorVersion < 1)
    ) {
      throw new Error(
        `模板元数据 managedFiles.${relativePath}.generatorVersion 必须是正整数`,
      );
    }
  }

  if (metadata.metadataSchemaVersion === currentSchemaVersion) {
    if (templateName !== undefined && metadata.templateName !== templateName) {
      throw new Error("模板元数据 templateName 与当前 CLI 不匹配");
    }
    if (typeof metadata.cliVersion !== "string" || !metadata.cliVersion) {
      throw new Error("模板元数据 cliVersion 缺失或非法");
    }
    if (templateSource !== undefined && metadata.templateSource !== templateSource) {
      throw new Error("模板元数据 templateSource 缺失或非法");
    }
    if (!/^[0-9a-f]{40}$/.test(metadata.templateCommit || "")) {
      throw new Error("模板元数据必须包含 40 位不可变 templateCommit");
    }
    if (!/^[0-9a-f]{64}$/.test(metadata.managedFilesManifestVersion || "")) {
      throw new Error("模板元数据 managedFilesManifestVersion 缺失或非法");
    }
    if (typeof metadata.variables !== "object" || metadata.variables === null || Array.isArray(metadata.variables)) {
      throw new Error("模板元数据 variables 必须是 JSON 对象");
    }
  }
  return metadata;
}

module.exports = { validateTemplateMetadata };
