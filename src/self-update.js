const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE_NAME = "create-yss-spec";
const UPDATE_COMMANDS = new Set(["update", "upgrade"]);

function parseUpdateArgs(argv = []) {
  const options = { dryRun: false, force: false };

  for (const current of argv) {
    if (current === "--dry-run") {
      options.dryRun = true;
    } else if (current === "--force") {
      options.force = true;
    } else {
      throw new Error(`不支持的参数：${current}`);
    }
  }

  return options;
}

function parseSemver(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`无法解析版本号：${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }
  return 0;
}

function defaultSpawn(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    ...options,
  });
}

function spawnFailed(result) {
  return Boolean(result.error) || result.status !== 0;
}

function spawnErrorDetail(result) {
  return (result.stderr || result.error?.message || result.stdout || "").trim();
}

function npmViewLatest(packageName, spawn) {
  const result = spawn("npm", ["view", packageName, "version"], {
    encoding: "utf8",
    timeout: 30000,
  });
  if (spawnFailed(result)) {
    const detail = spawnErrorDetail(result);
    throw new Error(`无法查询最新版本${detail ? `：${detail}` : ""}`);
  }

  const lines = (result.stdout || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  const version = lines[lines.length - 1];
  if (!version) {
    throw new Error("无法查询最新版本：npm view 未返回版本号");
  }
  parseSemver(version);
  return version;
}

function npmGlobalPrefix(spawn) {
  const result = spawn("npm", ["prefix", "-g"], {
    encoding: "utf8",
    timeout: 15000,
  });
  if (spawnFailed(result)) {
    return "";
  }
  return (result.stdout || "").trim();
}

function hasPathSegment(target, segment) {
  return path.resolve(target).split(path.sep).includes(segment);
}

function sameResolvedPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

function findLocalProjectRoot(packageRoot, packageName) {
  const resolved = path.resolve(packageRoot);
  const marker = `${path.sep}node_modules${path.sep}${packageName}`;
  const index = resolved.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  const after = resolved.slice(index + marker.length);
  if (after !== "") {
    return null;
  }
  return resolved.slice(0, index) || path.parse(resolved).root;
}

function detectInstallKind(packageRoot, spawn, packageName = PACKAGE_NAME) {
  const resolvedRoot = path.resolve(packageRoot);

  if (hasPathSegment(resolvedRoot, "_npx")) {
    return { kind: "npx" };
  }

  if (fs.existsSync(path.join(resolvedRoot, ".git"))) {
    return { kind: "source" };
  }

  const prefix = npmGlobalPrefix(spawn);
  if (prefix) {
    const globalRoots = [
      path.join(prefix, "lib", "node_modules", packageName),
      path.join(prefix, "node_modules", packageName),
    ];
    if (globalRoots.some((candidate) => sameResolvedPath(candidate, resolvedRoot))) {
      return { kind: "global" };
    }
  }

  const projectRoot = findLocalProjectRoot(resolvedRoot, packageName);
  if (projectRoot) {
    return { kind: "local", cwd: projectRoot };
  }

  return { kind: "unknown" };
}

function buildInstallPlan(install, packageName) {
  if (install.kind === "global") {
    return {
      command: "npm",
      args: ["install", "-g", `${packageName}@latest`],
      cwd: undefined,
    };
  }
  if (install.kind === "local") {
    return {
      command: "npm",
      args: ["install", `${packageName}@latest`],
      cwd: install.cwd,
    };
  }
  return null;
}

function formatInstallCommand(plan) {
  const rendered = `npm ${plan.args.join(" ")}`;
  if (!plan.cwd) {
    return rendered;
  }
  return `npm ${plan.args.join(" ")}（目录：${plan.cwd}）`;
}

function writeln(stdout, line) {
  stdout.write(line.endsWith("\n") ? line : `${line}\n`);
}

function printInstallAdvice(stdout, install) {
  writeln(stdout, "当前安装方式不会自动覆盖本地文件");
  if (install.kind === "source") {
    writeln(
      stdout,
      "检测到源码目录；请通过发布流程或 npm install -g create-yss-spec@latest 升级",
    );
  } else if (install.kind === "npx") {
    writeln(
      stdout,
      "当前通过 npx 运行；下次使用 npx create-yss-spec@latest 即可拿到最新版",
    );
  } else {
    writeln(stdout, "未能判断安装位置");
  }
  writeln(stdout, "建议：");
  writeln(stdout, "  npm install -g create-yss-spec@latest");
  writeln(stdout, "  npx create-yss-spec@latest");
}

function runUpdate(argv = [], deps = {}) {
  const spawn = deps.spawn || defaultSpawn;
  const packageRoot = deps.packageRoot;
  const currentVersion = deps.currentVersion;
  const packageName = deps.packageName || PACKAGE_NAME;
  const stdout = deps.stdout || process.stdout;
  const options = parseUpdateArgs(argv);

  if (!packageRoot) {
    throw new Error("update 缺少 packageRoot");
  }
  if (!currentVersion) {
    throw new Error("update 缺少 currentVersion");
  }

  const latestVersion = npmViewLatest(packageName, spawn);
  const comparison = compareSemver(currentVersion, latestVersion);

  writeln(stdout, `当前版本：${currentVersion}`);
  writeln(stdout, `最新版本：${latestVersion}`);

  if (comparison > 0) {
    writeln(stdout, "当前版本新于 npm latest，未降级");
    return { status: "newer-than-latest", latestVersion };
  }

  if (comparison === 0 && !options.force) {
    writeln(stdout, "已是最新版本");
    return { status: "up-to-date", latestVersion };
  }

  const install = detectInstallKind(packageRoot, spawn, packageName);
  const plan = buildInstallPlan(install, packageName);

  if (!plan) {
    printInstallAdvice(stdout, install);
    return { status: "advice", kind: install.kind, latestVersion };
  }

  const commandText = formatInstallCommand(plan);
  if (options.dryRun) {
    writeln(stdout, "dry-run 预览");
    writeln(stdout, `将执行：${commandText}`);
    return { status: "dry-run", kind: install.kind, latestVersion, commandText };
  }

  writeln(stdout, `正在安装：${commandText}`);
  const result = spawn(plan.command, plan.args, {
    encoding: "utf8",
    timeout: 120000,
    cwd: plan.cwd,
  });
  if (result.stdout) {
    writeln(stdout, result.stdout);
  }
  if (spawnFailed(result)) {
    const detail = spawnErrorDetail(result);
    throw new Error(`升级失败${detail ? `：${detail}` : ""}`);
  }
  if (result.stderr && result.stderr.trim()) {
    writeln(stdout, result.stderr);
  }
  writeln(stdout, `升级完成：${currentVersion} -> ${latestVersion}`);
  return { status: "updated", kind: install.kind, latestVersion };
}

module.exports = {
  PACKAGE_NAME,
  UPDATE_COMMANDS,
  parseUpdateArgs,
  compareSemver,
  detectInstallKind,
  runUpdate,
};
