"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assetPaths, assetRequirements } = require("../src/template/asset-runtime");

const distribution = {
  mode: "selected", assetProfile: "stage-selective",
  installedStages: ["stage.entry-triage", "stage.plan"],
  installedSkills: [], resourceSkills: [],
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yss-asset-dependencies-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundled = path.resolve(__dirname, "../template");
  const source = fs.existsSync(bundled) ? bundled : path.resolve(__dirname, "../../..");
  for (const entry of ["scripts", ".template-spec", ".agents"]) fs.cpSync(path.join(source, entry), path.join(root, entry), { recursive: true });
  const write = (ref, content) => {
    fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
    fs.writeFileSync(path.join(root, ref), content);
  };
  const append = source => fs.appendFileSync(path.join(root, "scripts/inspect-plan-spec"), `\n${source}\n`);
  return { root, write, append };
}

test("阶段分发保留固定 Python 子进程与本地 Schema/resource 闭包，不分发无关脚本", t => {
  const f = fixture(t);
  f.append("spawnSync('python3', [path.join(ROOT, 'scripts/lib/dependency-probe.py')]);\nconst schema = '.template-spec/process/schemas/dependency-probe.schema.json';\nconst resource = new URL('./dependency-resource.json', import.meta.url);");
  f.write("scripts/lib/dependency-probe.py", "print('dependency-ready')\n");
  f.write("scripts/dependency-resource.json", '{"ready":true}\n');
  f.write("scripts/lib/unrelated-probe.py", "raise RuntimeError('must not distribute')\n");
  f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({ $ref: "./dependency-child.schema.json" }));
  f.write(".template-spec/process/schemas/dependency-child.schema.json", JSON.stringify({ $defs: { local: { type: "string" } }, $dynamicRef: "./dependency-leaf.schema.json#/$defs/value" }));
  f.write(".template-spec/process/schemas/dependency-leaf.schema.json", JSON.stringify({ $defs: { value: { type: "string" } } }));
  const files = assetPaths(f.root, distribution);
  for (const ref of ["scripts/lib/dependency-probe.py", "scripts/dependency-resource.json", ".template-spec/process/schemas/dependency-probe.schema.json", ".template-spec/process/schemas/dependency-child.schema.json", ".template-spec/process/schemas/dependency-leaf.schema.json"]) assert.ok(files.has(ref), ref);
  assert.equal(files.has("scripts/lib/unrelated-probe.py"), false);
  const python = spawnSync("python3", [path.join(f.root, "scripts/lib/dependency-probe.py")], { encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr);
  assert.equal(python.stdout.trim(), "dependency-ready");
});

test("阶段资产说明保留每项依赖的来源，并区分 Python 解释器与校验包", t => {
  const f = fixture(t);
  f.append("spawnSync('python3', [path.join(ROOT, 'scripts/lib/dependency-probe.py')]);\nconst schema = '.template-spec/process/schemas/dependency-probe.schema.json';");
  f.write("scripts/lib/dependency-probe.py", "print('ready')\n");
  f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({ $ref: "dependency-child.schema.json" }));
  f.write(".template-spec/process/schemas/dependency-child.schema.json", JSON.stringify({ type: "string" }));
  const requirements = assetRequirements(f.root, distribution);
  assert.equal(requirements.selective, true);
  assert.ok(requirements.inclusionReasons["scripts/lib/dependency-probe.py"].some(item => item.kind === "runtime-resource" && item.from === "scripts/inspect-plan-spec"));
  assert.ok(requirements.inclusionReasons[".template-spec/process/schemas/dependency-child.schema.json"].some(item => item.kind === "schema-ref" && item.from === ".template-spec/process/schemas/dependency-probe.schema.json"));
  const python = requirements.runtimeDependencies.find(item => item.executable === "python3");
  assert.ok(python.requiredBy.includes("scripts/inspect-plan-spec"));
  assert.ok(python.requiredBy.includes("scripts/lib/json-schema.mjs"));
  assert.deepEqual(python.packages, ["jsonschema", "referencing"]);
  assert.deepEqual(assetRequirements(f.root, { mode: "legacy-all" }).runtimeDependencies, []);
  assert.equal(assetRequirements(f.root, { mode: "selected", installedSkills: [] }).selective, false);
});

for (const dependency of ["missing-child.schema.json", "../../../../outside.schema.json", "https://example.invalid/remote.schema.json"]) {
  test(`阶段 Schema 依赖缺失或越界时拒绝分发：${dependency}`, t => {
    const f = fixture(t);
    f.append("const schema = '.template-spec/process/schemas/dependency-probe.schema.json';");
    f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({ $ref: dependency }));
    assert.throws(() => assetPaths(f.root, distribution), /缺少阶段资产|依赖路径越界|本地相对路径/);
  });
}

