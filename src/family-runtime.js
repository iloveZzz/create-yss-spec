"use strict";

const path = require("node:path");
const packageManifest = require("../package.json");
const { createFamilyGuard } = require("./family-identity");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const BUNDLED_TEMPLATE_ROOT = path.join(PACKAGE_ROOT, "template");
const checkTargetFamily = createFamilyGuard(PACKAGE_ROOT, packageManifest.name);

function assertBundledFamily(snapshot) {
  checkTargetFamily(BUNDLED_TEMPLATE_ROOT, { snapshot });
  return snapshot;
}

function assertTargetFamily(targetDir) {
  checkTargetFamily(path.resolve(targetDir));
}

module.exports = {
  assertBundledFamily,
  assertTargetFamily,
};
