# create-yss-spec Programmatic API v1

## 目标

为 Node.js 调用方、CI 编排器和未来 MCP Server 提供稳定、无 argv / stdout 依赖的程序化接口。

npm package 根入口：

```js
const {
  API_VERSION,
  projectDoctor,
  projectDiff,
  templatePlan,
  templateApply,
  toErrorEnvelope,
} = require("create-yss-spec");
```

当前 `API_VERSION = 1`。

## 设计原则

1. API 不解析 `process.argv`。
2. API 不负责 CLI 文本输出。
3. 只读函数不修改目标项目。
4. Apply 必须复用与 CLI 相同的 Planner / Security / Transaction / Verification。
5. 硬阻断通过抛出 Error 表达；调用方可用 `toErrorEnvelope(error)` 转成 Error Envelope v1。
6. API 返回值复用现有 machine contracts，不另外创造 MCP 私有结构。

## projectDoctor

```js
const report = projectDoctor({
  targetDir: "/path/to/project",
});
```

可选参数：

- `targetDir`：默认 `.`。
- `cwd`：用于解析相对路径，默认 `process.cwd()`。

返回：Doctor Report v1。

Contract：`src/contracts/doctor-report-v1.json`。

该函数只读，不执行自动修复。

## projectDiff

```js
const plan = projectDiff({
  targetDir: "/path/to/project",
});
```

返回：Plan Schema v1。

`projectDiff()` 与 `templatePlan()` 使用同一 Planner；它只是更贴近“查看项目差异”的语义别名。

## templatePlan

```js
const plan = templatePlan({
  targetDir: "/path/to/project",
  force: false,
});
```

返回：Plan Schema v1。

Contract：`src/contracts/plan-schema-v1.json`。

`force` 只影响目标 Git/安全探测语义，不会让 plan 阶段写文件。

## templateApply

```js
const result = templateApply({
  targetDir: "/path/to/project",
  force: true,
});
```

执行链路：

```text
Inspect
  -> Desired State
  -> Ownership / Lifecycle Policy
  -> Planner
  -> Security Validation
  -> FileTransaction
  -> Verify
  -> Metadata Baseline
```

返回：Apply Result v1。

Contract：`src/contracts/apply-result-v1.json`。

核心字段：

```json
{
  "schemaVersion": 1,
  "operation": "sync",
  "targetDir": "/project",
  "backupPath": null,
  "template": {
    "from": "3.1.0",
    "to": "3.1.0"
  },
  "stats": {
    "updated": 0,
    "added": 0,
    "skipped": 0,
    "removed": 0,
    "forceApplied": 0
  },
  "skipped": [],
  "removed": []
}
```

### force 语义

`force: true` 不等于无条件覆盖。

- `replace-with-force` 冲突可被覆盖。
- `manual` 冲突仍然跳过。
- `user-owned` / `protected` 仍然 fail closed。
- gitlink / submodule / detached HEAD 安全边界仍然不可绕过。

## toErrorEnvelope

```js
try {
  templateApply({ targetDir: "/project" });
} catch (error) {
  const envelope = toErrorEnvelope(error);
}
```

返回 Error Envelope v1：

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": {
    "code": "YSS_METADATA_INVALID",
    "message": "..."
  }
}
```

Contract：`src/contracts/error-envelope-v1.json`。

## package main

`package.json` 当前声明：

```json
{
  "main": "src/api/index.js"
}
```

因此 `require("create-yss-spec")` 是正式 programmatic API 入口。npm bin 行为保持不变。

## CLI 与 API 的关系

CLI 是 adapter，不再拥有独立业务规则：

```text
CLI argv / text rendering
          |
          v
Programmatic API / shared service
          |
          v
Planner + Policy + Validation + Transaction
```

当前 `sync` 直接复用 `src/api/_sync-service.js`；`diff` 直接调用 `projectDiff()`；doctor route 直接调用 `projectDoctor()`。

## 版本策略

- 新增向后兼容函数或可选参数：保持 API_VERSION=1。
- 删除/重命名函数、改变参数或返回值核心语义：升级 API_VERSION。
- 返回 JSON contract 的破坏性变化同时升级对应 schemaVersion。
- 调用方不应依赖对象 key 顺序。

## MCP 前置条件

MCP Server 不应复制任何业务判断。未来只允许把以下 API 薄映射为 tools：

- `projectDoctor`
- `projectDiff`
- `templatePlan`
- `templateApply`

MCP 错误直接复用 `toErrorEnvelope()`。
