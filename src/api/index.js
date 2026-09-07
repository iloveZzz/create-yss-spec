"use strict";

const { normalizeError } = require("../cli/error-output");
const { projectDoctor } = require("./project-doctor");
const { projectDiff } = require("./project-diff");
const { templatePlan } = require("./template-plan");
const { templateApply } = require("./template-apply");

const API_VERSION = 1;

function toErrorEnvelope(error) {
  return normalizeError(error);
}

module.exports = {
  API_VERSION,
  projectDoctor,
  projectDiff,
  templatePlan,
  templateApply,
  toErrorEnvelope,
};
