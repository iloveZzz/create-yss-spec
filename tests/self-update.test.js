const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  compareSemver,
  detectInstallKind,
  parseUpdateArgs,
  runUpdate,
} = require("../src/self-update");

const repoRoot = path.resolve(__dirname, "..");
const cliBin = path.join(repoRoot, "bin/create-yss-spec.js");
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;

function createStdout() {
  let text = "";
  return {
    stream: {
      write(chunk) {
        text += chunk;
        return true;
      },
    },
    output() {
      return text;
    },
  };
}

function createSpawn({
  latest = "2.3.0",
  prefix = "/tmp/npm-prefix",
  viewStatus = 0,
  viewError = "",
  installStatus = 0,
  installError = "",
  installStdout = "added 1 package\n",
} = {}) {
  const calls = [];
  const spawn = (command, args = [], options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === "npm" && args[0] === "view") {
      return {
        status: viewStatus,
        stdout: viewStatus === 0 ? `${latest}\n` : "",
        stderr: viewError,
        error: null,
      };
    }
    if (command === "npm" && args[0] === "prefix") {
      return { status: 0, stdout: `${prefix}\n`, stderr: "", error: null };
    }
    if (command === "npm" && args[0] === "install") {
      return {
        status: installStatus,
        stdout: installStatus === 0 ? installStdout : "",
        stderr: installError,
        error: null,
      };
    }
    return {
      status: 1,
      stdout: "",
      stderr: `unexpected ${command} ${args.join(" ")}`,
      error: null,
    };
  };
  return { spawn, calls };
}

function installCalls(calls) {
  return calls.filter((call) => call.command === "npm" && call.args[0] === "install");
}

test("compareSemver compares major.minor.patch and ignores prerelease suffix", () => {
  assert.equal(compareSemver("2.2.3", "2.3.0"), -1);
  assert.equal(compareSemver("2.2.3", "2.2.3"), 0);
  assert.equal(compareSemver("2.3.0", "2.2.3"), 1);
  assert.equal(compareSemver("v2.2.3", "2.2.3"), 0);
  assert.equal(compareSemver("2.2.3-dev", "2.2.3"), 0);
  assert.throws(() => compareSemver("latest", "2.2.3"), /无法解析版本号/);
});

test("parseUpdateArgs accepts dry-run and force and rejects unknown flags", () => {
  assert.deepEqual(parseUpdateArgs([]), { dryRun: false, force: false });
  assert.deepEqual(parseUpdateArgs(["--dry-run", "--force"]), {
    dryRun: true,
    force: true,
  });
  assert.throws(() => parseUpdateArgs(["--unknown"]), /不支持的参数：--unknown/);
});

test("detectInstallKind identifies npx, source, global, and local installs", () => {
  const prefix = "/tmp/npm-prefix";
  const spawn = () => ({ status: 0, stdout: `${prefix}\n`, stderr: "", error: null });

  assert.equal(
    detectInstallKind(
      "/home/me/.npm/_npx/abc123/node_modules/create-yss-spec",
      spawn,
    ).kind,
    "npx",
  );
  assert.equal(detectInstallKind(repoRoot, spawn).kind, "source");
  assert.equal(
    detectInstallKind(path.join(prefix, "lib/node_modules/create-yss-spec"), spawn)
      .kind,
    "global",
  );
  assert.equal(
    detectInstallKind(path.join(prefix, "node_modules/create-yss-spec"), spawn)
      .kind,
    "global",
  );
  assert.deepEqual(
    detectInstallKind("/tmp/app/node_modules/create-yss-spec", spawn),
    { kind: "local", cwd: "/tmp/app" },
  );
});

