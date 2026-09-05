"use strict";

const { runUpdate } = require("../self-update");

function runUpdateCommand(argv = [], context) {
  return runUpdate(argv, {
    packageRoot: context.packageRoot,
    currentVersion: context.currentVersion,
  });
}

module.exports = {
  runUpdateCommand,
};
