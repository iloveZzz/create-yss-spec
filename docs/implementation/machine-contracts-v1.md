# create-yss-spec Machine Contracts v1

## 目标

为 CI、Agent、未来 MCP Server 提供稳定、可版本化、可验证的机器接口。CLI 的人类可读输出可以继续演进，但机器调用只应依赖本文件定义的 JSON contract。

## 成功输出：Plan Schema v1

Contract：`src/contracts/plan-schema-v1.json`

适用命令：

```bash
create-yss-spec sync --json
create-yss-spec diff --json
```

核心字段：

```json
{
  "schemaVersion": 1,
  "operation": "sync",
  "targetDir": "/project",
  "template": {
    "from": "3.1.0",
    "to": "4.0.0"
  },
  "changes": [],
  "conflicts": [],
  "unsafe": [],
  "warnings": [],
  "blocked": false,
  "stats": {},
  "migration": {}
}
```

### ownership

`changes` / `conflicts` / `unsafe` 可包含：

```json
{
  "ownership": "managed-customizable"
}
```

合法值：

- `managed`
- `managed-customizable`
- `generated`
- `user-owned`
- `protected`

`user-owned` / `protected` 不允许作为普通模板写入目标；若出现在 desired operation 中，应进入 `unsafe` 并使 `blocked=true`。

## 失败输出：Error Envelope v1

Contract：`src/contracts/error-envelope-v1.json`

当 CLI 参数中包含 `--json` 且命令失败时，stdout 返回：

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

同时进程退出码保持非零。机器调用方不得通过匹配中文 `message` 判断错误类型，应只依赖 `error.code`。

当前稳定错误码包括：

- `YSS_PATH_SAFETY`
- `YSS_GIT_PROTECTED`
- `YSS_OWNERSHIP_PROTECTED`
- `YSS_SNAPSHOT_INVALID`
- `YSS_METADATA_INVALID`
- `YSS_IDENTITY_INVALID`
- `YSS_MIGRATION_CONFLICT`
- `YSS_UNSAFE_PATH`
- `YSS_ARGUMENT_INVALID`
- `YSS_TARGET_INVALID`
- `YSS_COMMAND_FAILED`

未知错误回退为 `YSS_COMMAND_FAILED`。

## Doctor Report v1

Contract：`src/contracts/doctor-report-v1.json`

适用命令：

```bash
create-yss-spec doctor --json
```

核心结构：

```json
{
  "schemaVersion": 1,
  "operation": "doctor",
  "targetDir": "/project",
  "cliVersion": "3.1.0",
  "ok": true,
  "checks": [
    {
      "name": "ownership-policy",
      "status": "ok",
      "detail": "ownership policy baseline 一致：v1",
      "data": {}
    }
  ]
}
```

`checks[].status` 只允许：`ok`、`warning`、`error`。其中只有 `error` 会把 report 的 `ok` 置为 `false`。

Doctor 当前检查包括：

- CLI 内置模板 snapshot 完整性
- 目标目录
- gitlink / detached HEAD 安全状态
- template metadata
- template commit drift
- ownership policy baseline / drift
- managed baseline drift
- project identity
- Git worktree 状态
- `scripts/sync-skills --check`
- `scripts/update-skill-lock --check`
- `scripts/verify-template`（仅真实 Git worktree 执行；doctor 不会为检查临时 `git init`）

## Ownership metadata baseline

`.yss-template.json` 兼容扩展以下字段：

```json
{
  "ownershipPolicyVersion": 1,
  "ownershipPolicyHash": "<sha256>",
  "managedFiles": {
    "AGENTS.md": {
      "type": "render",
      "contentHash": "<sha256>",
      "ownership": "managed-customizable"
    }
  }
}
```

旧实例没有 ownership baseline 时仍可读取；下一次 attach/sync 会自动补齐。Doctor 对缺失 baseline 报 warning，对 hash/version 不一致报 policy drift warning。

## Schema 验证

开发测试使用 Ajv Draft 2020-12 编译 contract，并同时验证合法与非法实例：

```bash
npm run test:contracts
```

当前 contract：

- `src/contracts/plan-schema-v1.json`
- `src/contracts/error-envelope-v1.json`
- `src/contracts/doctor-report-v1.json`
- `src/contracts/ownership-policy-v1.json`

Contract schema 自身应始终保持 Draft 2020-12 可编译。

## 版本策略

- 新增可选字段：保持同一 `schemaVersion`。
- 删除字段、改变字段语义、收紧到破坏已有合法实例：升级 schemaVersion。
- CLI 不应让调用方依赖 JSON key 顺序。
- MCP 暴露前应直接复用这些 contract，不另造一套 MCP 私有返回结构。
