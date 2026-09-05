"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseGitmodules } = require("../src/git/submodule");
const { gitlinkWriteViolation, unmanagedPathReason } = require("../src/validation/security");
const { validateTemplateSnapshot } = require("../src/validation/snapshot");
const { validateTemplateMetadata } = require("../src/validation/metadata");
const { parseRepositoryIdentity, convertTemplateSourceToInstance } = require("../src/validation/identity");

test("parseGitmodules preserves submodule path and url", () => {
  assert.deepEqual(parseGitmodules('[submodule "app"]\n  path = apps/demo\n  url = git@example/demo.git\n'), [
    { name: "app", path: "apps/demo", url: "git@example/demo.git" },
  ]);
});

test("security policy keeps gitlink violations non-forceable", () => {
  const deps = {
    collectGitRoots: () => ["/repo"],
    isGitSubmoduleMount: (_root, current) => current === "/repo/apps/demo",
    inspectCheckoutState: () => "detached-head",
  };
  assert.match(gitlinkWriteViolation("/repo/apps/demo", { force: true, deps }), /detached HEAD/);
  assert.match(unmanagedPathReason("/repo", ".gitmodules", { deps }), /用户资产/);
});

test("snapshot validation rejects floating or unsafe metadata", () => {
  assert.throws(() => validateTemplateSnapshot({}), /40 位不可变 templateCommit/);
  const base = {
    templateCommit: "a".repeat(40),
    snapshotHash: "b".repeat(64),
    manifestHash: "m",
    encodedPaths: { "safe.md": "safe.md" },
  };
  assert.equal(validateTemplateSnapshot(base, { manifestHash: "m", treeHash: "b".repeat(64) }), base);
  assert.throws(() => validateTemplateSnapshot({ ...base, encodedPaths: { "../bad": "bad" } }), /越界路径/);
});

test("metadata validation keeps schema and immutable commit contracts", () => {
  const metadata = {
    metadataSchemaVersion: 2,
    templateName: "create-yss-spec",
    cliVersion: "3.1.0",
    templateSource: "github:iloveZzz/yss-spec-project-template",
    templateCommit: "a".repeat(40),
    managedFilesManifestVersion: "b".repeat(64),
    variables: {},
    managedFiles: {},
  };
  assert.equal(validateTemplateMetadata(metadata, {
    currentSchemaVersion: 2,
    templateName: "create-yss-spec",
    templateSource: "github:iloveZzz/yss-spec-project-template",
  }), metadata);
  assert.throws(() => validateTemplateMetadata({ ...metadata, metadataSchemaVersion: 3 }, { currentSchemaVersion: 2 }), /不支持的模板元数据版本/);
});

test("identity validation is strict and conversion is explicit", () => {
  const source = "schema_version: 1\nrepository_mode: template-source\n";
  assert.deepEqual(parseRepositoryIdentity(source), {
    schema_version: "1",
    repository_mode: "template-source",
  });
  assert.match(convertTemplateSourceToInstance(source), /repository_mode: project-instance/);
  assert.throws(() => parseRepositoryIdentity("schema_version: 1\nrepository_mode: other\n"), /repository_mode/);
});
