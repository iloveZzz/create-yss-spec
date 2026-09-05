"use strict";

const { runCli: runLegacyCli } = require("../cli");

function runSync(argv = []) {
  return runLegacyCli(["sync", ...argv]);
}

module.exports = {
  runSync,
};
