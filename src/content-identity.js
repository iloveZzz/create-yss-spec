"use strict";
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HEX_LENGTH = { "git-sha1": 40, "git-sha256": 64, sha256: 64 };
const IDENTITY_PATTERN = /^(git-sha1|git-sha256|sha256):([0-9a-f]+)$/;

function parseIdentity(value) {
  if (typeof value !== "string") return null;
  const match = IDENTITY_PATTERN.exec(value);
  if (!match || match[2].length !== HEX_LENGTH[match[1]]) return null;
  return { algo: match[1], value: match[2] };
}
function formatIdentity(algo, hex) {
  const length = HEX_LENGTH[algo];
  if (!length) throw new TypeError("未知身份算法: " + algo);
  if (typeof hex !== "string" || !new RegExp("^[0-9a-f]{" + length + "}$").test(hex)) throw new TypeError("身份摘要非法: " + algo + ":" + hex);
  return algo + ":" + hex;
}
function identityEquals(left, right) {
  if (left === right) return true;
  const a = parseIdentity(left);
  const b = parseIdentity(right);
  if (!a || !b) return false;
  return a.algo === b.algo && a.value === b.value;
}
function sha256Identity(bytes) {
  return formatIdentity("sha256", createHash("sha256").update(bytes).digest("hex"));
}
function realpathOrResolve(target) {
  try { return fs.realpathSync(target); } catch { return path.resolve(target); }
}

// Resolve the enclosing Git work tree once per directory. Git reports the
// canonical path, so the file side is canonicalized too: /var and /private/var
// must not look like different trees on macOS.
const rootCache = new Map();
function gitRootFor(filePath) {
  const directory = path.dirname(filePath);
  if (rootCache.has(directory)) return rootCache.get(directory);
  const result = spawnSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const root = result.status === 0 ? result.stdout.trim() : null;
  rootCache.set(directory, root);
  return root;
}

function repoState(root) {
  const format = spawnSync("git", ["-C", root, "rev-parse", "--show-object-format"], { encoding: "utf8" });
  const algo = format.status === 0 && format.stdout.trim() === "sha256" ? "git-sha256" : "git-sha1";
  return { algo };
}

// One git hash-object --stdin-paths call per repository instead of one process
// per generated file; default clean filters keep the identity equal to the blob
// Git would commit for the path.
function batchIdentities(root, refs, algo) {
  const result = new Map();
  if (!refs.length) return result;
  const proc = spawnSync("git", ["-C", root, "hash-object", "--stdin-paths"], {
    encoding: "utf8",
    input: refs.join("\n") + "\n",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (proc.status === 0) {
    const lines = proc.stdout.split("\n").filter(Boolean);
    refs.forEach((ref, index) => {
      const hex = lines[index];
      if (hex && new RegExp("^[0-9a-f]{" + HEX_LENGTH[algo] + "}$").test(hex)) result.set(ref, formatIdentity(algo, hex));
    });
  }
  return result;
}

// Map absolute file paths to content identities. Paths outside a Git work tree
// fall back to a disclosed sha256 identity.
function identityForPaths(filePaths) {
  const identities = new Map();
  const byRoot = new Map();
  for (const file of filePaths) {
    const root = gitRootFor(file);
    if (!root) {
      try { identities.set(file, sha256Identity(fs.readFileSync(file))); } catch { /* unreadable: omit */ }
      continue;
    }
    const realRoot = realpathOrResolve(root);
    const ref = path.relative(realRoot, realpathOrResolve(file)).split(path.sep).join("/");
    if (!ref || ref.startsWith("..") || path.isAbsolute(ref)) {
      try { identities.set(file, sha256Identity(fs.readFileSync(file))); } catch { /* unreadable: omit */ }
      continue;
    }
    let group = byRoot.get(realRoot);
    if (!group) byRoot.set(realRoot, group = []);
    group.push({ file, ref });
  }
  for (const [root, group] of byRoot) {
    const state = repoState(root);
    const hashed = batchIdentities(root, group.map((item) => item.ref), state.algo);
    for (const item of group) {
      const identity = hashed.get(item.ref);
      if (identity) identities.set(item.file, identity);
      else {
        try { identities.set(item.file, sha256Identity(fs.readFileSync(item.file))); } catch { /* unreadable: omit */ }
      }
    }
  }
  return identities;
}

module.exports = { parseIdentity, formatIdentity, identityEquals, sha256Identity, identityForPaths };
