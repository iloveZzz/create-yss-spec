"use strict";

function parseRepositoryIdentity(content) {
  const fields = {};
  for (const [index, line] of String(content).split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = line.match(/^([a-z_][a-z0-9_-]*):\s*([^\s#]+)\s*$/);
    if (!match) throw new Error(`yss-project.yaml 第 ${index + 1} 行格式非法`);
    const [, key, value] = match;
    if (fields[key] !== undefined) throw new Error(`yss-project.yaml 不允许重复字段：${key}`);
    fields[key] = value;
  }

  const keys = Object.keys(fields).sort();
  if (keys.join(",") !== "repository_mode,schema_version") {
    throw new Error("yss-project.yaml 只能包含 schema_version 和 repository_mode");
  }
  if (fields.schema_version !== "1") {
    throw new Error("yss-project.yaml 的 schema_version 必须为 1");
  }
  if (!["template-source", "project-instance"].includes(fields.repository_mode)) {
    throw new Error("yss-project.yaml 的 repository_mode 必须是 template-source 或 project-instance");
  }
  return fields;
}

function convertTemplateSourceToInstance(content) {
  const identity = parseRepositoryIdentity(content);
  if (identity.repository_mode !== "template-source") {
    throw new Error("模板 yss-project.yaml 必须声明 repository_mode: template-source");
  }
  const rendered = String(content).replace(/^repository_mode:\s*template-source$/m, "repository_mode: project-instance");
  const converted = parseRepositoryIdentity(rendered);
  if (converted.repository_mode !== "project-instance") {
    throw new Error("生成项目 yss-project.yaml 未转换为 project-instance");
  }
  return rendered;
}

module.exports = { parseRepositoryIdentity, convertTemplateSourceToInstance };
