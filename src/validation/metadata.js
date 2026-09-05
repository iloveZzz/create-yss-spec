"use strict";

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
