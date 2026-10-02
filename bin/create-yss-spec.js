#!/usr/bin/env node

const { serializeError } = require("../src/cli/error-output.js");

const argv = process.argv.slice(2);
const wantsJson = argv.includes("--json");

(async () => {
  const { assertNodeVersion } = await import("../src/runtime-store.mjs");
  assertNodeVersion();
  const { runCli } = require("../src/cli/index.js");
  await runCli(argv);
})().catch((error) => {
  if (wantsJson) {
    process.stdout.write(serializeError(error));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
