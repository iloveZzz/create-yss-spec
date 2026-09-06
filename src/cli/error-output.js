"use strict";

const ERROR_SCHEMA_VERSION = 1;

const ERROR_RULES = [
  [/模板路径越界|中间符号链接|目标父路径不是目录|符号链接或特殊文件/, "YSS_PATH_SAFETY"],
  [/gitlink|git-submodule|detached HEAD|submodule/, "YSS_GIT_PROTECTED"],
  [/模板快照|snapshotHash|templateCommit/, "YSS_SNAPSHOT_INVALID"],
  [/模板元数据|metadataSchemaVersion|managedFilesManifestVersion/, "YSS_METADATA_INVALID"],
  [/yss-project\.yaml|repository_mode|schema_version/, "YSS_IDENTITY_INVALID"],
  [/迁移冲突|迁移目标|旧路径迁移冲突/, "YSS_MIGRATION_CONFLICT"],
  [/unsafe|受管路径阻断|人工整理 Ticket/, "YSS_UNSAFE_PATH"],
  [/不支持的参数|需要 --|需要一个值|--dry-run 与 --apply|必须显式传入/, "YSS_ARGUMENT_INVALID"],
  [/目标目录|目标路径/, "YSS_TARGET_INVALID"],
];

function classifyErrorCode(error) {
  if (error && typeof error.code === "string" && error.code.startsWith("YSS_")) {
    return error.code;
  }

  const message = String(error?.message || error || "");
  for (const [pattern, code] of ERROR_RULES) {
    if (pattern.test(message)) return code;
  }
  return "YSS_COMMAND_FAILED";
}

function normalizeError(error) {
  return {
    schemaVersion: ERROR_SCHEMA_VERSION,
    ok: false,
    error: {
      code: classifyErrorCode(error),
      message: String(error?.message || error || "未知错误"),
    },
  };
}

function serializeError(error, space = 2) {
  return `${JSON.stringify(normalizeError(error), null, space)}\n`;
}

module.exports = {
  ERROR_SCHEMA_VERSION,
  ERROR_RULES,
  classifyErrorCode,
  normalizeError,
  serializeError,
};
