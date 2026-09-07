"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FAMILIES = [
  {
    name: "create-yss-spec",
    metadata: ".yss-template.json",
    template: "yss-spec-project-template",
    profile: null,
  },
  {
    name: "create-yss-harness-design",
    metadata: ".yss-harness-design.json",
    template: "yss-harness-design-agent",
    profile: "harness.business-ddd-strategy-handoff",
  },
  {
    name: "create-yss-harness-dev",
    metadata: ".yss-harness-dev.json",
    template: "yss-harness-dev-agent",
    profile: "harness.dev-agent-slice",
  },
  {
    name: "create-yss-harness-backend",
    metadata: ".yss-harness-backend.json",
    template: "yss-harness-backend-agent",
    profile: "harness.backend-delivery",
  },
  {
    name: "create-yss-harness-frontend",
    metadata: ".yss-harness-frontend.json",
    template: "yss-harness-frontend-agent",
    profile: "harness.frontend-delivery",
  },
];

const PROFILE_PATH = "docs/process/harness-profile.yaml";

function statOrMissing(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function readIdentityFile(root, relative) {
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = statOrMissing(current);
    if (!stat) return null;
    if (
      stat.isSymbolicLink() ||
      (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
    ) {
      throw new Error(`身份路径不能是符号链接或特殊文件：${relative}`);
    }
  }
  return fs.readFileSync(current, "utf8");
}

function topLevelJsonKeys(text) {
  const keys = [];
  let depth = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      index += 1;
      continue;
    }
    if (char !== '"') {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const current = text[index];
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        break;
      }
      index += 1;
    }
    if (index >= text.length) break;

    const literal = text.slice(start, index + 1);
    index += 1;
    let cursor = index;
    while (/\s/.test(text[cursor] || "")) cursor += 1;
    if (depth === 1 && text[cursor] === ":") {
      keys.push(JSON.parse(literal));
    }
  }

  return keys;
}

function parseJsonObject(text, relative) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`身份文件格式非法 ${relative}：${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`身份文件格式非法 ${relative}：必须是对象`);
  }

  const seen = new Set();
  for (const key of topLevelJsonKeys(text)) {
    if (seen.has(key)) {
      throw new Error(`身份文件格式非法 ${relative}：重复字段 ${key}`);
    }
    seen.add(key);
  }
  return value;
}

function stripYamlComment(line) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === "\\") {
      escaped = true;
      continue;
    }
    if (!double && char === "'") single = !single;
    else if (!single && char === '"') double = !double;
    else if (!single && !double && char === "#") return line.slice(0, index);
  }
  return line;
}

function parseYamlScalar(raw, relative, lineNumber) {
  const value = raw.trim();
  if (!value) return undefined;

  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0];
    if (!value.endsWith(quote) || value.length < 2) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行字符串未闭合`);
    }
    if (quote === "'") {
      return value.slice(1, -1).replaceAll("''", "'");
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行 ${error.message}`);
    }
  }

  if (/^[+-]?\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^[\[\]{}|>&*!]/.test(value)) {
    throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行不支持复杂 YAML 值`);
  }
  return value;
}

