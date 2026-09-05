"use strict";

const { UPDATE_COMMANDS } = require("../self-update");
const { HELP_FLAGS, VERSION_FLAGS } = require("./flags");

function argvIncludesFlag(argv, flags) {
  return argv.some((arg) => flags.has(arg));
}

function resolveCommand(argv = []) {
  if (argvIncludesFlag(argv, HELP_FLAGS)) {
    return { command: "help", args: [] };
  }
  if (argvIncludesFlag(argv, VERSION_FLAGS)) {
    return { command: "version", args: [] };
  }

  const [head, ...rest] = argv;
  if (head === "sync") {
    return { command: "sync", args: rest };
  }
  if (head === "attach") {
    return { command: "attach", args: rest };
  }
  if (UPDATE_COMMANDS.has(head)) {
    return { command: "update", alias: head, args: rest };
  }

  return { command: "init", args: argv };
}

module.exports = {
  argvIncludesFlag,
  resolveCommand,
};
