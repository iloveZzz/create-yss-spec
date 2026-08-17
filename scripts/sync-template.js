const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { treeHash } = require("../src/template-hash");

const packageRoot = path.resolve(__dirname, "..");
const targetTemplateRoot = path.join(packageRoot, "template");
const targetManifestPath = path.join(packageRoot, "template.manifest.json");
const targetSnapshotPath = path.join(packageRoot, "template.snapshot.json");
const templateRepo =
  process.env.YSS_SPEC_TEMPLATE_REPO ||
  "https://github.com/iloveZzz/yss-spec-project-template.git";
const DEFAULT_TEMPLATE_REF = "68c367a13d5006cca83f1c5e369678af28c4bf15";
const templateRef = process.env.YSS_SPEC_TEMPLATE_REF || DEFAULT_TEMPLATE_REF;
const NPM_IGNORED_BASENAMES = new Set([".gitignore", ".npmignore", ".npmrc"]);

function run(command, args, cwd = packageRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} 执行失败`);
  }
  return result.stdout;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function copyTrackedFiles(sourceRoot, manifest, destinationRoot) {
  const excludedRootEntries = new Set([...manifest.excludeRootEntries, "dist"]);
  const excludedRootFiles = new Set(manifest.excludeRootFiles);
  const excludedPaths = new Set(manifest.excludePaths);
  const trackedFiles = run("git", ["ls-files", "-z"], sourceRoot)
    .split("\0")
    .filter(Boolean);
  const resolvedCheckoutRoot = fs.realpathSync(sourceRoot);
  const encodedPaths = {};

  const packageRelativePath = (relativePath) => {
    const basename = path.posix.basename(relativePath);
    if (!NPM_IGNORED_BASENAMES.has(basename)) {
      return relativePath;
    }

    const directory = path.posix.dirname(relativePath);
    const encoded = path.posix.join(
      directory === "." ? "" : directory,
      `__yss_dotfile__${basename}`,
    );
    if (Object.values(encodedPaths).includes(encoded)) {
      throw new Error(`模板路径编码冲突：${relativePath} -> ${encoded}`);
    }
    encodedPaths[relativePath] = encoded;
    return encoded;
  };

  const shouldCopy = (relativePath) => {
    const segments = relativePath.split("/");
    return !(
      excludedRootEntries.has(segments[0]) ||
      (segments.length === 1 && excludedRootFiles.has(relativePath)) ||
      excludedPaths.has(relativePath)
    );
  };

  const resolveSourceEntry = (sourceRelativePath) => {
    const sourcePath = path.join(sourceRoot, sourceRelativePath);
    const sourceLink = fs.lstatSync(sourcePath);
    const resolvedPath = sourceLink.isSymbolicLink()
      ? fs.realpathSync(sourcePath)
      : sourcePath;
    const resolvedRelativePath = path
      .relative(resolvedCheckoutRoot, fs.realpathSync(resolvedPath))
      .split(path.sep)
      .join("/");

    if (
      resolvedRelativePath === ".." ||
      resolvedRelativePath.startsWith("../") ||
      path.isAbsolute(resolvedRelativePath)
    ) {
      throw new Error(`模板投影链接必须指向仓库内部目录：${sourceRelativePath}`);
    }

    return {
      sourceLink,
      resolvedPath,
      sourceTarget: fs.statSync(resolvedPath),
    };
  };

  const copyFile = (sourceRelativePath, logicalTargetPath) => {
    if (!shouldCopy(logicalTargetPath)) {
      return;
    }

    const targetRelativePath = packageRelativePath(logicalTargetPath);

    const sourceEntry = resolveSourceEntry(sourceRelativePath);
    if (!sourceEntry.sourceTarget.isFile()) {
      return;
    }

    const targetPath = path.join(destinationRoot, targetRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourceEntry.resolvedPath, targetPath);
    fs.chmodSync(targetPath, sourceEntry.sourceTarget.mode & 0o777);
  };

  for (const relativePath of trackedFiles) {
    if (!shouldCopy(relativePath)) {
      continue;
    }

    const sourceEntry = resolveSourceEntry(relativePath);

    if (sourceEntry.sourceTarget.isFile()) {
      copyFile(relativePath, relativePath);
      continue;
    }

    if (
      !sourceEntry.sourceLink.isSymbolicLink() ||
      !sourceEntry.sourceTarget.isDirectory()
    ) {
      continue;
    }

    const resolvedProjectionRoot = path
      .relative(resolvedCheckoutRoot, sourceEntry.resolvedPath)
      .split(path.sep)
      .join("/");
    if (
      !resolvedProjectionRoot ||
      resolvedProjectionRoot === ".." ||
      resolvedProjectionRoot.startsWith("../") ||
      path.isAbsolute(resolvedProjectionRoot)
    ) {
      throw new Error(`模板投影链接必须指向仓库内部目录：${relativePath}`);
    }

    const sourcePrefix = `${resolvedProjectionRoot}/`;
    for (const trackedTargetPath of trackedFiles) {
      if (!trackedTargetPath.startsWith(sourcePrefix)) {
        continue;
      }

      const suffix = trackedTargetPath.slice(sourcePrefix.length);
      copyFile(trackedTargetPath, `${relativePath}/${suffix}`);
    }
  }

  return encodedPaths;
}

function replaceTemplateRoot(stagingRoot, snapshotMetadata) {
  const backupParent = fs.mkdtempSync(
    path.join(packageRoot, ".template-backup-"),
  );
  const backupRoot = path.join(backupParent, "previous-template");
  const snapshotBackup = path.join(backupParent, "previous-snapshot.json");
  let previousTemplateMoved = false;
  let previousSnapshotMoved = false;
  let installed = false;

  try {
    if (fs.existsSync(targetTemplateRoot)) {
      fs.renameSync(targetTemplateRoot, backupRoot);
      previousTemplateMoved = true;
    }
    if (fs.existsSync(targetSnapshotPath)) {
      fs.renameSync(targetSnapshotPath, snapshotBackup);
      previousSnapshotMoved = true;
    }

    fs.renameSync(stagingRoot, targetTemplateRoot);
    installed = true;
    writeSnapshotMetadata(snapshotMetadata);

    fs.rmSync(backupParent, { recursive: true, force: true });
  } catch (error) {
    try {
      if (fs.existsSync(targetSnapshotPath)) {
        fs.rmSync(targetSnapshotPath, { force: true });
      }
      if (
        previousSnapshotMoved &&
        fs.existsSync(snapshotBackup) &&
        !fs.existsSync(targetSnapshotPath)
      ) {
        fs.renameSync(snapshotBackup, targetSnapshotPath);
      }
      if (installed && fs.existsSync(targetTemplateRoot)) {
        fs.rmSync(targetTemplateRoot, { recursive: true, force: true });
      }
      if (
        previousTemplateMoved &&
        fs.existsSync(backupRoot) &&
        !fs.existsSync(targetTemplateRoot)
      ) {
        fs.renameSync(backupRoot, targetTemplateRoot);
      }
    } catch (rollbackError) {
      throw new Error(
        `${error.message}\n模板快照替换回滚失败：${rollbackError.message}；备份保留于 ${backupParent}`,
      );
    }
    fs.rmSync(backupParent, { recursive: true, force: true });
    throw error;
  }
}

function writeSnapshotMetadata(metadata) {
  const temporaryPath = `${targetSnapshotPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, targetSnapshotPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

const manifest = JSON.parse(fs.readFileSync(targetManifestPath, "utf8"));
const checkoutRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "yss-spec-template-"),
);
const stagingRoot = fs.mkdtempSync(
  path.join(packageRoot, ".template-staging-"),
);

try {
  run("git", ["clone", "--no-checkout", "--depth", "1", templateRepo, checkoutRoot]);
  run("git", ["fetch", "--depth", "1", "origin", templateRef], checkoutRoot);
  run("git", ["checkout", "--detach", "FETCH_HEAD"], checkoutRoot);
  const encodedPaths = copyTrackedFiles(checkoutRoot, manifest, stagingRoot);
  const templateCommit = run("git", ["rev-parse", "HEAD"], checkoutRoot).trim();
  const snapshotMetadata = {
    schemaVersion: 1,
    templateName: "yss-spec-project-template",
    templateSource: "github:iloveZzz/yss-spec-project-template",
    templateRepository: templateRepo,
    requestedRef: templateRef,
    templateCommit,
    encodedPaths,
    snapshotHash: treeHash(stagingRoot),
    generatedAt: new Date().toISOString(),
  };
  replaceTemplateRoot(stagingRoot, snapshotMetadata);

  console.log(
    `已从 ${templateRepo}#${templateRef} 同步模板快照（commit ${templateCommit}）`,
  );
} finally {
  fs.rmSync(checkoutRoot, { recursive: true, force: true });
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
