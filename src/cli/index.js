"use strict";

// Stable CLI module boundary for the v4 modularization.
//
// The implementation still lives in ../cli.js during the compatibility-first
// migration. New modules should be introduced under src/cli/ and wired through
// this entry point so callers do not depend on the legacy monolith directly.
module.exports = require("../cli");
