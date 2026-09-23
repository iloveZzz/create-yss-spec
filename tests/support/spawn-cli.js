"use strict";

const path = require("node:path");
const { spawnSync: nativeSpawnSync } = require("node:child_process");

// Existing integration scenarios exercise the CLI with a selected runtime.
// The missing-runtime contract has a dedicated test using nativeSpawnSync.
function spawnSync(command, args, options) {
  if (command === process.execPath && Array.isArray(args) &&
      path.basename(args[0] || "") === "create-yss-spec.js" &&
      !args.includes("--agent-runtime") &&
      !args.some((arg) => ["--help", "-h", "--version", "-v"].includes(arg)) &&
      !["sync", "doctor", "diff", "update", "upgrade", "skills"].includes(args[1])) {
    return nativeSpawnSync(command, [...args, "--agent-runtime", "codex"], options);
  }
  return nativeSpawnSync(command, args, options);
}

module.exports = { spawnSync };
