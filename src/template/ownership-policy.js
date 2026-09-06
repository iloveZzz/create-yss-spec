"use strict";

const OWNERSHIP_POLICY_VERSION = 1;
const OWNERSHIP_TYPES = Object.freeze([
  "managed",
  "managed-customizable",
  "generated",
  "user-owned",
  "protected",
]);
const OWNERSHIP_TYPE_SET = new Set(OWNERSHIP_TYPES);

const DEFAULT_OWNERSHIP_POLICY = Object.freeze({
  version: OWNERSHIP_POLICY_VERSION,
  default: "managed",
  rules: [],
});

function normalizePolicyPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function isOwnershipType(value) {
  return OWNERSHIP_TYPE_SET.has(value);
}

function validateOwnershipPattern(pattern) {
  if (typeof pattern !== "string" || !pattern.trim()) {
    throw new Error("ownership rule pattern 不能为空");
  }
  const normalized = normalizePolicyPath(pattern);
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/")
  ) {
    throw new Error(`ownership rule pattern 越界：${pattern}`);
  }
  if (normalized.includes("**") && !normalized.endsWith("/**")) {
    throw new Error(`ownership rule 仅支持末尾 /**：${pattern}`);
  }
  if (normalized.includes("*") && !normalized.endsWith("/*") && !normalized.endsWith("/**")) {
    throw new Error(`ownership rule 仅支持 exact、/* 或 /**：${pattern}`);
  }
  return normalized;
}

function validateOwnershipPolicy(policy) {
  const value = policy || DEFAULT_OWNERSHIP_POLICY;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ownershipPolicy 必须是 JSON 对象");
  }
  if (value.version !== OWNERSHIP_POLICY_VERSION) {
    throw new Error(`不支持的 ownershipPolicy version：${value.version}`);
  }
  if (!isOwnershipType(value.default)) {
    throw new Error(`ownershipPolicy default 非法：${value.default}`);
  }
  if (!Array.isArray(value.rules)) {
    throw new Error("ownershipPolicy rules 必须是数组");
  }

  const seen = new Set();
  const rules = value.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`ownershipPolicy rules[${index}] 必须是对象`);
    }
    const pattern = validateOwnershipPattern(rule.pattern);
    if (seen.has(pattern)) {
      throw new Error(`ownershipPolicy pattern 重复：${pattern}`);
    }
    seen.add(pattern);
    if (!isOwnershipType(rule.ownership)) {
      throw new Error(
        `ownershipPolicy rules[${index}].ownership 非法：${rule.ownership}`,
      );
    }
    return { pattern, ownership: rule.ownership };
  });

  return {
    version: OWNERSHIP_POLICY_VERSION,
    default: value.default,
    rules,
  };
}

function matchesOwnershipPattern(relativePath, pattern) {
  const target = normalizePolicyPath(relativePath);
  const normalizedPattern = validateOwnershipPattern(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return target === prefix || target.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    if (!target.startsWith(`${prefix}/`)) return false;
    return !target.slice(prefix.length + 1).includes("/");
  }
  return target === normalizedPattern;
}

function resolveOwnership(relativePath, policy = DEFAULT_OWNERSHIP_POLICY) {
  const validated = validateOwnershipPolicy(policy);
  for (const rule of validated.rules) {
    if (matchesOwnershipPattern(relativePath, rule.pattern)) {
      return rule.ownership;
    }
  }
  return validated.default;
}

function isTemplateManagedOwnership(ownership) {
  return ["managed", "managed-customizable", "generated"].includes(ownership);
}

function isWriteProtectedOwnership(ownership) {
  return ownership === "user-owned" || ownership === "protected";
}

function ownershipWriteViolation(operation) {
  const ownership = operation?.ownership || "managed";
  if (!isWriteProtectedOwnership(ownership)) return null;
  const path = operation?.relativePath || operation?.path || "unknown";
  return ownership === "protected"
    ? `${path} 被 ownership policy 标记为 protected，CLI 不得写入或覆盖`
    : `${path} 被 ownership policy 标记为 user-owned，不属于受管模板文件`;
}

module.exports = {
  OWNERSHIP_POLICY_VERSION,
  OWNERSHIP_TYPES,
  DEFAULT_OWNERSHIP_POLICY,
  normalizePolicyPath,
  isOwnershipType,
  validateOwnershipPattern,
  validateOwnershipPolicy,
  matchesOwnershipPattern,
  resolveOwnership,
  isTemplateManagedOwnership,
  isWriteProtectedOwnership,
  ownershipWriteViolation,
};
