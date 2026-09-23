"use strict";

const readline = require("node:readline/promises");

function normalizeInteractiveOptions(options, values) {
  return {
    ...values,
    issueTracker: options.issueTracker || "github",
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    gitInit: Boolean(options.gitInit),
    includeExampleDocs:
      options.includeExampleDocs === undefined
        ? false
        : Boolean(options.includeExampleDocs),
    ...(values.agentRuntime || options.agentRuntime ? { agentRuntime: values.agentRuntime || options.agentRuntime } : {}),
  };
}

async function promptForMissingOptions(options, deps = {}) {
  const stdin = deps.stdin || process.stdin;
  const stdout = deps.stdout || process.stdout;

  if (!stdin.isTTY) {
    return promptFromBufferedInput(options, { stdin, stdout });
  }

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const projectName =
      options.projectName || (await rl.question("项目名称: ")).trim();
    const businessDomain =
      options.businessDomain || (await rl.question("业务领域: ")).trim();
    const teamSizeInput =
      options.teamSize !== undefined
        ? options.teamSize
        : await rl.question("团队规模（可留空）: ");
    const targetDir =
      options.targetDir || (await rl.question("目标目录: ")).trim();
    const agentRuntime = options.agentRuntime || (await rl.question("Agent 平台（codex/cursor/pi）: ")).trim();

    return normalizeInteractiveOptions(options, {
      projectName,
      businessDomain,
      teamSize: (teamSizeInput || "").trim() || "待补充",
      targetDir,
      agentRuntime,
    });
  } finally {
    rl.close();
  }
}

async function promptFromBufferedInput(options, deps = {}) {
  if (!options.agentRuntime) throw new Error("无交互 init 必须显式指定 --agent-runtime codex|cursor|pi");
  const stdin = deps.stdin || process.stdin;
  const stdout = deps.stdout || process.stdout;
  const chunks = [];

  for await (const chunk of stdin) {
    chunks.push(chunk);
  }

  const answers = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  let answerIndex = 0;
  const ask = (label) => {
    stdout.write(`${label}: `);
    const value = answers[answerIndex] ?? "";
    answerIndex += 1;
    return value.trim();
  };

  const projectName = options.projectName || ask("项目名称");
  const businessDomain = options.businessDomain || ask("业务领域");
  const teamSizeInput =
    options.teamSize !== undefined ? options.teamSize : ask("团队规模（可留空）");
  const targetDir = options.targetDir || ask("目标目录");

  return normalizeInteractiveOptions(options, {
    projectName,
    businessDomain,
    teamSize: teamSizeInput || "待补充",
    targetDir,
  });
}

module.exports = {
  normalizeInteractiveOptions,
  promptForMissingOptions,
  promptFromBufferedInput,
};
