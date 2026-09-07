"use strict";

const {
  validateOwnershipPattern,
  matchesOwnershipPattern,
} = require("./ownership-policy");

const CUSTOMIZATION_POLICY_VERSION = 1;
const CUSTOMIZATION_STRATEGIES = Object.freeze([
  "replace-with-force",
  "manual",
]);
const GENERATOR_POLICY_VERSION = 1;

function validateRulePattern(pattern) {
  return validateOwnershipPattern(pattern);
}

function validateCustomizationPolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("customizationPolicy 必须是 JSON 对象");
  }
  if (policy.version !== CUSTOMIZATION_POLICY_VERSION) {
    throw new Error(`不支持的 customizationPolicy version：${policy.version}`);
  }
  if (!CUSTOMIZATION_STRATEGIES.includes(policy.defaultStrategy)) {
    throw new Error(`customizationPolicy defaultStrategy 非法：${policy.defaultStrategy}`);
  }
  if (!Array.isArray(policy.rules)) {
    throw new Error("customizationPolicy rules 必须是数组");
  }

  const seen = new Set();
  const rules = policy.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`customizationPolicy rules[${index}] 必须是对象`);
    }
    const pattern = validateRulePattern(rule.pattern);
    if (seen.has(pattern)) {
      throw new Error(`customizationPolicy pattern 重复：${pattern}`);
    }
    seen.add(pattern);
    if (!CUSTOMIZATION_STRATEGIES.includes(rule.strategy)) {
      throw new Error(
        `customizationPolicy rules[${index}].strategy 非法：${rule.strategy}`,
      );
    }
    return { pattern, strategy: rule.strategy };
  });

  return {
    version: CUSTOMIZATION_POLICY_VERSION,
    defaultStrategy: policy.defaultStrategy,
    rules,
  };
}

function resolveCustomizationStrategy(relativePath, policy) {
  const validated = validateCustomizationPolicy(policy);
  for (const rule of validated.rules) {
    if (matchesOwnershipPattern(relativePath, rule.pattern)) {
      return rule.strategy;
    }
  }
  return validated.defaultStrategy;
}

function validateGeneratorPolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("generatorPolicy 必须是 JSON 对象");
  }
  if (policy.version !== GENERATOR_POLICY_VERSION) {
    throw new Error(`不支持的 generatorPolicy version：${policy.version}`);
  }
  if (!Array.isArray(policy.rules)) {
    throw new Error("generatorPolicy rules 必须是数组");
  }

  const seen = new Set();
  const rules = policy.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`generatorPolicy rules[${index}] 必须是对象`);
    }
    const pattern = validateRulePattern(rule.pattern);
    if (seen.has(pattern)) {
      throw new Error(`generatorPolicy pattern 重复：${pattern}`);
    }
    seen.add(pattern);
    if (!/^[a-z][a-z0-9-]*$/.test(rule.generatorId || "")) {
      throw new Error(`generatorPolicy rules[${index}].generatorId 非法`);
    }
    if (!Number.isInteger(rule.generatorVersion) || rule.generatorVersion < 1) {
      throw new Error(`generatorPolicy rules[${index}].generatorVersion 必须是正整数`);
    }
    return {
      pattern,
      generatorId: rule.generatorId,
      generatorVersion: rule.generatorVersion,
    };
  });

  return {
    version: GENERATOR_POLICY_VERSION,
    rules,
  };
}

function resolveGenerator(relativePath, policy) {
  const validated = validateGeneratorPolicy(policy);
  for (const rule of validated.rules) {
    if (matchesOwnershipPattern(relativePath, rule.pattern)) {
      return {
        generatorId: rule.generatorId,
        generatorVersion: rule.generatorVersion,
      };
    }
  }
  return null;
}

module.exports = {
  CUSTOMIZATION_POLICY_VERSION,
  CUSTOMIZATION_STRATEGIES,
  GENERATOR_POLICY_VERSION,
  validateCustomizationPolicy,
  resolveCustomizationStrategy,
  validateGeneratorPolicy,
  resolveGenerator,
};
