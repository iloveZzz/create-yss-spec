"use strict";

const path = require("node:path");
const packageManifest = require("../../package.json");
const instanceRuntime = require("../template/instance-runtime");
const {
  decorateMetadataOwnership,
} = require("../template/ownership-metadata");
const {
  decorateMetadataLifecycle,
} = require("../template/lifecycle-metadata");

// Composition-root decorator: all CLI metadata writes persist ownership and
// lifecycle-policy baselines without duplicating cross-cutting concerns in
// init/attach/sync command implementations.
const writeTemplateMetadataBase = instanceRuntime.writeTemplateMetadata;
instanceRuntime.writeTemplateMetadata = function writePolicyAwareTemplateMetadata(
  targetDir,
  metadata,
  transaction = null,
) {
  const ownershipAware = decorateMetadataOwnership(metadata);
  const lifecycleAware = decorateMetadataLifecycle(ownershipAware);
  return writeTemplateMetadataBase(targetDir, lifecycleAware, transaction);
};

const { runAttach } = require("../commands/attach");
const { runDiff } = require("../commands/diff");
const { runDoctor } = require("../commands/doctor");
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
  if (route.command === "doctor") {
    return runDoctor(route.args);
  }
  if (route.command === "diff") {
    return runDiff(route.args);
  }

  return runInit(route.args);
}

module.exports = {
  runCli,
};
