"use strict";

const { normalizePlan } = require("../template/plan-schema");

function renderPlanText(input) {
  const plan = normalizePlan(input);
  const lines = [
    `${plan.operation} plan`,
    `目标目录：${plan.targetDir || "-"}`,
    `模板版本：${plan.template?.from || "unknown"} -> ${plan.template?.to || "unknown"}`,
    `blocked: ${plan.blocked ? "yes" : "no"}`,
  ];

  for (const change of plan.changes) {
    lines.push(`${change.action}: ${change.path}`);
  }
  for (const conflict of plan.conflicts) {
    const forceable = conflict.forceable ? " [forceable]" : "";
    lines.push(`conflict${forceable}: ${conflict.path} (${conflict.reason})`);
  }
  for (const unsafe of plan.unsafe) {
    lines.push(`unsafe: ${unsafe.path} (${unsafe.reason})`);
  }
  for (const warning of plan.warnings) {
    lines.push(`warning: ${warning}`);
  }

  const stats = Object.entries(plan.stats || {});
  if (stats.length > 0) {
    lines.push(`统计：${stats.map(([key, value]) => `${key}=${value}`).join("，")}`);
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  renderPlanText,
};