test("already latest version does not install", () => {
  const { spawn, calls } = createSpawn({ latest: "2.2.3" });
  const stdout = createStdout();
  const result = runUpdate([], {
    spawn,
    packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
    currentVersion: "2.2.3",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "up-to-date");
  assert.equal(installCalls(calls).length, 0);
  assert.match(stdout.output(), /已是最新版本/);
});

test("newer version on a global install runs npm install -g", () => {
  const { spawn, calls } = createSpawn({ latest: "2.3.0" });
  const stdout = createStdout();
  const result = runUpdate([], {
    spawn,
    packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
    currentVersion: "2.2.3",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "updated");
  assert.deepEqual(installCalls(calls), [
    {
      command: "npm",
      args: ["install", "-g", "create-yss-spec@latest"],
      cwd: undefined,
    },
  ]);
  assert.match(stdout.output(), /升级完成：2\.2\.3 -> 2\.3\.0/);
});

test("newer version on a local install runs npm install in the project root", () => {
  const { spawn, calls } = createSpawn({ latest: "2.3.0" });
  const stdout = createStdout();
  const result = runUpdate([], {
    spawn,
    packageRoot: "/tmp/app/node_modules/create-yss-spec",
    currentVersion: "2.2.3",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "updated");
  assert.deepEqual(installCalls(calls), [
    {
      command: "npm",
      args: ["install", "create-yss-spec@latest"],
      cwd: "/tmp/app",
    },
  ]);
});

test("dry-run previews the install command without installing", () => {
  const { spawn, calls } = createSpawn({ latest: "2.3.0" });
  const stdout = createStdout();
  const result = runUpdate(["--dry-run"], {
    spawn,
    packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
    currentVersion: "2.2.3",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "dry-run");
  assert.equal(installCalls(calls).length, 0);
  assert.match(stdout.output(), /dry-run 预览/);
  assert.match(stdout.output(), /npm install -g create-yss-spec@latest/);
});

test("force reinstalls when the version is already latest", () => {
  const { spawn, calls } = createSpawn({ latest: "2.2.3" });
  const stdout = createStdout();
  const result = runUpdate(["--force"], {
    spawn,
    packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
    currentVersion: "2.2.3",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "updated");
  assert.equal(installCalls(calls).length, 1);
});

test("does not downgrade when current version is newer than latest", () => {
  const { spawn, calls } = createSpawn({ latest: "2.2.3" });
  const stdout = createStdout();
  const result = runUpdate(["--force"], {
    spawn,
    packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
    currentVersion: "2.3.0",
    stdout: stdout.stream,
  });

  assert.equal(result.status, "newer-than-latest");
  assert.equal(installCalls(calls).length, 0);
  assert.match(stdout.output(), /当前版本新于 npm latest，未降级/);
});

test("source checkout and npx report advice without installing", () => {
  for (const packageRoot of [
    repoRoot,
    "/home/me/.npm/_npx/abc123/node_modules/create-yss-spec",
  ]) {
    const { spawn, calls } = createSpawn({ latest: "9.9.9" });
    const stdout = createStdout();
    const result = runUpdate([], {
      spawn,
      packageRoot,
      currentVersion: "2.2.3",
      stdout: stdout.stream,
    });

    assert.equal(result.status, "advice");
    assert.equal(installCalls(calls).length, 0);
    assert.match(stdout.output(), /当前安装方式不会自动覆盖本地文件/);
    assert.match(stdout.output(), /npm install -g create-yss-spec@latest/);
  }
});

test("npm view failure is fail closed and does not install", () => {
  const { spawn, calls } = createSpawn({
    viewStatus: 1,
    viewError: "network error\n",
  });
  const stdout = createStdout();

  assert.throws(
    () =>
      runUpdate([], {
        spawn,
        packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
        currentVersion: "2.2.3",
        stdout: stdout.stream,
      }),
    /无法查询最新版本：network error/,
  );
  assert.equal(installCalls(calls).length, 0);
});

test("npm install failure is fail closed", () => {
  const { spawn } = createSpawn({
    latest: "2.3.0",
    installStatus: 1,
    installError: "EACCES\n",
  });
  const stdout = createStdout();

  assert.throws(
    () =>
      runUpdate([], {
        spawn,
        packageRoot: "/tmp/npm-prefix/lib/node_modules/create-yss-spec",
        currentVersion: "2.2.3",
        stdout: stdout.stream,
      }),
    /升级失败：EACCES/,
  );
});

function writeFakeNpm(binDir, latest = "9.9.9") {
  const npmPath = path.join(binDir, "npm");
  fs.writeFileSync(
    npmPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "view" && args[1] === "create-yss-spec" && args[2] === "version") {
  process.stdout.write(${JSON.stringify(`${latest}\n`)});
  process.exit(0);
}
if (args[0] === "prefix" && args[1] === "-g") {
  process.stdout.write("/tmp/npm-prefix\\n");
  process.exit(0);
}
process.stderr.write("unexpected " + args.join(" ") + "\\n");
process.exit(1);
`,
  );
  fs.chmodSync(npmPath, 0o755);
  return npmPath;
}

function runCli(args, env = process.env) {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
}

test("update and upgrade aliases check npm and do not overwrite the source tree", () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-yss-spec-npm-"));
  writeFakeNpm(binDir, "9.9.9");
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
  };

  for (const command of ["update", "upgrade"]) {
    const result = runCli([command], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`当前版本：${packageVersion}`));
    assert.match(result.stdout, /最新版本：9\.9\.9/);
    assert.match(result.stdout, /检测到源码目录/);
    assert.doesNotMatch(result.stdout, /正在安装/);
  }
});

test("update unknown flags still fail closed", () => {
  const result = runCli(["update", "--unknown-flag"]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /不支持的参数：--unknown-flag/);
});
