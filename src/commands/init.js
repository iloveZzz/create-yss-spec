"use strict";

const { runCli: runLegacyCli } = require("../cli");

async function runInit(argv = []) {
  return runLegacyCli(argv);
}

module.exports = {
  runInit,
};
