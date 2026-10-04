"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function readonlyInventory(root, ref = ".") {
  const file = path.join(root, ref), stat = fs.lstatSync(file, { bigint: true });
  const record = { ref, mode: String(stat.mode), modifiedAt: String(stat.mtimeNs) };
  if (stat.isSymbolicLink()) return [{ ...record, type: "link", target: fs.readlinkSync(file) }];
  if (stat.isFile()) return [{ ...record, type: "file", sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }];
  return [{ ...record, type: "directory" }, ...fs.readdirSync(file).sort().flatMap(name => readonlyInventory(root, ref === "." ? name : `${ref}/${name}`))];
}

module.exports = { readonlyInventory };