function parseProfileYaml(text, relative = PROFILE_PATH) {
  const root = {};
  const rootKeys = new Set();
  const nestedKeys = new Set();
  let section = null;

  for (const [offset, rawLine] of String(text).split(/\r?\n/).entries()) {
    const lineNumber = offset + 1;
    if (rawLine.includes("\t")) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行不允许 Tab 缩进`);
    }
    const uncommented = stripYamlComment(rawLine).replace(/\s+$/, "");
    if (!uncommented.trim()) continue;

    const indent = uncommented.match(/^ */)[0].length;
    if (![0, 2].includes(indent)) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行缩进非法`);
    }
    const content = uncommented.slice(indent);
    const match = content.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行格式非法`);
    }
    const [, key, rawValue = ""] = match;

    if (indent === 0) {
      section = null;
      if (rootKeys.has(key)) {
        throw new Error(`身份文件格式非法 ${relative}：重复字段 ${key}`);
      }
      rootKeys.add(key);
      if (!rawValue.trim()) {
        if (key !== "instantiation") {
          throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行缺少值`);
        }
        root[key] = {};
        section = key;
      } else {
        root[key] = parseYamlScalar(rawValue, relative, lineNumber);
      }
      continue;
    }

    if (section !== "instantiation" || !root.instantiation) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行存在未知嵌套`);
    }
    if (nestedKeys.has(key)) {
      throw new Error(`身份文件格式非法 ${relative}：instantiation 重复字段 ${key}`);
    }
    nestedKeys.add(key);
    const parsed = parseYamlScalar(rawValue, relative, lineNumber);
    if (parsed === undefined) {
      throw new Error(`身份文件格式非法 ${relative}：第 ${lineNumber} 行缺少值`);
    }
    root.instantiation[key] = parsed;
  }

  return root;
}

function createFamilyGuard(_packageRoot, expectedName) {
  const expected = FAMILIES.find(({ name }) => name === expectedName);
  if (!expected) throw new Error(`未知 CLI 家族：${expectedName}`);
  const source = `github:iloveZzz/${expected.template}`;

  function checkFields(value, fields, relative) {
    for (const [key, wanted] of Object.entries(fields)) {
      if (
        Object.hasOwn(value, key) &&
        (wanted === null || value[key] !== wanted)
      ) {
        throw new Error(
          `身份不一致：${relative} 的 ${key} 与 ${expectedName} 不匹配；--force 不能绕过`,
        );
      }
    }
  }

  return function checkTargetFamily(targetDir, { snapshot } = {}) {
    const present = FAMILIES.filter(({ metadata }) =>
      statOrMissing(path.join(targetDir, metadata)),
    );
    if (present.length > 1) {
      throw new Error("目标存在多个模板家族身份；请人工核对，CLI 不自动修复");
    }
    if (present.length && present[0].name !== expectedName) {
      throw new Error(
        `目标身份属于 ${present[0].name}（${present[0].metadata}），不能使用 ${expectedName}；不支持跨家族迁移，--force 不能绕过`,
      );
    }

    if (present.length) {
      const metadataText = readIdentityFile(targetDir, expected.metadata);
      const value = parseJsonObject(metadataText, expected.metadata);
      if (
        Object.hasOwn(value, "metadataSchemaVersion") &&
        (!Number.isInteger(value.metadataSchemaVersion) ||
          value.metadataSchemaVersion < 1 ||
          value.metadataSchemaVersion > (expectedName === "create-yss-spec" ? 2 : 1))
      ) {
        throw new Error("身份 metadata schema 版本非法或不支持");
      }
      const legacy =
        value.metadataSchemaVersion === undefined ||
        (expectedName === "create-yss-spec" && value.metadataSchemaVersion === 1);
      checkFields(
        value,
        {
          templateName: expectedName,
          templateSource:
            legacy && value.templateSource === "legacy-attach"
              ? "legacy-attach"
              : source,
          template_source: source,
          profileId: expected.profile,
          profile_id: expected.profile,
        },
        expected.metadata,
      );
    }

    const profileText = readIdentityFile(targetDir, PROFILE_PATH);
    if (profileText !== null) {
      const profile = parseProfileYaml(profileText, PROFILE_PATH);
      if (
        profile.schema_version !== 1 ||
        !FAMILIES.some(
          (family) =>
            family.profile !== null && family.profile === profile.profile_id,
        )
      ) {
        throw new Error(`未知或非法 profile：${PROFILE_PATH}`);
      }
      if (expected.profile === null || profile.profile_id !== expected.profile) {
        throw new Error(
          `profile 身份与 ${expectedName} 不一致；不支持跨家族迁移，--force 不能绕过`,
        );
      }
      if (profile.instantiation !== undefined) {
        if (
          !profile.instantiation ||
          typeof profile.instantiation !== "object" ||
          Array.isArray(profile.instantiation)
        ) {
          throw new Error(`profile 身份配置非法：${PROFILE_PATH}`);
        }
        checkFields(
          profile.instantiation,
          {
            metadata_file: expected.metadata,
            template_source: source,
            cli_package: expectedName,
          },
          PROFILE_PATH,
        );
      }
    }

    if (snapshot) {
      if (
        snapshot.templateName !== expected.template ||
        snapshot.templateSource !== source ||
        (expected.profile
          ? snapshot.profileId !== expected.profile || profileText === null
          : Object.hasOwn(snapshot, "profileId"))
      ) {
        throw new Error(`模板快照家族身份与 ${expectedName} 不一致`);
      }
    }
  };
}

module.exports = {
  FAMILIES,
  PROFILE_PATH,
  parseProfileYaml,
  createFamilyGuard,
};
