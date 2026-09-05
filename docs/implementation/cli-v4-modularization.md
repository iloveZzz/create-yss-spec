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
│   ├── plan-schema.js
│   ├── sync-planner.js
│   ├── sync-planner-runtime.js
│   ├── attach-planner.js
│   ├── attach-planner-runtime.js
│   ├── migration-planner.js
│   └── renderer.js
├── project/
│   ├── metadata.js
│   ├── identity.js
│   └── detector.js
├── filesystem/
│   ├── path-utils.js
│   ├── copy-path.js
│   ├── transaction.js
│   ├── transaction-runner.js
│   └── apply-plan.js
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

### P0-A：入口 seam

已完成：

- 新增 `src/cli/index.js` 稳定模块入口。
- 可执行文件通过该入口加载 `runCli`。
- 添加入口兼容测试。
- 不改变业务行为。

### P0-B：CLI adapter 拆分

已完成外层协议与 seam：

1. `cli/args.js`：flag/option schema、parseArgs。
2. `cli/help.js`：help/version 输出。
3. `cli/prompts.js`：TTY / buffered input。
4. `cli/router.js`：命令解析与 dispatch。
5. `commands/*`：init / attach / sync / update adapter。

`help`、`version`、`update/upgrade` 已经由新模块真实执行；`init` / `attach` / `sync` 当前仍委托 legacy execution core，以小步方式保持兼容。

### P0-C：领域 planner 拆分

领域模型已完成，生产 wiring 待接入。

已完成：

- `src/template/plan-schema.js`：稳定 Plan Schema v1。
- `src/template/sync-planner.js`：纯函数化 sync 分类与 Plan 构建。
- `src/template/sync-planner-runtime.js`：文件系统/Git 探测到 planner 的 adapter。
- `src/template/attach-planner.js`：纯函数化 attach 分类与 Plan 构建。
- `src/template/attach-planner-runtime.js`：attach runtime adapter。
- `src/template/migration-planner.js`：move/remove/replace/conflict/unsafe 等迁移领域原语。
- 测试覆盖 managed baseline、local modification、identity conversion、unsafe、migration conflict、attach conflict 与 Plan Schema。

统一 machine-readable Plan：

```json
{
  "schemaVersion": 1,
  "operation": "sync",
  "targetDir": ".",
  "template": { "from": "3.0.0", "to": "4.0.0" },
  "changes": [],
  "conflicts": [],
  "unsafe": [],
  "migration": {},
  "warnings": [],
  "blocked": false,
  "stats": {}
}
```

生产 `classifySyncPlan` / `classifyAttachPlan` 尚未替换：当前 GitHub contents 写接口只支持整文件替换，而 legacy `src/cli.js` 约 72KB。为避免高风险全文件覆盖，生产 wiring 延后到具备可靠 patch 或本地执行环境时完成。

### P0-D：事务执行边界

核心事务能力已完成抽离，生产 wiring 待接入。

已完成：

- `src/filesystem/path-utils.js`：路径归一化、目标路径解析、path kind 探测。
- `src/filesystem/copy-path.js`：拒绝 symlink/特殊文件的安全复制原语。
- `src/filesystem/transaction.js`：`FileTransaction`，完整保留 legacy prepare/backup/mutation tracking/rollback/finish 语义。
- `src/filesystem/apply-plan.js`：managed operation 与 migration operation 的统一 apply service，未知操作 fail closed。
- `src/filesystem/transaction-runner.js`：统一 prepare -> execute -> finish 与失败 rollback 错误合同。
- 使用真实临时文件系统测试 rollback、move/remove、父目录清理、backup collapse、finish 生命周期和 apply service。

`FileTransaction` 的目标是让 command 只表达：

```text
plan affected paths
      ↓
runInTransaction
      ↓
apply managed operations
      ↓
apply migrations
      ↓
verify
      ↓
write metadata
```

后续生产接入后，attach/sync 中重复的 `new Transaction + prepare + try/catch + rollback + finish` 可以被统一 transaction runner 替代。

### P0-E：安全与 Git 边界

下一步抽离：

- git worktree / dirty warning
- gitlink / submodule / detached HEAD 检查
- unmanaged/protected path policy
- snapshot / metadata / identity validation

完成后 legacy `cli.js` 应只剩薄编排与少量兼容桥接。

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
- 新 planner/transaction 在替代生产逻辑之前必须有语义对照测试，确保 fail-closed 和 rollback 行为不弱化。

## 完成定义

P0 完成时应满足：

- `src/cli.js` 不再是业务实现单体。
- init/attach/sync 使用显式 planner + validator + transaction 边界。
- 领域模块不直接读取 argv/TTY，也不直接打印 console。
- 现有 CLI 行为保持兼容。
- unsafe / gitlink / snapshot hash 等 fail-closed 规则保持或增强。
- rollback 与 backup 生命周期有独立测试保障。
- 为 doctor/diff/JSON/MCP 提供稳定的内部 API。
