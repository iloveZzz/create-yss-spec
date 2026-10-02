"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cli = path.resolve(__dirname, "../bin/create-yss-spec.js");
function run(args, cwd) { return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" }); }
function read(root, name) { return JSON.parse(fs.readFileSync(path.join(root, name), "utf8")); }

for (const runtime of ["codex", "cursor", "pi"]) {
  test(`work-unit skill preflight and minimal install close the loop on ${runtime}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-preflight-"));
    try {
      const target = path.join(root, "project");
      const init = run(["--project-name", "Preflight", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", runtime], root);
      assert.equal(init.status, 0, init.stderr);
      const query = (extra = []) => spawnSync(process.execPath,
        [path.join(target, "scripts/query-lifecycle-context"), "--work-unit", "work-unit.plan-requirements", ...extra],
        { cwd: target, encoding: "utf8" });
      const before = fs.readFileSync(path.join(target, ".yss-template.json"));
      const plain = query();
      assert.equal(plain.status, 0, plain.stderr);
      assert.equal("skill_readiness" in JSON.parse(plain.stdout), false);
      const check = query(["--check-skills"]);
      assert.equal(check.status, 2, check.stderr);
      const readiness = JSON.parse(check.stdout).skill_readiness;
      assert.equal(readiness.status, "missing");
      assert.equal(readiness.agent_runtime, runtime);
      assert.deepEqual(readiness.missing_skills, ["domain-modeling", "grilling"]);
      assert.match(readiness.remediation.plan_command, /--plan$/);
      assert.equal(fs.readFileSync(path.join(target, ".yss-template.json")).equals(before), true);
      const plan = run(["skills", "ensure", ...readiness.missing_skills, "--plan", "--target-dir", target], root);
      assert.equal(plan.status, 0, plan.stderr);
      assert.deepEqual(JSON.parse(plan.stdout).addSkills, readiness.missing_skills);
      assert.equal(fs.readFileSync(path.join(target, ".yss-template.json")).equals(before), true);
      const apply = run(["skills", "ensure", ...readiness.missing_skills, "--apply", "--target-dir", target], root);
      assert.equal(apply.status, 0, apply.stderr);
      const ready = query(["--check-skills", "--agent-runtime", runtime]);
      assert.equal(ready.status, 0, ready.stderr);
      assert.equal(JSON.parse(ready.stdout).skill_readiness.status, "ready");
      const installed = fs.readFileSync(path.join(target, ".yss-template.json"));
      const repeat = run(["skills", "ensure", ...readiness.missing_skills, "--apply", "--target-dir", target], root);
      assert.equal(repeat.status, 0, repeat.stderr);
      assert.equal(fs.readFileSync(path.join(target, ".yss-template.json")).equals(installed), true);
      for (const id of ["tdd", "implement", "to-spec", "code-review"]) assert.equal(fs.existsSync(path.join(target, ".agents/skills", id)), false);
      assert.match(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /--check-skills/);
      assert.match(fs.readFileSync(path.join(target, ".template-spec/user-guide/用户手册.md"), "utf8"), /--check-skills/);
      fs.appendFileSync(path.join(target, ".agents/skills/grilling/SKILL.md"), "\nLocal drift\n");
      const drift = query(["--check-skills"]);
      assert.equal(drift.status, 2, drift.stderr);
      assert.equal(JSON.parse(drift.stdout).skill_readiness.issues.some(issue => issue.code === "skill-hash-drift"), true);
      assert.equal(query().status, 0, "ordinary queries remain read-only diagnostics during local drift");
      const invalid = spawnSync(process.execPath, [path.join(target, "scripts/query-lifecycle-context"), "--check-skills"], { cwd: target, encoding: "utf8" });
      assert.equal(invalid.status, 1);
      const metadata = read(target, ".yss-template.json");
      metadata.templateCommit = "0".repeat(40);
      fs.writeFileSync(path.join(target, ".yss-template.json"), JSON.stringify(metadata));
      const mismatch = run(["skills", "ensure", "tdd", "--plan", "--target-dir", target], root);
      assert.equal(mismatch.status, 1);
      assert.match(mismatch.stderr, /快照与实例模板提交不一致/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

for (const runtime of ["codex", "cursor", "pi"]) {
  test(`slim ${runtime} init has one platform and Plan asset closure`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `yss-slim-${runtime}-`));
    try {
      const missing = run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", path.join(root, "missing")], root);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /--agent-runtime/);
      const target = path.join(root, "project");
      const init = run(["--project-name", "Probe", "--business-domain", "Demo", "--team-size", "4", "--target-dir", target, "--agent-runtime", runtime], root);
      assert.equal(init.status, 0, init.stderr);
      const metadata = read(target, ".yss-template.json");
      const lock = read(target, "skills-lock.json");
      assert.equal(metadata.metadataSchemaVersion, 3);
      assert.deepEqual(metadata.distribution.runtimes, [runtime]);
      assert.deepEqual(Object.keys(lock.skills.shared).sort(), ["i-have-adhd", "yss-harness-upgrade", "yss-product-lifecycle", "yss-research"]);
      assert.deepEqual(lock.projectionRoots, [`.${runtime}/skills`]);
      assert.deepEqual(metadata.distribution.installedStages, ["stage.entry-triage", "stage.plan"]);
      assert.equal(fs.existsSync(path.join(target, ".template-spec/plan/templates/plan-template.md")), true);
      assert.equal(fs.existsSync(path.join(target, ".template-spec/api/templates/openapi-freeze-record-template.md")), false);
      assert.equal(fs.existsSync(path.join(target, ".template-spec/adr/README.md")), false);
      assert.equal(fs.existsSync(path.join(target, "scripts/lib/api-contract-decision.test.mjs")), false);
      assert.equal(fs.existsSync(path.join(target, ".vscode/mcp.json")), false);
      assert.equal(fs.existsSync(path.join(target, ".template-spec/design/preview.html")), false);
      const verify = spawnSync(path.join(target, "scripts/verify-project-instance"), [], { cwd: target, encoding: "utf8" });
      assert.equal(verify.status, 0, verify.stderr);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test("stage asset plan, apply, repeat and sync preserve the selected file set", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-assets-"));
  const target = path.join(root, "project");
  try {
    assert.equal(run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", "codex"], root).status, 0);
    const before = fs.readFileSync(path.join(target, ".yss-template.json"));
    const plan = run(["assets", "ensure", "stage.spec-architecture", "--target-dir", target, "--plan"], root);
    assert.equal(plan.status, 0, plan.stderr);
    const preview = JSON.parse(plan.stdout);
    assert.equal(preview.addStage, "stage.spec-architecture");
    assert.ok(preview.paths.includes(".template-spec/templates/spec-template.md"));
    assert.deepEqual(fs.readFileSync(path.join(target, ".yss-template.json")), before);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/templates/spec-template.md")), false);
    const applied = run(["assets", "ensure", "stage.spec-architecture", "--target-dir", target, "--apply"], root);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/templates/spec-template.md")), true);
    const repeated = run(["assets", "ensure", "stage.spec-architecture", "--target-dir", target, "--apply"], root);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /无需写入/);
    const sync = run(["sync", "--target-dir", target], root);
    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/templates/spec-template.md")), true);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/api/templates/openapi-freeze-record-template.md")), false);
    const invalid = run(["assets", "ensure", "stage.unknown", "--target-dir", target, "--plan"], root);
    assert.notEqual(invalid.status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("ensure resolves required dependencies, is idempotent, rejects platform-only skills and rolls back", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-ensure-"));
  const target = path.join(root, "project");
  try {
    assert.equal(run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", "codex"], root).status, 0);
    const plan = run(["skills", "ensure", "yss-web-controller", "--target-dir", target, "--plan"], root);
    assert.equal(plan.status, 0, plan.stderr);
    assert.deepEqual(JSON.parse(plan.stdout).addSkills, ["alibaba-java-code-style", "yss-dto", "yss-skill-source-index-refresh", "yss-web-controller"]);
    const platform = run(["skills", "ensure", "product-design", "--target-dir", target, "--plan"], root);
    assert.notEqual(platform.status, 0);
    assert.match(platform.stderr, /平台专属/);
    const before = fs.readFileSync(path.join(target, ".yss-template.json"));
    const script = path.join(target, "scripts/update-skill-lock");
    const scriptBefore = fs.readFileSync(script);
    fs.writeFileSync(script, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const failed = run(["skills", "ensure", "yss-web-controller", "--target-dir", target, "--apply"], root);
    assert.notEqual(failed.status, 0);
    assert.equal(fs.existsSync(path.join(target, ".agents/skills/yss-web-controller")), false);
    assert.deepEqual(fs.readFileSync(path.join(target, ".yss-template.json")), before);
    fs.writeFileSync(script, scriptBefore, { mode: 0o755 });
    const applied = run(["skills", "ensure", "yss-web-controller", "--target-dir", target, "--apply"], root);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.existsSync(path.join(target, ".agents/skills/yss-skill-source-index-refresh/references/backend-component-platform-compatibility.md")), true);
    const repeated = run(["skills", "ensure", "yss-web-controller", "--target-dir", target, "--apply"], root);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /无需写入/);
    const mismatch = read(target, ".yss-template.json");
    mismatch.templateCommit = "0".repeat(40);
    fs.writeFileSync(path.join(target, ".yss-template.json"), JSON.stringify(mismatch));
    const rejected = run(["skills", "ensure", "yss-domain", "--target-dir", target, "--apply"], root);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /先运行.*sync/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("runtime add installs existing skills and runtime config without changing selection on repeat", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-runtime-"));
  const target = path.join(root, "project");
  try {
    assert.equal(run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", "pi"], root).status, 0);
    for (const skillRoot of [".agents/skills", ".pi/skills"]) {
      const local = path.join(target, skillRoot, "project-local");
      fs.mkdirSync(local, { recursive: true });
      fs.writeFileSync(path.join(local, "SKILL.md"), "---\nname: project-local\ndescription: Project skill.\n---\n");
    }
    const register = spawnSync(path.join(target, "scripts/update-skill-lock"), ["--add=project-local"], { cwd: target, encoding: "utf8" });
    assert.equal(register.status, 0, register.stderr);
    const applied = run(["skills", "runtime", "add", "cursor", "--target-dir", target, "--apply"], root);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.existsSync(path.join(target, ".cursor/mcp.json")), true);
    assert.equal(fs.existsSync(path.join(target, ".cursor/skills/yss-research/SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(target, ".cursor/skills/project-local/SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(target, ".cursorrules")), true);
    assert.deepEqual(read(target, "skills-lock.json").projectionRoots, [".pi/skills", ".cursor/skills"]);
    const repeated = run(["skills", "runtime", "add", "cursor", "--target-dir", target, "--apply"], root);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /无需写入/);
    const sync = run(["sync", "--target-dir", target], root);
    assert.equal(sync.status, 0, sync.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("v2 legacy-all sync and prune preserve old projections and user edits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-v2-legacy-"));
  const target = path.join(root, "project");
  fs.mkdirSync(target);
  try {
    const runtime = require("../src/template/instance-runtime");
    const vars = { projectName: "Legacy", businessDomain: "Demo", teamSize: "4", issueTracker: "github", includeExampleDocs: true, distribution: { mode: "legacy-all" } };
    const operations = runtime.buildDesiredManagedOperations(target, vars, "init");
    for (const operation of operations) {
      fs.mkdirSync(path.dirname(operation.targetPath), { recursive: true });
      fs.writeFileSync(operation.targetPath, operation.desiredContent);
      fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
    }
    const updateLock = spawnSync(path.join(target, "scripts/update-skill-lock"), [], { cwd: target, encoding: "utf8" });
    assert.equal(updateLock.status, 0, updateLock.stderr);
    const metadata = runtime.buildMetadata(vars, operations);
    metadata.metadataSchemaVersion = 2;
    delete metadata.distribution;
    fs.writeFileSync(path.join(target, ".yss-template.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    fs.appendFileSync(path.join(target, "AGENTS.md"), "\nUser addition\n");
    const synced = run(["sync", "--target-dir", target, "--prune"], root);
    assert.equal(synced.status, 0, synced.stderr);
    assert.equal(read(target, ".yss-template.json").distribution.mode, "legacy-all");
    assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8").includes("User addition"), true);
    for (const runtimeName of ["codex", "cursor", "pi"]) {
      assert.equal(fs.existsSync(path.join(target, `.${runtimeName}/skills/yss-cache/SKILL.md`)), true);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("existing v3 selected instances keep their original asset distribution on sync", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-v3-selected-"));
  const target = path.join(root, "project");
  fs.mkdirSync(target);
  try {
    const runtime = require("../src/template/instance-runtime");
    const distribution = { mode: "selected", runtimes: ["codex"], installedSkills: [
      "yss-product-lifecycle", "yss-implementation-contract-compiler", "yss-research", "i-have-adhd",
    ] };
    const vars = { projectName: "Existing", businessDomain: "Demo", teamSize: "4", issueTracker: "github", includeExampleDocs: false, distribution };
    const operations = runtime.buildDesiredManagedOperations(target, vars, "init");
    for (const operation of operations) {
      fs.mkdirSync(path.dirname(operation.targetPath), { recursive: true });
      fs.writeFileSync(operation.targetPath, operation.desiredContent);
      fs.chmodSync(operation.targetPath, fs.statSync(operation.sourcePath).mode & 0o777);
    }
    const updateLock = spawnSync(path.join(target, "scripts/update-skill-lock"), [], { cwd: target, encoding: "utf8" });
    assert.equal(updateLock.status, 0, updateLock.stderr);
    fs.writeFileSync(path.join(target, ".yss-template.json"), `${JSON.stringify(runtime.buildMetadata(vars, operations), null, 2)}\n`);
    const sync = run(["sync", "--target-dir", target], root);
    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/templates/spec-template.md")), true);
    assert.equal(read(target, ".yss-template.json").distribution.assetProfile, undefined);
    assert.doesNotMatch(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /assets ensure/);
    assert.doesNotMatch(fs.readFileSync(path.join(target, "README.md"), "utf8"), /assets ensure/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("design-system on-demand install uses the project-local update tool", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-design-tool-"));
  const target = path.join(root, "project");
  try {
    assert.equal(run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", "codex"], root).status, 0);
    const install = run(["skills", "ensure", "yss-design-system", "--target-dir", target, "--apply"], root);
    assert.equal(install.status, 0, install.stderr);
    const skill = fs.readFileSync(path.join(target, ".agents/skills/yss-design-system/SKILL.md"), "utf8");
    assert.match(skill, /scripts\/design-md export/);
    assert.doesNotMatch(skill, /node \.template-source\/tooling\/node\/scripts\/design-md\.mjs/);
    const drift = spawnSync(path.join(target, "scripts/design-md"), ["drift"], { cwd: target, encoding: "utf8" });
    assert.equal(drift.status, 0, drift.stderr);
    const sync = run(["sync", "--target-dir", target], root);
    assert.equal(sync.status, 0, sync.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("retired entries stay absent and commit entry installs its hidden shared contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-retirement-")), target = path.join(root, "project");
  try {
    const init = run(["--project-name", "Probe", "--business-domain", "Demo", "--target-dir", target, "--agent-runtime", "codex"], root);
    assert.equal(init.status, 0, init.stderr);
    assert.equal(fs.existsSync(path.join(target, ".template-spec/agents/domain.md")), false);
    assert.match(fs.readFileSync(path.join(target, "CONTEXT.md"), "utf8"), /消费规则/);
    const before = fs.readFileSync(path.join(target, ".yss-template.json"));
    for (const id of ["wait-what", "grill-with-docs", "to-questionnaire", "improve-codebase-architecture", "data-analytics"]) {
      const result = run(["skills", "ensure", id, "--target-dir", target, "--apply"], root);
      assert.notEqual(result.status, 0);
      assert.deepEqual(fs.readFileSync(path.join(target, ".yss-template.json")), before);
      assert.equal(fs.existsSync(path.join(target, ".agents/skills", id)), false);
    }
    const plan = run(["skills", "ensure", "frontend-commit", "--target-dir", target, "--plan"], root);
    assert.equal(plan.status, 0, plan.stderr);
    assert.deepEqual(JSON.parse(plan.stdout).addSkills, ["frontend-commit", "git-commit-core"]);
    const apply = run(["skills", "ensure", "frontend-commit", "--target-dir", target, "--apply"], root);
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(fs.existsSync(path.join(target, ".agents/skills/git-commit-core/SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(target, ".agents/skills/java-backend-commit")), false);
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
});
