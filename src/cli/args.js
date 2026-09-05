"use strict";

const { HELP_FLAGS, VERSION_FLAGS } = require("./flags");

const VALUE_OPTIONS = new Map([
  ["--project-name", "projectName"],
  ["--business-domain", "businessDomain"],
  ["--team-size", "teamSize"],
  ["--target-dir", "targetDir"],
  ["--issue-tracker", "issueTracker"],
]);

function parseArgs(argv = []) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (VALUE_OPTIONS.has(current)) {
      if (!next || next.startsWith("--")) {
        throw new Error(`${current} 需要一个值`);
      }
      options[VALUE_OPTIONS.get(current)] = next;
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      options.dryRun = true;
    } else if (current === "--apply") {
      options.apply = true;
    } else if (current === "--force") {
      options.force = true;
    } else if (current === "--git-init") {
      options.gitInit = true;
    } else if (current === "--include-example-docs") {
      options.includeExampleDocs = true;
    } else if (current === "--no-example-docs") {
      options.includeExampleDocs = false;
    } else if (HELP_FLAGS.has(current)) {
      options.help = true;
    } else if (VERSION_FLAGS.has(current)) {
      options.version = true;
    } else {
      throw new Error(`不支持的参数：${current}`);
    }
  }

  return options;
}

module.exports = {
  VALUE_OPTIONS,
  parseArgs,
};
