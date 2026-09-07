"use strict";

const { buildSyncContext } = require("./_sync-service");

function templatePlan(options = {}) {
  return buildSyncContext(options).plan;
}

module.exports = { templatePlan };
