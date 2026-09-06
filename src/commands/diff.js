"use strict";

const { runSync } = require("./sync");

function runDiff(argv = []) {
  if (argv.includes("--json")) {
    return runSync(argv);
  }
  if (argv.includes("--plan")) {
    return runSync(argv);
  }
  return runSync([...argv, "--plan"]);
}

module.exports = {
  runDiff,
};
