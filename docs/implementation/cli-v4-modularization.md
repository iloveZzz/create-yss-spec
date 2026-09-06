# create-yss-spec CLI v4 模块化重构方案

## 目标

将历史集中在 `src/cli.js` 的 CLI 协议、模板规划、Git 安全检查、事务写入与校验能力拆分为可测试、可组合、可供 CLI / JSON API / MCP 共用的领域模块，同时保持现有 init / attach / sync 行为与 fail-closed 安全语义。

P0 已完成。历史 `src/cli.js` 已退役为兼容桥接，生产命令不再从该单体执行。

## 当前结构

```text
src/
├── cli/
│   ├── index.js
│   ├── args.js
│   ├── flags.js
│   ├── help.js
│   ├── plan-output.js
│   ├── prompts.js
│   └── router.js
├── commands/
│   ├── init.js
│   ├── attach.js
│   ├── sync.js
│   ├── diff.js
│   ├── doctor.js
│   └── update.js
├── template/
│   ├── instance-runtime.js
│   ├── verification-runtime.js
│   ├── plan-schema.js
│   ├── sync-planner.js
│   ├── sync-planner-runtime.js
│   ├── attach-planner.js
│   ├── attach-planner-runtime.js
│   ├── migration-planner.js
│   └── migration-runtime.js
├── filesystem/
│   ├── path-utils.js
│   ├── copy-path.js
│   ├── transaction.js
│   ├── transaction-runner.js
│   └── apply-plan.js
├── git/
│   ├── submodule.js
│   └── worktree.js
└── validation/
    ├── snapshot.js
    ├── metadata.js
    ├── identity.js
    └── security.js
```

`src/cli.js` 仅用于兼容仍直接 import 该路径的调用方：

```text
src/cli.js -> src/cli/index.js
```

## 统一执行模型

生产 `init / attach / sync` 已统一到以下生命周期：

```text
Inspect -> Desired State -> Plan -> Validate -> Preview/Apply -> Verify -> Metadata
```

核心原则：

1. **Plan 是纯数据**：规划阶段不产生文件系统副作用。
2. **Validate fail closed**：unsafe、路径越界、gitlink、非法身份等不能由 `--force` 绕过。
3. **Apply 可事务回滚**：文件变更先 prepare/backup，失败统一 rollback。
4. **CLI 是 adapter**：Planner 和 Validation 不依赖 argv / TTY。
5. **机器接口复用同一领域模型**：`sync --json`、`diff`、未来 MCP 不重新实现 sync 规则。

## P0-A：CLI 入口与协议 ✅

已完成：

- npm bin 显式加载 `src/cli/index.js`。
- 参数、flag、help/version、prompt 与 command router 拆分到 `src/cli/*`。
- `init / attach / sync / update` 分别拥有独立 command module。
- `src/cli.js` 已从约 72KB 单体收缩为兼容桥接。

## P0-B：Planner 领域模型 ✅

