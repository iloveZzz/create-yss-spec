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
const DEFAULT_TEMPLATE_REF = "f4ee19614b6206e08d47d333b08e49d4f2af93c4";
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
  const allowedRootEntries = manifest.allowRootEntries
    ? new Set(manifest.allowRootEntries)
    : null;
  const allowedRootFiles = manifest.allowRootFiles
    ? new Set(manifest.allowRootFiles)
    : null;
  const allowedFiles = new Set(manifest.allowFiles || []);
  const excludedRootEntries = new Set([...manifest.excludeRootEntries, "dist"]);
  const excludedRootFiles = new Set(manifest.excludeRootFiles);
  const excludedPaths = new Set(manifest.excludePaths);
  const trackedFiles = run("git", ["ls-files", "-z"], sourceRoot)
    .split("\0")
    .filter(Boolean);
  const resolvedCheckoutRoot = fs.realpathSync(sourceRoot);

  const shouldCopy = (relativePath) => {
    const segments = relativePath.split("/");
    if (allowedRootEntries && allowedRootFiles) {
      const allowed = segments.length === 1
        ? allowedRootFiles.has(relativePath)
        : allowedRootEntries.has(segments[0]);
      if (!allowed) {
        return allowedFiles.has(relativePath);
      }
    }
    const matchesExcludedPath = [...excludedPaths].some((excludedPath) => {
      const isExcluded =
        relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`);
      if (!isExcluded) {
        return false;
      }
      return ![...allowedFiles].some(
        (allowedFile) =>
          allowedFile === relativePath || allowedFile.startsWith(`${relativePath}/`),
      );
    });
    return !(
      excludedRootEntries.has(segments[0]) ||
      (segments.length === 1 && excludedRootFiles.has(relativePath)) ||
      matchesExcludedPath
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

    const targetRelativePath = logicalTargetPath;

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
}

function encodeNpmIgnoredDotfiles(root) {
  const encodedPaths = {};

  const visit = (currentPath, relativeDir = "") => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile() || !NPM_IGNORED_BASENAMES.has(entry.name)) {
        continue;
      }

      const directory = path.posix.dirname(relativePath);
      const encoded = path.posix.join(
        directory === "." ? "" : directory,
        `__yss_dotfile__${entry.name}`,
      );
      if (
        Object.values(encodedPaths).includes(encoded) ||
        fs.existsSync(path.join(root, encoded))
      ) {
        throw new Error(`模板路径编码冲突：${relativePath} -> ${encoded}`);
      }
      encodedPaths[relativePath] = encoded;
      fs.renameSync(absolutePath, path.join(root, encoded));
    }
  };

  visit(root);
  return encodedPaths;
}

function movePath(source, destination) {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      fs.cpSync(source, destination, { recursive: true });
      fs.rmSync(source, { recursive: true, force: true });
      return;
    }
    fs.copyFileSync(source, destination);
    fs.rmSync(source, { force: true });
  }
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
      movePath(targetTemplateRoot, backupRoot);
      previousTemplateMoved = true;
    }
    if (fs.existsSync(targetSnapshotPath)) {
      movePath(targetSnapshotPath, snapshotBackup);
      previousSnapshotMoved = true;
    }

    movePath(stagingRoot, targetTemplateRoot);
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
        movePath(snapshotBackup, targetSnapshotPath);
      }
      if (installed && fs.existsSync(targetTemplateRoot)) {
        fs.rmSync(targetTemplateRoot, { recursive: true, force: true });
      }
      if (
        previousTemplateMoved &&
        fs.existsSync(backupRoot) &&
        !fs.existsSync(targetTemplateRoot)
      ) {
        movePath(backupRoot, targetTemplateRoot);
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
    movePath(temporaryPath, targetSnapshotPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function materializeSharedSkillProjections(templateRoot) {
  const lockPath = path.join(templateRoot, "skills-lock.json");
  if (!fs.existsSync(lockPath)) {
    return;
  }

  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return;
  }

  const sharedNames = Object.keys(lock.skills?.shared ?? {});
  if (sharedNames.length === 0) {
    return;
  }

  const sourceRoot = path.join(templateRoot, ".agents/skills");
  const projectionRoots = Array.isArray(lock.projectionRoots) && lock.projectionRoots.length
    ? lock.projectionRoots
    : [
        ".claude/skills",
        ".codex/skills",
        ".cursor/skills",
        ".hermes/skills",
        ".pi/skills",
        ".qoder/skills",
        ".trae/skills",
      ];

  for (const name of sharedNames) {
    const source = path.join(sourceRoot, name);
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
      continue;
    }
    for (const root of projectionRoots) {
      const projectionRoot = path.join(templateRoot, root);
      const target = path.join(projectionRoot, name);
      fs.mkdirSync(projectionRoot, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true, preserveTimestamps: true });
    }
  }
}

function refreshBundledSkillLock(templateRoot) {
  // Staging is not a git worktree, so this only recomputes hashes for skills
  // already in the upstream lock. It must run before npm dotfile encoding so
  // hashes match the logical names attach restores in project instances.
  const updateLock = path.join(templateRoot, "scripts/update-skill-lock");
  const lockPath = path.join(templateRoot, "skills-lock.json");
  if (!fs.existsSync(updateLock) || !fs.existsSync(lockPath)) {
    return;
  }

  run(process.execPath, [updateLock], templateRoot);
}

function assertSnapshotDistribution(stagingRoot, manifest, encodedPaths) {
  const logicalByEncodedPath = new Map(
    Object.entries(encodedPaths).map(([logicalPath, encodedPath]) => [encodedPath, logicalPath]),
  );
  const allowedRootEntries = new Set(manifest.allowRootEntries || []);
  const allowedRootFiles = new Set(manifest.allowRootFiles || []);
  const allowedFiles = new Set(manifest.allowFiles || []);
  const excludedPaths = new Set(manifest.excludePaths || []);
  const logicalPathFor = (relativePath) => logicalByEncodedPath.get(relativePath) || relativePath;
  const allowed = (relativePath) => {
    const logicalPath = logicalPathFor(relativePath);
    const segments = logicalPath.split("/");
    if (segments.length === 1) {
      return allowedRootFiles.has(logicalPath);
    }
    if (!allowedRootEntries.has(segments[0])) {
      return allowedFiles.has(logicalPath);
    }
    const excluded = [...excludedPaths].some((excludedPath) => {
      if (logicalPath !== excludedPath && !logicalPath.startsWith(`${excludedPath}/`)) {
        return false;
      }
      return ![...allowedFiles].some(
        (allowedFile) => allowedFile === logicalPath || allowedFile.startsWith(`${logicalPath}/`),
      );
    });
    return !excluded;
  };

  const stack = [stagingRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(stagingRoot, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile() && !allowed(relative)) {
        throw new Error(`模板快照包含未登记的实例资源：${logicalPathFor(relative)}`);
      }
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
  run("git", ["clone", "--no-checkout", "--depth", "1", templateRepo, checkoutRoot]);
  run("git", ["fetch", "--depth", "1", "origin", templateRef], checkoutRoot);
  run("git", ["checkout", "--detach", "FETCH_HEAD"], checkoutRoot);
  copyTrackedFiles(checkoutRoot, manifest, stagingRoot);
  materializeSharedSkillProjections(stagingRoot);
  refreshBundledSkillLock(stagingRoot);
  const encodedPaths = encodeNpmIgnoredDotfiles(stagingRoot);
  assertSnapshotDistribution(stagingRoot, manifest, encodedPaths);
  const templateCommit = run("git", ["rev-parse", "HEAD"], checkoutRoot).trim();
  const snapshotMetadata = {
    schemaVersion: 1,
    templateName: "yss-spec-project-template",
    templateSource: "github:iloveZzz/yss-spec-project-template",
    templateRepository: templateRepo,
    requestedRef: templateRef,
    templateCommit,
    manifestHash: sha256(fs.readFileSync(targetManifestPath)),
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
