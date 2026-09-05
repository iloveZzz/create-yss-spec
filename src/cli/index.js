"use strict";

const path = require("node:path");
const packageManifest = require("../../package.json");
const { runAttach } = require("../commands/attach");
const { runInit } = require("../commands/init");
const { runSync } = require("../commands/sync");
const { runUpdateCommand } = require("../commands/update");
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
    return runUpdateCommand(route.args, {
      packageRoot: PACKAGE_ROOT,
      currentVersion: packageManifest.version,
    });
  }
  if (route.command === "attach") {
    return runAttach(route.args);
  }
  if (route.command === "sync") {
    return runSync(route.args);
  }

  return runInit(route.args);
}

module.exports = {
  runCli,
};
