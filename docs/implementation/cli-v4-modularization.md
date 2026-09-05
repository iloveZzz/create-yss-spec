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

### P0-A：入口 seam（本分支第一步）

- 新增 `src/cli/index.js` 稳定模块入口。
- 可执行文件通过 `src/cli` 入口加载 `runCli`。
- 添加入口兼容测试。
- 不改变业务行为。

### P0-B：CLI adapter 拆分

依次抽离：

1. `cli/args.js`：flag/option schema、parseArgs。
2. `cli/help.js`：help/version 输出。
3. `cli/prompts.js`：TTY / buffered input。
4. `cli/router.js`：命令解析与 dispatch。

完成后 `src/cli.js` 不再负责命令行协议。

### P0-C：领域 planner 拆分

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

## 完成定义

P0 完成时应满足：

- `src/cli.js` 不再是业务实现单体。
- init/attach/sync 使用显式 planner + validator + transaction 边界。
- 领域模块不直接读取 argv/TTY，也不直接打印 console。
- 现有 CLI 行为保持兼容。
- unsafe / gitlink / snapshot hash 等 fail-closed 规则保持或增强。
- 为 doctor/diff/JSON/MCP 提供稳定的内部 API。
