const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { identityForPaths, parseIdentity } = require("../src/content-identity");

test("batched git identities match git hash-object", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "yss-cli-identity-"));
  try {
    const init = spawnSync("git", ["-C", root, "init", "-q"], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const a = path.join(root, "a.txt");
    const b = path.join(root, "b.txt");
    writeFileSync(a, "alpha\n");
    writeFileSync(b, "beta\n");
    const identities = identityForPaths([a, b]);
    const hashed = spawnSync("git", ["-C", root, "hash-object", "--stdin-paths"], { encoding: "utf8", input: a + "\n" + b + "\n" }).stdout.split("\n").filter(Boolean);
    assert.equal(identities.get(a), "git-sha1:" + hashed[0]);
    assert.equal(identities.get(b), "git-sha1:" + hashed[1]);
    assert.equal(parseIdentity(identities.get(a)).algo, "git-sha1");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("non-repository paths fall back to a disclosed sha256 identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "yss-cli-plain-"));
  try {
    const a = path.join(root, "a.txt");
    writeFileSync(a, "alpha\n");
    assert.match(identityForPaths([a]).get(a), /^sha256:[0-9a-f]{64}$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
