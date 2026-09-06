"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  checkManagedBaseline,
  runVerifierCheck,
} = require("../src/commands/doctor");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function report() {
  return { ok: true, checks: [] };
}

test("managed baseline reports matched and modified files without mutating them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-doctor-baseline-"));
  try {
    const matchedContent = "matched\n";
    const modifiedBaseline = "baseline\n";
    fs.writeFileSync(path.join(root, "matched.txt"), matchedContent);
    fs.writeFileSync(path.join(root, "modified.txt"), "local change\n");

    const metadata = {
      managedFiles: {
        "matched.txt": { contentHash: sha256(matchedContent) },
        "modified.txt": { contentHash: sha256(modifiedBaseline) },
      },
    };
    const result = report();
    checkManagedBaseline(result, root, metadata);

    assert.equal(result.ok, true);
    assert.equal(result.checks.length, 1);
    assert.equal(result.checks[0].name, "managed-baseline");
    assert.equal(result.checks[0].status, "warning");
    assert.deepEqual(result.checks[0].data, {
      total: 2,
      matched: 1,
      modified: 1,
      missing: 0,
      invalid: 0,
    });
    assert.equal(fs.readFileSync(path.join(root, "modified.txt"), "utf8"), "local change\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("managed baseline fails closed on malformed records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-doctor-invalid-"));
  try {
    const result = report();
    checkManagedBaseline(result, root, {
      managedFiles: { "bad.txt": { contentHash: "not-a-hash" } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].status, "error");
    assert.equal(result.checks[0].data.invalid, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifier check records success and failure as structured doctor checks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-doctor-verifier-"));
  try {
    const scripts = path.join(root, "scripts");
    fs.mkdirSync(scripts);

    const pass = path.join(scripts, "pass");
    fs.writeFileSync(pass, "#!/usr/bin/env node\nprocess.exit(0);\n");
    fs.chmodSync(pass, 0o755);

    const fail = path.join(scripts, "fail");
    fs.writeFileSync(
      fail,
      "#!/usr/bin/env node\nprocess.stderr.write('broken'); process.exit(2);\n",
    );
    fs.chmodSync(fail, 0o755);

    const passReport = report();
    runVerifierCheck(
      passReport,
      root,
      { name: "pass", path: "scripts/pass", args: [] },
      false,
    );
    assert.equal(passReport.ok, true);
    assert.equal(passReport.checks[0].status, "ok");

    const failReport = report();
    runVerifierCheck(
      failReport,
      root,
      { name: "fail", path: "scripts/fail", args: [] },
      false,
    );
    assert.equal(failReport.ok, false);
    assert.equal(failReport.checks[0].status, "error");
    assert.match(failReport.checks[0].detail, /broken/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("git-required verifier is skipped as warning outside Git worktree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-doctor-git-verifier-"));
  try {
    const scripts = path.join(root, "scripts");
    fs.mkdirSync(scripts);
    const verifier = path.join(scripts, "verify");
    fs.writeFileSync(verifier, "#!/usr/bin/env node\nprocess.exit(99);\n");
    fs.chmodSync(verifier, 0o755);

    const result = report();
    runVerifierCheck(
      result,
      root,
      {
        name: "verify-template",
        path: "scripts/verify",
        args: [],
        requiresGit: true,
      },
      false,
    );

    assert.equal(result.ok, true);
    assert.equal(result.checks[0].status, "warning");
    assert.match(result.checks[0].detail, /不会临时 git init/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
