"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseArgs } = require("../cli/args");
const { promptForMissingOptions } = require("../cli/prompts");
const { printHelp, printVersion } = require("../cli/help");
const { pathKind, normalizeRelativePath } = require("../filesystem/path-utils");
const { applyManagedOperation } = require("../filesystem/apply-plan");
const { runInTransaction } = require("../filesystem/transaction-runner");
const { assertTargetWorkingTreeWritable } = require("../validation/security");
const {
  PACKAGE_ROOT,
  PACKAGE_MANIFEST,
  BUNDLED_TEMPLATE_ROOT,
  TEMPLATE_METADATA_FILENAME,
  readTemplateSnapshot,
  buildDesiredManagedOperations,
  buildMetadata,
  writeTemplateMetadata,
} = require("../template/instance-runtime");
const {
  applyOwnershipToOperations,
  assertWritableTemplateOperations,
} = require("../template/ownership-runtime");
const {
  initializeGitRepository,
  verifyGeneratedInit,
} = require("../template/verification-runtime");

function assertRequiredOptions(options) {
  if (!options.projectName) {
    throw new Error("init 需要 --project-name，项目名称不能为空");
  }
  if (!options.businessDomain) {
    throw new Error("init 需要 --business-domain，业务领域不能为空");
  }
  if (!options.targetDir) {
    throw new Error("init 需要 --target-dir，目标目录不能为空");
  }
}

function normalizeTargetDir(targetDir) {
  return path.resolve(process.cwd(), targetDir);
}

function isInsideTemplateRoot(targetDir) {
  const relativePath = path.relative(BUNDLED_TEMPLATE_ROOT, targetDir);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function inspectTargetDir(targetDir, force) {
  if (isInsideTemplateRoot(targetDir)) {
    throw new Error("目标目录不能位于模板源仓库内部");
  }

  assertTargetWorkingTreeWritable(targetDir, {
    force,
    packageRoot: PACKAGE_ROOT,
  });

  if (!fs.existsSync(targetDir)) {
    return { exists: false, clearEntries: false };
  }
  if (pathKind(targetDir) !== "directory") {
    throw new Error("目标目录必须是目录");
  }

  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error("目标目录非空，当前主路径不支持覆盖已有内容");
  }

  return { exists: true, clearEntries: entries.length > 0 && force };
}

function prepareTargetDir(targetDir, targetState) {
  if (!targetState.exists) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }
  if (!targetState.clearEntries) return;

  for (const entry of fs.readdirSync(targetDir)) {
    fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
  }
}

function parentDirectoryOperations(desiredOperations, targetDir) {
  const directories = new Set();
  for (const operation of desiredOperations) {
    const parts = normalizeRelativePath(operation.relativePath).split("/").filter(Boolean);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      directories.add(current);
    }
  }

  return [...directories]
    .sort((left, right) => {
      const depth = left.split("/").length - right.split("/").length;
      return depth || left.localeCompare(right);
    })
    .map((relativePath) => ({
      type: "mkdir",
      relativePath,
      targetPath: path.join(targetDir, ...relativePath.split("/")),
    }));
}

async function runInit(argv = []) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp(PACKAGE_MANIFEST.version);
    return;
  }
  if (options.version) {
    printVersion(PACKAGE_MANIFEST.version);
    return;
  }

  const promptedOptions = await promptForMissingOptions(options);
  assertRequiredOptions(promptedOptions);
  readTemplateSnapshot();

  const targetDir = normalizeTargetDir(promptedOptions.targetDir);
  const targetState = inspectTargetDir(targetDir, promptedOptions.force);
  const desiredOperations = applyOwnershipToOperations(
    buildDesiredManagedOperations(targetDir, promptedOptions, "init"),
  );
  assertWritableTemplateOperations(desiredOperations);
  const directoryOperations = parentDirectoryOperations(desiredOperations, targetDir);

  if (promptedOptions.dryRun) {
    console.log("dry-run 预览");
    console.log(`输出目录：${targetDir}`);
    for (const operation of [...directoryOperations, ...desiredOperations]) {
      const ownership = operation.ownership ? ` [${operation.ownership}]` : "";
      console.log(`${operation.type}: ${operation.relativePath}${ownership}`);
    }
    return;
  }

  prepareTargetDir(targetDir, targetState);

  runInTransaction({
    targetDir,
    operation: "init",
    affectedPaths: [
      ...desiredOperations.map((operation) => operation.relativePath),
      TEMPLATE_METADATA_FILENAME,
    ],
    execute: (transaction) => {
      for (const operation of desiredOperations) {
        applyManagedOperation(operation, transaction);
      }
      verifyGeneratedInit(targetDir);
      writeTemplateMetadata(
        targetDir,
        buildMetadata(promptedOptions, desiredOperations),
        transaction,
      );
    },
  });

  if (promptedOptions.gitInit) {
    initializeGitRepository(targetDir);
  }

  console.log("初始化完成");
  console.log(`输出目录：${targetDir}`);
  console.log("下一步建议：");
  console.log(`1. cd ${targetDir}`);
  console.log(
    promptedOptions.gitInit
      ? "2. 运行 git status 检查初始化结果"
      : "2. 如需版本管理，可执行 git init",
  );
  console.log("3. 检查 AGENTS.md、README 和 docs 目录是否符合预期");
}

module.exports = {
  runInit,
};
