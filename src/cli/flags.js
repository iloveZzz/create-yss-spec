"use strict";

const HELP_FLAGS = new Set(["--help", "-h", "-help"]);
const VERSION_FLAGS = new Set(["--version", "-v", "-version"]);

module.exports = {
  HELP_FLAGS,
  VERSION_FLAGS,
};
