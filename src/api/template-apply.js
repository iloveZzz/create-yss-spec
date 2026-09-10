"use strict";

const { buildSyncContext, applySyncContext } = require("./_sync-service");

function templateApply(options = {}) {
  const context = buildSyncContext(options);
  return applySyncContext(context, {
    force: Boolean(options.force),
    prune: Boolean(options.prune),
  });
}

module.exports = { templateApply };
