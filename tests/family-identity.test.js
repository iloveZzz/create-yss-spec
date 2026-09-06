const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const name = require("../package.json").name;
const bin = path.join(root, "bin", `${name}.js`);

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8", timeout: 120000 });
}
function argsFor(target, command = name === "create-yss-harness-design" ? "init" : "attach") {
  return [...(command === "init" ? [] : [command]), "--target-dir", target,
    "--project-name", "Identity probe", "--business-domain", "CLI verification", "--dry-run", "--force"];
}

test("frontend identity prevents another CLI from planning takeover, even with force", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "yss-family-"));
  try {
    const bytes = JSON.stringify({ schema_version: 1, profile_id: "harness.frontend-delivery" });
    fs.writeFileSync(path.join(target, ".yss-harness-frontend.json"), bytes);
    const result = run(argsFor(target));
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /身份|家族|profile/);
    assert.deepEqual(fs.readdirSync(target), [".yss-harness-frontend.json"]);
    assert.equal(fs.readFileSync(path.join(target, ".yss-harness-frontend.json"), "utf8"), bytes);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test("profile alone cannot bypass family protection by omitting metadata", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "yss-profile-"));
  try {
    fs.mkdirSync(path.join(target, "docs/process"), { recursive: true });
    const file = path.join(target, "docs/process/harness-profile.yaml");
    const bytes = "schema_version: 1\nprofile_id: harness.frontend-delivery\n";
    fs.writeFileSync(file, bytes);
    const result = run(argsFor(target));
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /身份|家族|profile/);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

const families = [
  ["create-yss-spec", ".yss-template.json", null],
  ["create-yss-harness-design", ".yss-harness-design.json", "harness.business-ddd-strategy-handoff"],
  ["create-yss-harness-dev", ".yss-harness-dev.json", "harness.dev-agent-slice"],
  ["backend", ".yss-harness-backend.json", "harness.backend-delivery"],
  ["frontend", ".yss-harness-frontend.json", "harness.frontend-delivery"],
];
const own = families.find(([family]) => family === name);
const commands = name === "create-yss-harness-design" ? ["init"] : ["init", "attach", "sync"];
function tree(root) {
  return fs.readdirSync(root).sort().flatMap(entry => {
    const file = path.join(root, entry), stat = fs.lstatSync(file);
    return stat.isDirectory() ? [[entry, stat.mode], ...tree(file).map(row => [`${entry}/${row[0]}`, ...row.slice(1)])]
      : [[entry, stat.mode, stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString("base64")]];
  });
}
function withTarget(callback) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "yss-identity-matrix-"));
  try { callback(target); } finally { fs.rmSync(target, { recursive: true, force: true }); }
}
function rejectedUnchanged(target, command, apply = false) {
  fs.writeFileSync(path.join(target, "user-file.txt"), "用户文件不可改动\n");
  const before = tree(target);
  let args = argsFor(target, command);
  if (apply) {
    args = args.filter(arg => arg !== "--dry-run");
    if (command === "attach") args.push("--apply");
  }
  const result = run(args);
  assert.notEqual(result.status, null, "CLI must exit normally");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /身份|家族|profile/);
  assert.deepEqual(tree(target), before);
  assert.doesNotMatch(result.stdout + result.stderr, /备份目录：/);
}

for (const [family, metadata] of families.filter(([family]) => family !== name)) {
  test(`all supported operations reject ${family} before dry-run or force writes`, () => withTarget(target => {
    // Deliberately malformed: the foreign marker alone must prohibit takeover.
    fs.writeFileSync(path.join(target, metadata), "{");
    for (const command of commands) {
      rejectedUnchanged(target, command);
      rejectedUnchanged(target, command, true);
    }
  }));
}

test("mixed family markers are not repaired or selected", () => withTarget(target => {
  fs.writeFileSync(path.join(target, own[1]), "{}");
  fs.writeFileSync(path.join(target, ".yss-harness-backend.json"), "{}");
  rejectedUnchanged(target, commands[0]);
}));

for (const [label, content] of [
  ["malformed JSON", "{"], ["array", "[]"], ["null", "null"],
  ["wrong package", JSON.stringify({ templateName: "other-cli" })],
  ["unknown schema", JSON.stringify({ metadataSchemaVersion: 999 })],
  ["null schema", JSON.stringify({ metadataSchemaVersion: null })],
  ["wrong source", JSON.stringify({ templateSource: "github:other/template" })],
  ["wrong profile", JSON.stringify({ profileId: "harness.frontend-delivery" })],
  ["snake case wrong profile", JSON.stringify({ profile_id: "harness.backend-delivery" })],
  ["duplicate keys", '{"profileId":"harness.frontend-delivery","profileId":"harness.dev-agent-slice"}'],
]) {
  test(`own metadata rejects ${label}`, () => withTarget(target => {
    fs.writeFileSync(path.join(target, own[1]), content);
    rejectedUnchanged(target, commands[0]);
  }));
}

for (const [label, content] of [
  ["unknown profile", "schema_version: 1\nprofile_id: harness.unknown\n"],
  ["missing profile", "schema_version: 1\n"],
  ["invalid YAML", "profile_id: [\n"],
  ["duplicate profile", "schema_version: 1\nprofile_id: harness.backend-delivery\nprofile_id: harness.frontend-delivery\n"],
]) {
  test(`profile rejects ${label}`, () => withTarget(target => {
    fs.mkdirSync(path.join(target, "docs/process"), { recursive: true });
    fs.writeFileSync(path.join(target, "docs/process/harness-profile.yaml"), content);
    rejectedUnchanged(target, commands[0]);
  }));
}

test("own metadata symlink is rejected without following or overwriting it", () => withTarget(target => {
  fs.writeFileSync(path.join(target, "real.json"), "{}");
  fs.symlinkSync("real.json", path.join(target, own[1]));
  rejectedUnchanged(target, commands[0]);
}));

test("profile parent symlink is rejected before reading target content", () => withTarget(target => {
  fs.mkdirSync(path.join(target, "real"));
  fs.symlinkSync("real", path.join(target, "docs"));
  rejectedUnchanged(target, commands[0]);
}));

test("help and version work inside foreign projects without mutation", () => withTarget(target => {
  fs.writeFileSync(path.join(target, ".yss-harness-frontend.json"), "{}");
  const before = tree(target);
  for (const flag of ["--help", "--version"]) {
    const result = spawnSync(process.execPath, [bin, flag], { cwd: target, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(tree(target), before);
}));

test("unmanaged projects can still preview initialization", () => withTarget(target => {
  fs.writeFileSync(path.join(target, "user-file.txt"), "unchanged");
  const before = tree(target);
  const result = run(argsFor(target, "init"));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(tree(target), before);
}));

if (own[2]) {
  test("matching profile supports quoted YAML and identity fields", () => withTarget(target => {
    fs.mkdirSync(path.join(target, "docs/process"), { recursive: true });
    fs.writeFileSync(path.join(target, "docs/process/harness-profile.yaml"),
      `schema_version: 1\nprofile_id: '${own[2]}' # valid identity\ninstantiation:\n  metadata_file: '${own[1]}'\n  cli_package: '${name}'\n`);
    const result = run(argsFor(target, "init"));
    assert.equal(result.status, 0, result.stderr);
  }));
}