### Plan Schema v1

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
  "warnings": [],
  "blocked": false,
  "stats": {},
  "migration": {}
}
```

### Sync Planner

`classifySyncOperations` 负责：

- `added`
- `updated`
- `unchanged`
- `skipped`
- `conflicts`
- `forceableConflicts`
- `unsafe`
- `removed`
- identity conversion

### Attach Planner

`classifyAttachOperations` 负责：

- `missing`
- `matched`
- `identity`
- `conflicts`
- `unsafe`

### Migration Planner

统一表示：

- move
- remove
- replace-with-template
- remove-duplicate
- conflict
- unsafe

真实文件系统探测放在 runtime adapter，不污染纯 Planner。

## P0-C：Transaction / Backup / Rollback ✅

已完成：

- `FileTransaction`
- prepare / backup
- mutation tracking
- parent directory tracking
- copy / move / remove
- rollback
- finish / backup lifecycle
- `runInTransaction`
- managed/migration apply service

关键安全语义：

- `targetPath()` 拒绝 `..` 越界。
- 拒绝中间 symlink。
- 拒绝非目录父路径。
- `copyPath()` 拒绝 symlink / 特殊文件。
- unknown operation fail closed。

这些语义有独立临时文件系统测试保障。

## P0-D：Git / Security / Validation ✅

### Git

- `.gitmodules` 解析
- gitlink mode `160000`
- submodule mount 判断
- Git root / superproject
- empty/uninitialized gitlink
- detached HEAD / attached branch
- dirty worktree warning
- gitlink path repo-level cache，避免 Planner 对每个受管文件重复执行 `git ls-files`

### Security

- `.gitmodules` 为 user-owned
- gitlink / apps mount 为 protected
- empty gitlink / detached HEAD 阻断写入
- `--force` 不可绕过 protected path

### Validation

- immutable 40 位 templateCommit
- 64 位 snapshotHash
- manifest/tree hash
- encodedPaths 越界与重复目标
- metadata schema / template source / managed baseline
- `yss-project.yaml` 严格字段合同
- template-source -> project-instance 显式转换

## P0-E：Production Wiring ✅

三个主命令都已脱离 legacy core。

### Init

```text
Args/Prompt
  -> Snapshot Validation
  -> Target/Git Security
  -> Desired Managed Operations
  -> FileTransaction
  -> Instance Verification
  -> Metadata
  -> optional git init
```

### Attach

```text
Args
  -> Snapshot Validation
  -> Existing Target/Git Security
  -> Identity
  -> Attach Desired State
  -> Attach Planner
  -> Migration Runtime
  -> FileTransaction
  -> Template Verification Gates
  -> Metadata
```

### Sync

```text
Args
  -> Snapshot/Metadata/Identity Validation
  -> Desired State
  -> Sync Planner
  -> Migration Runtime
  -> Protected Path Policy
  -> FileTransaction
  -> Instance Verification
  -> Metadata
```

## P1：只读与机器接口（进行中）

已完成第一批：

```bash
create-yss-spec sync --plan
create-yss-spec sync --json
create-yss-spec diff
create-yss-spec diff --json
create-yss-spec doctor
create-yss-spec doctor --json
```

语义：

- `sync --plan`：输出人类可读 Plan，不写入。
- `sync --json`：输出 Plan Schema v1，不写入。
- `diff`：复用 Sync Planner，默认等价于只读 plan。
- `doctor`：检查 snapshot、metadata、identity、Git、安全边界，不自动修复。

后续 P1 建议：

1. machine-readable error code。
2. `doctor` 更丰富的 verifier checks。
3. `diff --summary` / Plan filter。
4. Plan schema contract 文档与 JSON Schema。
5. 稳定 programmatic API。
6. MCP tools：`project_doctor`、`project_diff`、`template_sync_plan`、`template_apply`。

## Ownership 模型（下一阶段）

当前 manifest 仍采用 allow/exclude 体系。下一阶段建议升级为显式 ownership policy：

- `managed`
- `managed-customizable`
- `generated`
- `user-owned`
- `protected`

升级 ownership schema 应作为独立版本迁移，不与本轮代码模块化绑定。

## 测试策略

快速模块测试：

```bash
npm run test:unit
```

需要模板快照的命令集成测试：

```bash
npm run test:integration
```

完整回归：

```bash
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test
```

现有覆盖包括：

- Planner 分类语义
- Plan Schema
- path traversal / symlink fail-closed
- Transaction rollback / backup
- migration operation
- snapshot / metadata / identity validation
- sync dry-run / plan / JSON
- local modification skip / force overwrite
- attach dry-run / apply / user-owned file preservation
- doctor / diff read-only behavior
- legacy `src/cli.js` compatibility bridge

## P0 完成定义

当前已满足：

- `src/cli.js` 不再是业务实现单体。
- init/attach/sync 使用显式 Planner / Validator / Transaction 边界。
- unsafe / gitlink / snapshot hash 等 fail-closed 规则保持或增强。
- rollback / backup 生命周期有独立测试保障。
- machine-readable Plan 已可被 CLI / CI / Agent 复用。
- 旧入口保留兼容，但不再形成双实现。
