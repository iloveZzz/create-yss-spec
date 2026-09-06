#!/usr/bin/env node

const { runCli } = require("../src/cli/index.js");
const { serializeError } = require("../src/cli/error-output.js");

const argv = process.argv.slice(2);
const wantsJson = argv.includes("--json");

(async () => {
  await runCli(argv);
})().catch((error) => {
  if (wantsJson) {
    process.stdout.write(serializeError(error));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
