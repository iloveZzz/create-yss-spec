const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const targetTemplateRoot = path.join(packageRoot, "template");
const targetManifestPath = path.join(packageRoot, "template.manifest.json");
const templateRepo =
  process.env.YSS_SPEC_TEMPLATE_REPO ||
  "https://github.com/iloveZzz/yss-spec-project-template.git";
const templateRef = process.env.YSS_SPEC_TEMPLATE_REF || "main";

function run(command, args, cwd = packageRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} 执行失败`);
  }
  return result.stdout;
}

function copyTrackedFiles(sourceRoot, manifest, destinationRoot) {
  const excludedRootEntries = new Set([...manifest.excludeRootEntries, "dist"]);
  const excludedRootFiles = new Set(manifest.excludeRootFiles);
  const excludedPaths = new Set(manifest.excludePaths);
  const trackedFiles = run("git", ["ls-files", "-z"], sourceRoot)
    .split("\0")
    .filter(Boolean);
  const resolvedCheckoutRoot = fs.realpathSync(sourceRoot);

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

  const copyFile = (sourceRelativePath, targetRelativePath) => {
    if (!shouldCopy(targetRelativePath)) {
      return;
    }

    const sourceEntry = resolveSourceEntry(sourceRelativePath);
    if (!sourceEntry.sourceTarget.isFile()) {
      return;
    }

    const targetPath = path.join(destinationRoot, targetRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourceEntry.resolvedPath, targetPath);
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
}

function replaceTemplateRoot(stagingRoot) {
  const backupParent = fs.mkdtempSync(
    path.join(packageRoot, ".template-backup-"),
  );
  const backupRoot = path.join(backupParent, "previous-template");
  let previousMoved = false;
  let installed = false;

  try {
    if (fs.existsSync(targetTemplateRoot)) {
      fs.renameSync(targetTemplateRoot, backupRoot);
      previousMoved = true;
    }

    fs.renameSync(stagingRoot, targetTemplateRoot);
    installed = true;

    if (previousMoved) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
  } catch (error) {
    if (installed && fs.existsSync(targetTemplateRoot)) {
      fs.rmSync(targetTemplateRoot, { recursive: true, force: true });
    }
    if (
      previousMoved &&
      fs.existsSync(backupRoot) &&
      !fs.existsSync(targetTemplateRoot)
    ) {
      fs.renameSync(backupRoot, targetTemplateRoot);
    }
    throw error;
  } finally {
    if (!fs.existsSync(backupRoot)) {
      fs.rmSync(backupParent, { recursive: true, force: true });
    }
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
  run("git", ["clone", "--depth", "1", "--branch", templateRef, templateRepo, checkoutRoot]);
  copyTrackedFiles(checkoutRoot, manifest, stagingRoot);
  replaceTemplateRoot(stagingRoot);

  console.log(`已从 ${templateRepo}#${templateRef} 同步模板快照`);
} finally {
  fs.rmSync(checkoutRoot, { recursive: true, force: true });
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
