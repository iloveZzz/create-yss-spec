"use strict";

const { parseArgs } = require("../cli/args");
const { renderPlanText } = require("../cli/plan-output");
const { serializePlan } = require("../template/plan-schema");
const { projectDiff } = require("../api/project-diff");

function runDiff(argv = []) {
  const options = parseArgs(argv);
  const plan = projectDiff({
    targetDir: options.targetDir || ".",
    force: Boolean(options.force),
  });

  if (options.json) {
    process.stdout.write(serializePlan(plan));
  } else {
    process.stdout.write(renderPlanText(plan));
  }
  return plan;
}

module.exports = { runDiff };
