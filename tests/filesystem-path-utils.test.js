"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { targetPath } = require("../src/filesystem/path-utils");

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-path-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("targetPath rejects traversal outside target root", () => {
  withTempDir((root) => {
    assert.throws(() => targetPath(root, "../escape.txt"), /模板路径越界/);
  });
});

test("targetPath rejects an intermediate symlink", () => {
  withTempDir((root) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-outside-"));
    try {
      fs.symlinkSync(outside, path.join(root, "linked"), "dir");
      assert.throws(
        () => targetPath(root, "linked/file.txt"),
        /模板目标路径包含中间符号链接/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("targetPath rejects a non-directory parent", () => {
  withTempDir((root) => {
    fs.writeFileSync(path.join(root, "file-parent"), "x");
    assert.throws(
      () => targetPath(root, "file-parent/child.txt"),
      /模板目标父路径不是目录/,
    );
  });
});
