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
const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yss-spec-template-"));

function run(command, args, cwd = packageRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} 执行失败`);
  }
  return result.stdout;
}

function copyTrackedFiles(sourceRoot, manifest) {
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

  const copyFile = (sourceRelativePath, targetRelativePath) => {
    if (!shouldCopy(targetRelativePath)) {
      return;
    }

    const sourcePath = path.join(sourceRoot, sourceRelativePath);
    if (!fs.statSync(sourcePath).isFile()) {
      return;
    }

    const targetPath = path.join(targetTemplateRoot, targetRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  };

  for (const relativePath of trackedFiles) {
    if (!shouldCopy(relativePath)) {
      continue;
    }

    const sourcePath = path.join(sourceRoot, relativePath);
    const sourceLink = fs.lstatSync(sourcePath);
    const sourceTarget = fs.statSync(sourcePath);

    if (sourceTarget.isFile()) {
      copyFile(relativePath, relativePath);
      continue;
    }

    if (!sourceLink.isSymbolicLink() || !sourceTarget.isDirectory()) {
      continue;
    }

    const resolvedProjectionRoot = path
      .relative(resolvedCheckoutRoot, fs.realpathSync(sourcePath))
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

try {
  const manifest = JSON.parse(fs.readFileSync(targetManifestPath, "utf8"));
  run("git", ["clone", "--depth", "1", "--branch", templateRef, templateRepo, checkoutRoot]);

  fs.rmSync(targetTemplateRoot, { recursive: true, force: true });
  fs.mkdirSync(targetTemplateRoot, { recursive: true });
  copyTrackedFiles(checkoutRoot, manifest);
  console.log(`已从 ${templateRepo}#${templateRef} 同步模板快照`);
} finally {
  fs.rmSync(checkoutRoot, { recursive: true, force: true });
}
