"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const { treeHash } = require("../template-hash");
const { targetPath, pathKind } = require("../filesystem/path-utils");
const {
  createMigrationPlan,
  addUnsafe,
  addConflict,
  addMove,
  addRemove,
  addReplaceWithTemplate,
  addRemoveDuplicate,
} = require("./migration-planner");

const AGENT_SKILL_ROOTS = [
  ".agents/skills",
  ".codex/skills",
  ".cursor/skills",
  ".pi/skills",
];

const LEGACY_SKILL_MAPPINGS = [
  ["to-prd", "to-spec"],
  ["to-issues", "to-tickets"],
];

const LEGACY_FILE_MAPPINGS = [
  ["docs/templates/prd-template.md", "docs/templates/spec-template.md"],
  [
    "docs/templates/vertical-slice-issue-template.md",
    "docs/templates/vertical-slice-ticket-template.md",
  ],
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pathContentHash(absolutePath) {
  const kind = pathKind(absolutePath);
  if (kind === "file") return sha256(fs.readFileSync(absolutePath));
  if (kind === "directory") return treeHash(absolutePath);
  if (kind === "missing") return null;
  return sha256(`${kind}:${fs.realpathSync(absolutePath)}`);
}

function pathsEqual(leftPath, rightPath) {
  const leftKind = pathKind(leftPath);
  const rightKind = pathKind(rightPath);
  return (
    leftKind === rightKind &&
    leftKind !== "missing" &&
    pathContentHash(leftPath) === pathContentHash(rightPath)
  );
}

function managedPathPrefix(relativePath, desiredPathSet) {
  return (
    desiredPathSet.has(relativePath) ||
    [...desiredPathSet].some((candidate) => candidate.startsWith(`${relativePath}/`))
  );
}

function addMigrationDestination(from, to, reason, desiredPathSet, plan) {
  const source = targetPath(plan.targetDir, from);
  const destination = targetPath(plan.targetDir, to);
  const sourceKind = pathKind(source);
  const destinationKind = pathKind(destination);

  if (sourceKind === "missing") return;

  if ([sourceKind, destinationKind].includes("other")) {
    addUnsafe(
      plan,
      from,
      `${reason}：源或目标路径是符号链接或其他不可安全判断的类型`,
    );
    return;
  }

  if (managedPathPrefix(to, desiredPathSet)) {
    addReplaceWithTemplate(plan, from, to, reason);
    return;
  }

  if (destinationKind === "missing") {
    addMove(plan, from, to, reason);
    return;
  }

  if (pathsEqual(source, destination)) {
    addRemoveDuplicate(plan, from, to, reason);
    return;
  }

  addConflict(plan, from, to, `${reason}：迁移目标已存在且内容不一致`);
}

function addDirectoryMigration(from, to, reason, desiredPathSet, plan) {
  const source = targetPath(plan.targetDir, from);
  const destination = targetPath(plan.targetDir, to);
  const sourceKind = pathKind(source);
  const destinationKind = pathKind(destination);

  if (sourceKind === "missing") return;

  if (sourceKind !== "directory" || destinationKind === "other") {
    addUnsafe(plan, from, `${reason}：源或目标路径不是可安全遍历的目录`);
    return;
  }

  if (destinationKind === "file") {
    addConflict(plan, from, to, `${reason}：迁移目标是文件而不是目录`);
    return;
  }

  const entries = fs.readdirSync(source).filter((entry) => entry !== ".DS_Store");
  if (entries.length === 0) {
    addRemove(plan, from, reason, { action: "remove-empty", to });
    return;
  }

  for (const entry of entries) {
    const childFrom = `${from}/${entry}`;
    const childTo = `${to}/${entry}`;
    if (pathKind(targetPath(plan.targetDir, childFrom)) === "directory") {
      addDirectoryMigration(childFrom, childTo, reason, desiredPathSet, plan);
    } else {
      addMigrationDestination(childFrom, childTo, reason, desiredPathSet, plan);
    }
  }

  addRemove(plan, from, reason, { action: "remove-migrated-directory", to });
}

function buildLegacyMigrationPlan(
  targetDir,
  desiredOperations,
  { checkFlatTickets = true } = {},
) {
  const desiredPathSet = new Set(
    desiredOperations.map((operation) => operation.relativePath),
  );
  const plan = createMigrationPlan(targetDir);

  for (const [oldName, newName] of LEGACY_SKILL_MAPPINGS) {
    for (const agentRoot of AGENT_SKILL_ROOTS) {
      addMigrationDestination(
        `${agentRoot}/${oldName}`,
        `${agentRoot}/${newName}`,
        `旧 skill ${oldName} 迁移为 ${newName}`,
        desiredPathSet,
        plan,
      );
    }
  }

  for (const [oldPath, newPath] of LEGACY_FILE_MAPPINGS) {
    addMigrationDestination(
      oldPath,
      newPath,
      "旧模板路径迁移",
      desiredPathSet,
      plan,
    );
  }

  addDirectoryMigration(
    "docs/requirements/issues",
    "docs/requirements/tickets",
    "旧 Ticket 目录迁移",
    desiredPathSet,
    plan,
  );

  const requirementsPath = targetPath(targetDir, "docs/requirements");
  if (pathKind(requirementsPath) === "directory") {
    for (const entry of fs.readdirSync(requirementsPath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith("-prd.md")) {
        const oldPath = `docs/requirements/${entry.name}`;
        const newPath = `docs/requirements/${entry.name.replace(/-prd\.md$/, "-spec.md")}`;
        addMigrationDestination(
          oldPath,
          newPath,
          "旧规格文件名迁移",
          desiredPathSet,
          plan,
        );
      }
    }
  }

  const legacyScratch = targetPath(targetDir, ".scratch");
  if (pathKind(legacyScratch) === "directory") {
    for (const entry of fs.readdirSync(legacyScratch, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      addMigrationDestination(
        `.scratch/${entry.name}`,
        `docs/.scratch/${entry.name}`,
        "根 scratch 目录迁移",
        desiredPathSet,
        plan,
      );
    }
  }

  if (checkFlatTickets) {
    const legacyDirectory = "docs/requirements/tickets";
    const directoryPath = targetPath(targetDir, legacyDirectory);
    if (pathKind(directoryPath) === "directory") {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
      const unsafeEntries = entries.filter(
        (entry) => entry.name !== ".gitkeep" && entry.name !== ".DS_Store",
      );

      if (unsafeEntries.length > 0) {
        for (const entry of unsafeEntries) {
          addUnsafe(
            plan,
            `${legacyDirectory}/${entry.name}`,
            "扁平 Ticket 无法可靠推断功能归属，不能自动迁移",
          );
        }
      } else if (!desiredPathSet.has(`${legacyDirectory}/.gitkeep`)) {
        addRemove(plan, legacyDirectory, "删除空的旧 Ticket 目录", {
          action: "remove-empty",
          to: null,
        });
      }
    }
  }

  return plan;
}

module.exports = {
  AGENT_SKILL_ROOTS,
  LEGACY_SKILL_MAPPINGS,
  LEGACY_FILE_MAPPINGS,
  buildLegacyMigrationPlan,
};
