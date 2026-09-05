"use strict";

const PLAN_SCHEMA_VERSION = 1;

function normalizePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("plan must be an object");
  }
  if (!plan.operation) {
    throw new TypeError("plan.operation is required");
  }

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    operation: plan.operation,
    targetDir: plan.targetDir || null,
    template: plan.template || null,
    changes: Array.isArray(plan.changes) ? plan.changes : [],
    conflicts: Array.isArray(plan.conflicts) ? plan.conflicts : [],
    unsafe: Array.isArray(plan.unsafe) ? plan.unsafe : [],
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    blocked: Boolean(plan.blocked),
    stats: plan.stats && typeof plan.stats === "object" ? plan.stats : {},
    migration: plan.migration || null,
  };
}

function serializePlan(plan, space = 2) {
  return `${JSON.stringify(normalizePlan(plan), null, space)}\n`;
}

module.exports = {
  PLAN_SCHEMA_VERSION,
  normalizePlan,
  serializePlan,
};
