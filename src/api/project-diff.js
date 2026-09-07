"use strict";

const { templatePlan } = require("./template-plan");

function projectDiff(options = {}) {
  return templatePlan(options);
}

module.exports = { projectDiff };
