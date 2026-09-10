"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  checkManagedBaseline,
  checkOwnershipPolicy,
  checkLifecyclePolicies,
  runVerifierCheck,
} = require("../src/commands/doctor");
const {
  decorateMetadataOwnership,
  ownershipPolicyHash,
} = require("../src/template/ownership-metadata");
const {
  decorateMetadataLifecycle,
} = require("../src/template/lifecycle-metadata");

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

test("managed baseline ignores legacy README ownership records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-doctor-readme-"));
  try {
    fs.writeFileSync(path.join(root, "README.md"), "project-owned content\n");
    const result = report();
    checkManagedBaseline(result, root, {
      managedFiles: {
        "README.md": { contentHash: sha256("legacy template content\n") },
      },
    });
    assert.equal(result.checks[0].status, "ok");
    assert.deepEqual(result.checks[0].data, {
      total: 0,
      matched: 0,
      modified: 0,
      missing: 0,
      invalid: 0,
    });
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

test("ownership metadata decorator persists policy baseline and per-file ownership", () => {
  const metadata = decorateMetadataOwnership({
    managedFiles: {
      "AGENTS.md": { type: "render", contentHash: "a".repeat(64) },
      "scripts/verify-template": { type: "copy", contentHash: "b".repeat(64) },
    },
  });

  assert.equal(metadata.ownershipPolicyVersion, 1);
  assert.equal(metadata.ownershipPolicyHash, ownershipPolicyHash());
  assert.equal(metadata.managedFiles["AGENTS.md"].ownership, "managed-customizable");
  assert.equal(metadata.managedFiles["scripts/verify-template"].ownership, "managed");
});

test("doctor ownership check distinguishes missing, drift and matched baseline", () => {
  const missing = report();
  checkOwnershipPolicy(missing, { managedFiles: {} });
  assert.equal(missing.checks[0].status, "warning");
  assert.equal(missing.checks[0].data.state, "missing");

  const drift = report();
  checkOwnershipPolicy(drift, {
    ownershipPolicyVersion: 1,
    ownershipPolicyHash: "0".repeat(64),
    managedFiles: {},
  });
  assert.equal(drift.checks[0].status, "warning");
  assert.equal(drift.checks[0].data.state, "drift");

  const matched = report();
  checkOwnershipPolicy(
    matched,
    decorateMetadataOwnership({ managedFiles: {} }),
  );
  assert.equal(matched.checks[0].status, "ok");
  assert.equal(matched.checks[0].data.state, "matched");
});

test("doctor lifecycle checks distinguish missing, drift and matched baselines", () => {
  const missing = report();
  checkLifecyclePolicies(missing, {});
  assert.deepEqual(
    missing.checks.map((item) => [item.name, item.status]),
    [
      ["customization-policy", "warning"],
      ["generator-policy", "warning"],
    ],
  );

  const matchedMetadata = decorateMetadataLifecycle({ managedFiles: {} });
  const matched = report();
  checkLifecyclePolicies(matched, matchedMetadata);
  assert.deepEqual(
    matched.checks.map((item) => [item.name, item.status]),
    [
      ["customization-policy", "ok"],
      ["generator-policy", "ok"],
    ],
  );

  const drift = report();
  checkLifecyclePolicies(drift, {
    ...matchedMetadata,
    customizationPolicyHash: "0".repeat(64),
    generatorPolicyHash: "1".repeat(64),
  });
  assert.deepEqual(
    drift.checks.map((item) => [item.name, item.status]),
    [
      ["customization-policy", "warning"],
      ["generator-policy", "warning"],
    ],
  );
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
