"use strict";

const path = require("node:path");
const { buildDoctorReport } = require("../commands/doctor");

function projectDoctor({ targetDir = ".", cwd = process.cwd() } = {}) {
  return buildDoctorReport(path.resolve(cwd, targetDir));
}

module.exports = { projectDoctor };
