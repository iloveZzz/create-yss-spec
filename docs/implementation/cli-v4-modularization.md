# create-yss-spec CLI v4 模块化重构方案

## 目标

在不改变现有 `init`、`attach`、`sync`、`update/upgrade` 外部行为的前提下，将当前集中在 `src/cli.js` 的实现逐步拆分为可测试、可组合、可供未来 JSON API / MCP 复用的领域模块。

本次重构遵循 compatibility-first：每一步只迁移一个稳定边界，并保持原 CLI 入口和测试契约可回归。

## 目标结构

```text
src/
├── cli/
│   ├── index.js
│   ├── args.js
│   ├── flags.js
│   ├── help.js
│   ├── prompts.js
│   └── router.js
├── commands/
│   ├── init.js
│   ├── attach.js
│   ├── sync.js
│   └── update.js
├── template/
│   ├── manifest.js
│   ├── snapshot.js
│   ├── planner.js
│   ├── renderer.js
│   └── migration.js
├── project/
│   ├── metadata.js
│   ├── identity.js
│   └── detector.js
├── filesystem/
│   ├── transaction.js
│   ├── backup.js
│   └── paths.js
├── git/
│   ├── repository.js
│   ├── worktree.js
│   └── gitlink.js
└── validation/
    ├── manifest.js
    ├── snapshot.js
    ├── project.js
    └── security.js
```

## 统一执行模型

后续 `init` / `attach` / `sync` 应逐步统一到以下生命周期：

```text
Inspect -> Desired State -> Plan -> Validate -> Preview/Apply -> Verify -> Metadata
```

核心原则：

1. **Plan 是纯数据**：规划阶段不产生文件系统副作用。
2. **Validate fail closed**：unsafe、路径越界、gitlink、非法身份等不可由 `--force` 绕过。
3. **Apply 可事务回滚**：所有文件变更先 prepare/backup，失败统一 rollback。
4. **CLI 只是 adapter**：领域规划和校验不得依赖 `console`、TTY 或 `process.argv`。
5. **机器接口优先可复用**：Plan 和错误逐步结构化，为 `--json`、doctor、diff 和 MCP 做准备。

## 文件 Ownership 模型

模板 manifest 后续从 include/exclude 规则升级为显式 ownership policy：

- `managed`：模板完全管理；未修改时自动同步。
- `managed-customizable`：模板提供基线，允许实例定制并进入冲突规划。
- `generated`：由变量或生成器产生，可重新生成。
- `user-owned`：CLI 永不写入、覆盖或删除。
- `protected`：安全边界，即使 `--force` 也禁止覆盖。

现有 `.gitmodules`、gitlink、挂载实现仓等规则应映射为 `user-owned/protected`，保持当前 fail-closed 语义。

## 迁移阶段

### P0-A：入口 seam（已完成）

- 新增 `src/cli/index.js` 稳定模块入口。
- 可执行文件通过 `src/cli` 入口加载 `runCli`。
- 添加入口兼容测试。
- 不改变业务行为。

### P0-B：CLI adapter 拆分（外层协议已完成）

已完成：

1. `cli/flags.js`：统一 help/version flag。
2. `cli/args.js`：参数 schema 与 parseArgs 兼容实现。
3. `cli/help.js`：help/version 纯文本渲染与输出。
4. `cli/prompts.js`：TTY / buffered input 与选项归一化。
5. `cli/router.js`：全局 flag 优先级和命令分类。
6. `commands/*`：init/attach/sync/update 独立 command adapter。
7. `cli/index.js`：真实外层 dispatch；help/version/update 已脱离 legacy `runCli` 执行。

当前 `init` / `attach` / `sync` adapter 仍委托 `src/cli.js` 作为 legacy execution core。这是刻意保留的 strangler seam：后续逐命令迁移实现时，不需要再次修改 bin/router 公共协议。

### P0-C：领域 planner 拆分（下一步）

先拆 `attach` / `sync` 的 classify/build plan 逻辑，再建立统一 Plan schema。规划器必须可在没有真实写入的情况下进行单元测试。

建议 Plan 最低字段：

```json
{
  "operation": "sync",
  "targetDir": ".",
  "template": { "from": "...", "to": "..." },
  "changes": [],
  "conflicts": [],
  "unsafe": [],
  "warnings": [],
  "blocked": false
}
```

建议迁移顺序：

1. `sync` desired operations / classify plan。
2. `attach` desired operations / classify plan。
3. legacy migration plan。
4. 统一 `Plan` schema 和 formatter。
5. command adapter 改为直接调用 planner，而不是 legacy `runCli`。

### P0-D：事务与安全边界拆分

迁移 `Transaction`、backup、path safety、gitlink/worktree 检查。所有 command 通过统一 transaction service 应用计划。

## P1 接口

P0 完成后增加：

```bash
create-yss-spec doctor
create-yss-spec diff
create-yss-spec sync --plan
create-yss-spec sync --json
```

其中 `doctor` 只检查，不修复；`diff` 和 `--plan` 不产生写入；`--json` 输出稳定 schema 和 machine-readable error code。

## 兼容策略

- `bin/create-yss-spec.js` 保持 npm bin 名称不变。
- 现有 flags 和中文错误文本在 P0 默认保持兼容。
- `.yss-template.json` schema 在模块拆分阶段不升级。
- `template.manifest.json` ownership schema 作为独立版本迁移，不与代码拆分绑在同一发布中。
- 每个拆分步骤都必须通过现有测试后才能删除 legacy 实现。
- 在仓库没有分支 CI 的情况下，不把“已写测试”表述为“CI 已通过”；合并前应在可执行环境运行完整 `npm test`。

## 完成定义

P0 完成时应满足：

- `src/cli.js` 不再是业务实现单体。
- init/attach/sync 使用显式 planner + validator + transaction 边界。
- 领域模块不直接读取 argv/TTY，也不直接打印 console。
- 现有 CLI 行为保持兼容。
- unsafe / gitlink / snapshot hash 等 fail-closed 规则保持或增强。
- 为 doctor/diff/JSON/MCP 提供稳定的内部 API。
