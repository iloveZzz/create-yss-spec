"use strict";

const path = require("node:path");

function projectDoctor({ targetDir = ".", cwd = process.cwd() } = {}) {
  const { buildDoctorReport } = require("../commands/doctor");
  return buildDoctorReport(path.resolve(cwd, targetDir));
}

module.exports = { projectDoctor };