test("固定子进程资源缺失与外部 symlink 不会被静默跳过", t => {
  const f = fixture(t);
  f.append("spawnSync('python3', [path.join(ROOT, 'scripts/lib/dependency-probe.py')]);");
  assert.throws(() => assetPaths(f.root, distribution), /缺少阶段资产/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "yss-outside-dependency-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "probe.py"), "print('outside')\n");
  fs.symlinkSync(path.join(outside, "probe.py"), path.join(f.root, "scripts/lib/dependency-probe.py"));
  assert.throws(() => assetPaths(f.root, distribution), /路径越界/);
});

test("Schema 本地循环和片段引用终止，旧实例不扩展资产集合", t => {
  const f = fixture(t);
  f.append("const schema = '.template-spec/process/schemas/dependency-probe.schema.json';");
  f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({ $ref: "dependency-child.schema.json", $defs: { local: { $ref: "#/$defs/value" }, value: { type: "string" } } }));
  f.write(".template-spec/process/schemas/dependency-child.schema.json", JSON.stringify({ $ref: "dependency-probe.schema.json" }));
  assert.ok(assetPaths(f.root, distribution).has(".template-spec/process/schemas/dependency-child.schema.json"));
  assert.equal(assetPaths(f.root, { mode: "legacy-all" }), null);
  assert.equal(assetPaths(f.root, { mode: "selected", installedSkills: [] }), null);
});

test("固定 Node 子进程入口包含其导入闭包，Schema 已登记自身 ID 保持离线兼容", t => {
  const f = fixture(t);
  f.append("spawnSync(process.execPath, [path.join(ROOT, 'scripts/dependency-node')]);\nconst schema = '.template-spec/process/schemas/dependency-probe.schema.json';");
  f.write("scripts/dependency-node", "import './lib/dependency-node.mjs';\n");
  f.write("scripts/lib/dependency-node.mjs", "export const ready = true;\n");
  f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({ $id: "https://schemas.example.invalid/local", $defs: { value: { type: "string" } }, $ref: "https://schemas.example.invalid/local#/$defs/value" }));
  const files = assetPaths(f.root, distribution);
  assert.ok(files.has("scripts/dependency-node"));
  assert.ok(files.has("scripts/lib/dependency-node.mjs"));
});

test("调用方指定的工程根不扩展为模板当前阶段的脚本或 Skill", t => {
  const f = fixture(t);
  f.append("spawnSync(process.execPath, [path.join(root, 'scripts/unrelated-node')]);");
  f.write("scripts/unrelated-node", "import '../.agents/skills/not-selected/implementation.mjs';\n");
  const files = assetPaths(f.root, distribution);
  assert.equal(files.has("scripts/unrelated-node"), false);
});

test("Schema 已加载本地文件的 URI 别名及多层 ID 与现有离线校验器一致", async t => {
  const f = fixture(t);
  f.append("const schema = '.template-spec/process/schemas/dependency-probe.schema.json';");
  f.write(".template-spec/process/schemas/dependency-probe.schema.json", JSON.stringify({
    $id: "https://schemas.example.invalid/root",
    $defs: {
      localFile: { $ref: "dependency-child.schema.json" },
      nested: { $id: "nested", type: "string", $defs: { deeper: { $id: "deeper", type: "string" } } },
    },
    anyOf: [{ $ref: "https://schemas.example.invalid/child#/$defs/value" }, { $ref: "#/$defs/nested" }],
  }));
  f.write(".template-spec/process/schemas/dependency-child.schema.json", JSON.stringify({ $id: "https://schemas.example.invalid/child", $defs: { value: { type: "string" } } }));
  const { validateJsonSchema } = await import(require("node:url").pathToFileURL(path.join(f.root, "scripts/lib/json-schema.mjs")));
  validateJsonSchema("ready", path.join(f.root, ".template-spec/process/schemas/dependency-probe.schema.json"));
  assert.ok(assetPaths(f.root, distribution).has(".template-spec/process/schemas/dependency-child.schema.json"));
});

test("阶段前缀中的文件和空目录 symlink 越界均拒绝纳入", t => {
  const f = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "yss-outside-prefix-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "note.md"), "outside\n");
  const prefix = path.join(f.root, ".template-spec/plan");
  fs.symlinkSync(path.join(outside, "note.md"), path.join(prefix, "dependency-link.md"));
  assert.throws(() => assetPaths(f.root, distribution), /路径越界/);
  fs.unlinkSync(path.join(prefix, "dependency-link.md"));
  const empty = path.join(outside, "empty");
  fs.mkdirSync(empty);
  fs.symlinkSync(empty, path.join(prefix, "dependency-empty"));
  assert.throws(() => assetPaths(f.root, distribution), /路径越界/);
});
