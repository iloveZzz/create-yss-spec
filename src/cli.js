"use strict";

// Compatibility bridge for callers that still import `src/cli.js` directly.
// Production command execution lives under `src/cli/`, `src/commands/`,
// `src/template/`, `src/filesystem/`, `src/git/`, and `src/validation/`.
module.exports = require("./cli/index.js");
