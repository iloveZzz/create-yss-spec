"use strict";

const path = require("node:path");
const packageManifest = require("../../package.json");
const { runCli: runLegacyCli } = require("../cli");
const { runUpdate } = require("../self-update");
const { printHelp, printVersion } = require("./help");
const { resolveCommand } = require("./router");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");

async function runCli(argv = []) {
  const route = resolveCommand(argv);

  if (route.command === "help") {
    printHelp(packageManifest.version);
    return;
  }
  if (route.command === "version") {
    printVersion(packageManifest.version);
    return;
  }
  if (route.command === "update") {
    return runUpdate(route.args, {
      packageRoot: PACKAGE_ROOT,
      currentVersion: packageManifest.version,
    });
  }

  // init / attach / sync still execute through the legacy core during P0-B.
  // The protocol boundary is now modular; command implementations are moved
  // out one-by-one in P0-C without changing the public entry contract.
  return runLegacyCli(argv);
}

module.exports = {
  runCli,
};
