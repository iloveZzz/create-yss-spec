const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function compareNames(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function treeHash(rootPath) {
  const digest = crypto.createHash("sha256");

  function visit(currentPath, relativeDir = "") {
    for (const entry of fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => compareNames(left.name, right.name))) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        digest.update(`dir:${relativePath}\0`);
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        digest.update(`file:${relativePath}\0`);
        digest.update(fs.readFileSync(absolutePath));
        digest.update("\0");
      }
    }
  }

  visit(rootPath);
  return digest.digest("hex");
}

module.exports = { treeHash };
