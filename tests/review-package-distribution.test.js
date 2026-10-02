"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

test("initial stage-selective instance can prepare and read a current professional review draft", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-review-distribution-")), target = path.join(root, "project");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, "../bin/create-yss-spec.js");
  const invoke = (entry, args, cwd = target) => spawnSync(process.execPath, [entry, ...args], { cwd, encoding: "utf8" });
  const init = invoke(cli, ["--project-name", "Review distribution", "--business-domain", "Demo", "--agent-runtime", "codex", "--target-dir", target], root);
  assert.equal(init.status, 0, init.stderr);
  const metadata = JSON.parse(fs.readFileSync(path.join(target, ".yss-template.json")));
  assert.deepEqual(metadata.distribution.installedStages, ["stage.entry-triage", "stage.plan"]);
  assert.ok(fs.existsSync(path.join(target, ".template-spec/templates/review-bundle-template.yaml")));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const base = "docs/.scratch/review-distribution", cpRef = base + "/checkpoint.json";
  const write = (ref, value) => { fs.mkdirSync(path.dirname(path.join(target, ref)), { recursive: true }); fs.writeFileSync(path.join(target, ref), value); };
  const boundary = "check.domain-strategy-approved", subject = base + "/subject.json", evidence = base + "/evidence.txt";
  write(evidence, "Synthetic current review input\n"); write(subject, JSON.stringify({ fixture: true }));
  write(cpRef, JSON.stringify({ gates: {}, checks: { [boundary]: { status: "pending", subject_ref: subject, subject_digest: hash(fs.readFileSync(path.join(target, subject))), approval_scope: ["fixture.scope"], drafter_principal_ref: "fixture:author", basis: [{ ref: evidence, digest: hash(fs.readFileSync(path.join(target, evidence))) }], evidence_refs: [evidence] } } }));
  const result = invoke(path.join(target, "scripts/prepare-review-package"), ["--root", target, "--checkpoint", cpRef, "--check", boundary, "--role", "role.product-manager", "--actor", "fixture.reviewer", "--reviewer-principal", "fixture:reviewer", "--drafter-principal", "fixture:packet-owner", "--implementation-actor", "fixture.worker", "--task-id", "fixture.review", "--review-session", "fixture:session", "--work-unit", "work-unit.technical-analysis", "--output-dir", base + "/review"]);
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  assert.equal(prepared.decision, "pending"); assert.equal(prepared.execution_authorization, "not-granted");
  const task = invoke(path.join(target, "scripts/verify-digital-human-task-package"), [path.join(target, prepared.task_ref)]);
  assert.equal(task.status, 0, task.stderr);
  const record = path.join(target, prepared.bundle_ref), reader = path.join(target, "scripts/verify-approval-record");
  const history = invoke(reader, ["--history", record]);
  assert.equal(history.status, 0, history.stderr); assert.match(history.stdout, /execution_authorization=not-evaluated/);
  const current = invoke(reader, ["--require-approved", record]);
  assert.equal(current.status, 1); assert.match(current.stderr, /APPROVAL_CURRENT_INVALID.*decision.*approved/);
});
