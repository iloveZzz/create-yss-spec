const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// The cross-package identity contract is maintained in the template source.
const FAMILIES = [
  { name: "create-yss-spec", metadata: ".yss-template.json", template: "yss-spec-project-template", profile: null },
  { name: "create-yss-harness-design", metadata: ".yss-harness-design.json", template: "yss-harness-design-agent", profile: "harness.business-ddd-strategy-handoff" },
  { name: "create-yss-harness-dev", metadata: ".yss-harness-dev.json", template: "yss-harness-dev-agent", profile: "harness.dev-agent-slice" },
  { name: "repository-local backend", metadata: ".yss-harness-backend.json", template: "yss-harness-backend-agent", profile: "harness.backend-delivery" },
  { name: "repository-local frontend", metadata: ".yss-harness-frontend.json", template: "yss-harness-frontend-agent", profile: "harness.frontend-delivery" },
];
const PROFILE_PATH = "docs/process/harness-profile.yaml";

function statOrMissing(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function readIdentityFile(root, relative) {
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = statOrMissing(current);
    if (!stat) return null;
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`身份路径不能是符号链接或特殊文件：${relative}`);
    }
  }
  return fs.readFileSync(current, "utf8");
}

async function createFamilyGuard(packageRoot, expectedName) {
  const expected = FAMILIES.find(({ name }) => name === expectedName);
  if (!expected) throw new Error(`未知 CLI 家族：${expectedName}`);
  // Only load the parser from our bundled template, never from the target project.
  const { parseDocument } = await import(pathToFileURL(path.join(packageRoot, "template/scripts/vendor/yaml.mjs")).href);
  const source = `github:iloveZzz/${expected.template}`;

  function object(text, relative, json = false) {
    try {
      if (json) JSON.parse(text);
      const document = parseDocument(text, { uniqueKeys: true });
      if (document.errors.length) throw document.errors[0];
      const value = document.toJS({ maxAliasCount: 0 });
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是对象");
      return value;
    } catch (error) {
      throw new Error(`身份文件格式非法 ${relative}：${error.message}`);
    }
  }

  function checkFields(value, fields, relative) {
    for (const [key, wanted] of Object.entries(fields)) {
      if (Object.hasOwn(value, key) && (wanted === null || value[key] !== wanted)) {
        throw new Error(`身份不一致：${relative} 的 ${key} 与 ${expectedName} 不匹配；--force 不能绕过`);
      }
    }
  }

  return function checkTargetFamily(targetDir, { snapshot } = {}) {
    const present = FAMILIES.filter(({ metadata }) => statOrMissing(path.join(targetDir, metadata)));
    if (present.length > 1) throw new Error("目标存在多个模板家族身份；请人工核对，CLI 不自动修复");
    if (present.length && present[0].name !== expectedName) {
      throw new Error(`目标身份属于 ${present[0].name}（${present[0].metadata}），不能使用 ${expectedName}；不支持跨家族迁移，--force 不能绕过`);
    }
    if (present.length) {
      const value = object(readIdentityFile(targetDir, expected.metadata), expected.metadata, true);
      if (Object.hasOwn(value, "metadataSchemaVersion") &&
          (!Number.isInteger(value.metadataSchemaVersion) || value.metadataSchemaVersion < 1 ||
           value.metadataSchemaVersion > (expectedName === "create-yss-spec" ? 2 : 1))) {
        throw new Error("身份 metadata schema 版本非法或不支持");
      }
      const legacy = value.metadataSchemaVersion === undefined || (expectedName === "create-yss-spec" && value.metadataSchemaVersion === 1);
      checkFields(value, {
        templateName: expectedName,
        templateSource: legacy && value.templateSource === "legacy-attach" ? "legacy-attach" : source,
        template_source: source,
        profileId: expected.profile,
        profile_id: expected.profile,
      }, expected.metadata);
    }
    const text = readIdentityFile(targetDir, PROFILE_PATH);
    if (text !== null) {
      const profile = object(text, PROFILE_PATH);
      if (profile.schema_version !== 1 || !FAMILIES.some(family => family.profile !== null && family.profile === profile.profile_id)) {
        throw new Error(`未知或非法 profile：${PROFILE_PATH}`);
      }
      if (expected.profile === null || profile.profile_id !== expected.profile) {
        throw new Error(`profile 身份与 ${expectedName} 不一致；不支持跨家族迁移，--force 不能绕过`);
      }
      if (profile.instantiation !== undefined) {
        if (!profile.instantiation || typeof profile.instantiation !== "object" || Array.isArray(profile.instantiation)) {
          throw new Error(`profile 身份配置非法：${PROFILE_PATH}`);
        }
        checkFields(profile.instantiation, { metadata_file: expected.metadata, template_source: source, cli_package: expectedName }, PROFILE_PATH);
      }
    }
    if (snapshot) {
      if (snapshot.templateName !== expected.template || snapshot.templateSource !== source ||
          (expected.profile ? snapshot.profileId !== expected.profile || text === null : Object.hasOwn(snapshot, "profileId"))) {
        throw new Error(`模板快照家族身份与 ${expectedName} 不一致`);
      }
    }
  };
}
module.exports = { createFamilyGuard };
