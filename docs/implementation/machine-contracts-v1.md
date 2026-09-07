# create-yss-spec Machine Contracts v1

## 目标

为 CLI、CI、Programmatic API、Agent 和未来 MCP Server 提供稳定、可版本化、可验证的机器接口。人类可读文本可以继续演进，但机器调用只应依赖本文件定义的 JSON contract。

## 当前 contracts

- `src/contracts/plan-schema-v1.json`
- `src/contracts/error-envelope-v1.json`
- `src/contracts/doctor-report-v1.json`
- `src/contracts/apply-result-v1.json`
- `src/contracts/ownership-policy-v1.json`
- `src/contracts/customization-policy-v1.json`
- `src/contracts/generator-policy-v1.json`

## Plan Schema v1

适用：

```bash
create-yss-spec sync --json
create-yss-spec diff --json
```

Programmatic API：

```js
const { templatePlan, projectDiff } = require("create-yss-spec");
```

Plan 包含 changes / conflicts / unsafe / warnings / stats / migration，并可携带：

- ownership
- mergeStrategy
- generatorId
- generatorVersion

`user-owned` / `protected` 必须进入 unsafe；`manual` customization conflict 必须 `forceable=false`。

## Error Envelope v1

CLI 使用 `--json` 且失败时 stdout 返回：

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

同时退出码非零。

Programmatic API：

```js
const { toErrorEnvelope } = require("create-yss-spec");
```

机器调用方应依赖 `error.code`，不应解析中文 message。

## Doctor Report v1

适用：

```bash
create-yss-spec doctor --json
```

Programmatic API：

```js
const { projectDoctor } = require("create-yss-spec");
```

检查包括：snapshot、metadata、template drift、ownership/customization/generator policy drift、managed baseline、identity、Git 安全和 verifier 状态。

Contract：`src/contracts/doctor-report-v1.json`。

## Apply Result v1

Programmatic API：

```js
const { templateApply } = require("create-yss-spec");
const result = templateApply({ targetDir: "/project", force: true });
```

返回：

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

Contract：`src/contracts/apply-result-v1.json`。

`forceApplied` 只统计真正允许强制覆盖的 conflict；`manual` 不进入该计数。

## Policy contracts

### Ownership Policy v1

- managed
- managed-customizable
- generated
- user-owned
- protected

### Customization Policy v1

- replace-with-force
- manual

### Generator Policy v1

每个 generated 路径绑定稳定 `generatorId + generatorVersion`。

## Schema 验证

开发测试使用 Ajv Draft 2020-12：

```bash
npm run test:contracts
```

Contract schema 自身必须可编译，并至少覆盖一个合法实例和一个非法实例。

## 版本策略

- 新增可选字段：通常保持 schemaVersion。
- 删除字段、重命名、改变核心语义、收紧到破坏已有合法实例：升级 schemaVersion。
- API_VERSION 与 JSON schemaVersion 分开管理。
- 调用方不得依赖 JSON key 顺序。

## Programmatic API 与 MCP

Programmatic API v1 是机器合同的主要 Node.js 入口：

```text
CLI / CI / future MCP
        |
        v
Programmatic API
        |
        v
Planner + Policy + Validation + Transaction
```

MCP 暴露前必须直接复用这些 contract，不另造私有返回结构。
