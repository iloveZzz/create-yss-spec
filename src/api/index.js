"use strict";

const { projectDoctor } = require("./project-doctor");
const { projectDiff } = require("./project-diff");
const { templatePlan } = require("./template-plan");
const { templateApply } = require("./template-apply");

const API_VERSION = 1;

module.exports = {
  API_VERSION,
  projectDoctor,
  projectDiff,
  templatePlan,
  templateApply,
};
