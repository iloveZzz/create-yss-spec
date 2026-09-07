# create-yss-spec Programmatic API v1

## 目标

为 Node.js 调用方、CI 编排器和未来 MCP Server 提供稳定、无 argv / stdout 依赖的程序化接口。

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
4. Apply 与 CLI 复用同一 Planner / Policy / Security / Transaction / Verification。
5. 硬阻断抛出 Error；调用方可用 `toErrorEnvelope(error)` 转 Error Envelope v1。
6. API 返回值直接复用 machine contracts。
7. `force:true` 不代表绕过 manual、ownership 或 Git 安全边界。

## projectDoctor

```js
const report = projectDoctor({ targetDir: "/path/to/project" });
```

返回 Doctor Report v1：`src/contracts/doctor-report-v1.json`。

## projectDiff

```js
const plan = projectDiff({ targetDir: "/path/to/project" });
```

返回 Plan Schema v1。与 `templatePlan()` 共享同一 Planner。

## templatePlan

```js
const plan = templatePlan({ targetDir: "/path/to/project" });
```

返回 Plan Schema v1：`src/contracts/plan-schema-v1.json`。只读。

## templateApply

```js
const result = templateApply({
  targetDir: "/path/to/project",
  force: true,
});
```

执行链路：

```text
Inspect -> Desired State -> Policy -> Plan -> Validate -> Transaction -> Verify -> Metadata
```

返回 Apply Result v1：`src/contracts/apply-result-v1.json`。

```json
{
  "schemaVersion": 1,
  "operation": "sync",
  "targetDir": "/project",
  "backupPath": null,
  "template": {},
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

`replace-with-force` 可被 force 覆盖；`manual` 仍跳过；user-owned/protected 和 gitlink 安全边界仍 fail closed。

## toErrorEnvelope

```js
try {
  templateApply({ targetDir: "/project" });
} catch (error) {
  const envelope = toErrorEnvelope(error);
}
```

返回 Error Envelope v1：`src/contracts/error-envelope-v1.json`。

## npm package 入口

`package.json` 使用：

```json
{ "main": "src/api/index.js" }
```

因此 `require("create-yss-spec")` 是正式 Programmatic API 入口，npm bin 保持不变。

## CLI 与 API

```text
CLI argv / rendering
       ↓
Programmatic API / shared service
       ↓
Planner + Policy + Validation + Transaction
```

当前 sync 复用 `_sync-service`，diff 调用 `projectDiff()`，doctor route 调用 `projectDoctor()`。

Doctor service 的物理位置仍可后续内部迁移；这不属于 API v1 contract。

## 版本策略

- 向后兼容新增：保持 API_VERSION=1。
- 删除/重命名函数或改变核心语义：升级 API_VERSION。
- JSON contract 破坏性变化同步升级 schemaVersion。

## MCP 前置条件

未来 MCP 只能薄映射 `projectDoctor / projectDiff / templatePlan / templateApply`，错误复用 `toErrorEnvelope()`，不得复制业务规则。
