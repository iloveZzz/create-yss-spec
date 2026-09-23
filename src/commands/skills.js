"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runInTransaction } = require("../filesystem/transaction-runner");
const { pathKind, targetPath } = require("../filesystem/path-utils");
const { assertTargetFamily } = require("../family-runtime");
const { assertTargetWorkingTreeWritable } = require("../validation/security");
const { readTemplateSnapshot, loadTemplateMetadata, writeTemplateMetadata, buildDesiredManagedOperations, BUNDLED_TEMPLATE_ROOT, fileHash } = require("../template/instance-runtime");
const { RUNTIMES, assertRuntime, readDistributionRegistry, requiredSkills, renderInstanceDesignSkillFile } = require("../template/distribution-runtime");
const { refreshGeneratedProjectInstance, verifyGeneratedProjectInstance } = require("../template/verification-runtime");

function parseSkillArgs(argv) {
  const options = { names: [], triggers: [], targetDir: "." };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--plan") options.plan = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--target-dir" || arg === "--when") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 需要一个值`);
      if (arg === "--target-dir") options.targetDir = value;
      else options.triggers.push(value);
    } else if (arg.startsWith("--")) throw new Error(`不支持的参数：${arg}`);
    else options.names.push(arg);
  }
  if (options.plan && options.apply) throw new Error("--plan 与 --apply 互斥");
  if (!options.plan && !options.apply) throw new Error("skills 命令必须显式选择 --plan 或 --apply");
  return options;
}

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function addManagedTree(metadata, targetDir, relativeDir) {
  for (const file of listFiles(targetPath(targetDir, relativeDir))) {
    const relative = `${relativeDir}/${file}`;
    metadata.managedFiles[relative] = { type: "copy", contentHash: fileHash(targetPath(targetDir, relative)) };
  }
}

function context(targetDir) {
  assertTargetFamily(targetDir);
  const { metadata } = loadTemplateMetadata(targetDir);
  if (metadata.metadataSchemaVersion !== 3 || metadata.distribution?.mode !== "selected") {
    throw new Error("按需 Skill 命令仅适用于 v3 精简实例；v2 实例继续 legacy-all 分发");
  }
  const snapshot = readTemplateSnapshot();
  if (metadata.templateCommit !== snapshot.templateCommit || metadata.snapshotHash !== snapshot.snapshotHash) {
    throw new Error("CLI 快照与实例模板提交不一致，请先运行 create-yss-spec sync");
  }
  const lockPath = targetPath(targetDir, "skills-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (JSON.stringify(lock.projectionRoots) !== JSON.stringify(metadata.distribution.runtimes.map((name) => RUNTIMES[name]))) {
    throw new Error("实例 Skill 锁与元数据的平台选择不一致");
  }
  return { metadata, lock, lockPath };
}

function runSkills(argv = []) {
  const [command, maybeAction, ...rest] = argv;
  const runtimeAdd = command === "runtime" && maybeAction === "add";
  if (command !== "ensure" && !runtimeAdd) throw new Error("用法：skills ensure <skill-id...> --plan|--apply，或 skills runtime add <runtime> --plan|--apply");
  const options = parseSkillArgs(runtimeAdd ? rest : [maybeAction, ...rest].filter((value) => value !== undefined));
  if (!options.names.length) throw new Error(runtimeAdd ? "runtime add 需要平台名" : "ensure 需要至少一个 Skill ID");
  if (runtimeAdd && options.names.length !== 1) throw new Error("runtime add 一次只接受一个平台");
  const targetDir = path.resolve(options.targetDir);
  const { metadata, lock, lockPath } = context(targetDir);
  const distribution = metadata.distribution;
  const registry = readDistributionRegistry(BUNDLED_TEMPLATE_ROOT);
  const names = runtimeAdd ? [] : requiredSkills(registry.text, options.names, options.triggers, BUNDLED_TEMPLATE_ROOT);
  const runtime = runtimeAdd ? assertRuntime(options.names[0]) : null;
  const missing = names.filter((name) => !distribution.installedSkills.includes(name));
  const addedRuntime = runtime && !distribution.runtimes.includes(runtime) ? runtime : null;
  const roots = distribution.runtimes.map((name) => RUNTIMES[name]);
  const runtimeFiles = addedRuntime ? buildDesiredManagedOperations(targetDir, {
    ...metadata.variables,
    distribution: { mode: "selected", runtimes: [...distribution.runtimes, addedRuntime], installedSkills: distribution.installedSkills },
  }, "init").filter((operation) => {
    const runtimeRoot = RUNTIMES[addedRuntime].split("/")[0];
    return (operation.relativePath.startsWith(`${runtimeRoot}/`) || (addedRuntime === "cursor" && operation.relativePath === ".cursorrules")) &&
      !distribution.installedSkills.some((name) => operation.relativePath.startsWith(`${RUNTIMES[addedRuntime]}/${name}/`));
  }) : [];
  const paths = ["skills-lock.json", ".yss-template.json"];
  for (const name of missing) {
    paths.push(`.agents/skills/${name}`, ...roots.map((root) => `${root}/${name}`));
  }
  if (addedRuntime) paths.push(...Object.keys(lock.skills.shared).map((name) => `${RUNTIMES[addedRuntime]}/${name}`), ...runtimeFiles.map((operation) => operation.relativePath));
  for (const relative of paths.slice(2)) {
    if (pathKind(targetPath(targetDir, relative)) !== "missing") throw new Error(`目标 Skill 路径已存在，拒绝覆盖：${relative}`);
  }
  if (options.plan) {
    console.log(JSON.stringify({ operation: runtimeAdd ? "runtime add" : "ensure", targetDir, requested: options.names, dependencies: names, addSkills: missing, addRuntime: addedRuntime, paths }, null, 2));
    return;
  }
  if (!missing.length && !addedRuntime) {
    verifyGeneratedProjectInstance(targetDir);
    console.log("Skill 分发已满足，无需写入");
    return;
  }
  assertTargetWorkingTreeWritable(targetDir, { packageRoot: path.resolve(__dirname, "../..") });
  const sourceLock = JSON.parse(fs.readFileSync(path.join(BUNDLED_TEMPLATE_ROOT, "skills-lock.json"), "utf8"));
  runInTransaction({
    targetDir, operation: "skills", affectedPaths: paths,
    execute(transaction) {
      const nextMetadata = structuredClone(metadata);
      const nextLock = structuredClone(lock);
      if (addedRuntime) {
        nextMetadata.distribution.runtimes.push(addedRuntime);
        nextLock.projectionRoots.push(RUNTIMES[addedRuntime]);
      }
      for (const name of missing) {
        const source = path.join(BUNDLED_TEMPLATE_ROOT, ".agents/skills", name);
        if (pathKind(source) !== "directory" || !sourceLock.skills.shared[name]) throw new Error(`CLI 快照缺少 Skill：${name}`);
        transaction.copyFile(source, targetPath(targetDir, `.agents/skills/${name}`));
        for (const root of roots) transaction.copyFile(source, targetPath(targetDir, `${root}/${name}`));
        if (name === "yss-design-system") {
          for (const root of [".agents/skills", ...roots]) {
            for (const file of ["SKILL.md", "references/data-quality-theme.md"]) {
              const target = targetPath(targetDir, `${root}/${name}/${file}`);
              transaction.writeFile(target, renderInstanceDesignSkillFile(fs.readFileSync(target, "utf8")));
            }
          }
        }
        nextMetadata.distribution.installedSkills.push(name);
        nextLock.skills.shared[name] = { ...sourceLock.skills.shared[name], targets: [".agents/skills", ...nextLock.projectionRoots] };
        addManagedTree(nextMetadata, targetDir, `.agents/skills/${name}`);
        for (const root of roots) addManagedTree(nextMetadata, targetDir, `${root}/${name}`);
      }
      if (addedRuntime) {
        const root = RUNTIMES[addedRuntime];
        for (const name of Object.keys(nextLock.skills.shared)) {
          const source = targetPath(targetDir, `.agents/skills/${name}`);
          transaction.copyFile(source, targetPath(targetDir, `${root}/${name}`));
          if (nextMetadata.distribution.installedSkills.includes(name)) addManagedTree(nextMetadata, targetDir, `${root}/${name}`);
        }
        for (const operation of runtimeFiles) {
          transaction.copyFile(operation.sourcePath, operation.targetPath);
          nextMetadata.managedFiles[operation.relativePath] = { type: operation.type, contentHash: fileHash(operation.targetPath) };
        }
      }
      for (const record of Object.values(nextLock.skills.shared)) record.targets = [".agents/skills", ...nextLock.projectionRoots];
      nextMetadata.distribution.installedSkills.sort();
      transaction.writeFile(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);
      refreshGeneratedProjectInstance(targetDir);
      nextMetadata.managedFiles["skills-lock.json"] = { type: "render", contentHash: fileHash(lockPath) };
      verifyGeneratedProjectInstance(targetDir);
      writeTemplateMetadata(targetDir, nextMetadata, transaction);
    },
  });
  console.log(runtimeAdd ? `已增加平台 ${runtime}` : `已补装 ${missing.join(", ")}`);
}

module.exports = { runSkills };
