"use strict";

const { runCli: runLegacyCli } = require("../cli");

function runAttach(argv = []) {
  return runLegacyCli(["attach", ...argv]);
}

module.exports = {
  runAttach,
};
