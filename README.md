# create-yss-spec

用于初始化、接管已有项目并持续同步 `yss-spec-project-template` 研发管理资产的 npm CLI。

## 用法

```bash
npm create yss-spec@latest
```

也可以使用 `npx`：

```bash
npx create-yss-spec@latest
```

查看用法、命令、参数和样例：

```bash
npx create-yss-spec@latest --help
```

查看 CLI 版本：

```bash
npx create-yss-spec@latest --version
```

## 当前支持

- 交互式收集 `projectName`、`businessDomain`、`targetDir`
- `--team-size`
- `--dry-run`
- `sync --plan`：结构化文本计划，不写入文件
- `sync --json`：Plan Schema v1 JSON，不写入文件
- `diff` / `diff --json`：复用 Sync Planner 计算差异，不写入文件
- `doctor` / `doctor --json`：检查模板实例、身份、Git 与安全状态
- 非空目录默认拒绝，初始化命令的 `--force` 允许重新生成
- `--git-init`
- `--issue-tracker github|gitlab`
- `--include-example-docs`
- `--no-example-docs`
- `attach` 子命令：在已有项目中补齐研发管理资产
- `sync` 子命令
- `update` / `upgrade` 子命令：检查 npm 最新版本，如有更新则安装 CLI 自身
- 基于 `.yss-template.json` 的模板版本基线、managed baseline 与 policy baseline
- 只使用当前 CLI 包内置、绑定不可变 commit 的模板快照
- 初始化时将 `yss-project.yaml` 从 `template-source` 改写为 `project-instance`
- 接管 / 升级时迁移 Spec / Ticket 路径并删除旧 skill
- 旧、新资产内容冲突或清单 schema / mode 非法时 fail closed
- 空 gitlink / detached HEAD / git-submodule 挂载点 fail closed，`--force` 也不能覆盖

## Programmatic API v1

Node.js 调用方可以直接使用 npm package 根入口：

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

```js
const plan = templatePlan({ targetDir: "/path/to/project" });
const report = projectDoctor({ targetDir: "/path/to/project" });
const result = templateApply({ targetDir: "/path/to/project", force: true });
```

`projectDoctor()` 返回 Doctor Report v1，`projectDiff()` / `templatePlan()` 返回 Plan Schema v1，`templateApply()` 返回 Apply Result v1。硬阻断会抛出 Error，可通过 `toErrorEnvelope(error)` 转为 Error Envelope v1。

API 不解析 argv，也不负责 CLI 文本输出；CLI 和未来 MCP 都应复用这一层，而不是复制 Planner / Policy / Transaction 逻辑。

完整说明见 [`docs/implementation/programmatic-api-v1.md`](docs/implementation/programmatic-api-v1.md)。

## CLI v4 模块化架构

P0 模块化重构已完成。历史 `src/cli.js` 单体已退役为兼容桥接，生产 `init / attach / sync / update` 全部通过模块化层执行。

统一执行模型：

```text
Inspect -> Desired State -> Plan -> Validate -> Preview/Apply -> Verify -> Metadata
```

当前已具备：

- Plan Schema v1
- Error Envelope v1
- Doctor Report v1
- Apply Result v1
- Ownership Policy v1
- Customization Policy v1
- Generator Policy v1
- FileTransaction / rollback
- gitlink/submodule/detached HEAD 安全边界
- snapshot/metadata/identity validation
- stable Programmatic API v1

Ownership / lifecycle baseline 会写入 `.yss-template.json`；doctor 会报告 missing/drift/matched 状态。

完整设计见：

- [`docs/implementation/cli-v4-modularization.md`](docs/implementation/cli-v4-modularization.md)
- [`docs/implementation/machine-contracts-v1.md`](docs/implementation/machine-contracts-v1.md)
- [`docs/implementation/ownership-policy-v1.md`](docs/implementation/ownership-policy-v1.md)
- [`docs/implementation/lifecycle-policies-v1.md`](docs/implementation/lifecycle-policies-v1.md)
- [`docs/implementation/programmatic-api-v1.md`](docs/implementation/programmatic-api-v1.md)

## 接管已有项目

```bash
npx create-yss-spec@latest attach \
  --target-dir . \
  --project-name "项目名称" \
  --business-domain "业务领域" \
  --dry-run

npx create-yss-spec@latest attach \
  --target-dir . \
  --project-name "项目名称" \
  --business-domain "业务领域" \
  --apply [--force]
```

关键规则：

- 已有 `.yss-template.json` 时使用 `sync`，不要重复 attach。
- `--dry-run` 与 `--apply` 互斥。
- `manual` customization 冲突不能被 `--force` 覆盖。
- user-owned / protected / gitlink 安全边界不能被 `--force` 绕过。
- Git worktree 有脏改动时只提醒，不自动 stash 或提交。

## 同步已有模板实例仓库

```bash
npx create-yss-spec@latest sync
npx create-yss-spec@latest sync --dry-run
npx create-yss-spec@latest sync --plan
npx create-yss-spec@latest sync --json
npx create-yss-spec@latest diff
npx create-yss-spec@latest diff --json
npx create-yss-spec@latest doctor
npx create-yss-spec@latest doctor --json
```

同步规则：

- 默认只更新未被本地修改的受管模板文件。
- `replace-with-force` 冲突可在 `--force` 下覆盖。
- `manual` 冲突始终保留给人工处理。
- generated 资产携带稳定 generatorId / generatorVersion，但 v1 不扩大自动覆盖权限。
- 模板已删除文件只报告，不自动删除。
- 迁移目标内容不一致时停止，不静默覆盖。

## 升级 CLI 自身

```bash
npx create-yss-spec update
npx create-yss-spec update --dry-run
npx create-yss-spec upgrade
```

## 开发验证

```bash
npm run test:contracts
npm run test:unit
npm run test:integration
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm pack --dry-run
```

正式发布应显式绑定不可变模板 commit。

## 研发记录

- [CLI v4 模块化](docs/implementation/cli-v4-modularization.md)
- [Machine Contracts v1](docs/implementation/machine-contracts-v1.md)
- [Ownership Policy v1](docs/implementation/ownership-policy-v1.md)
- [Lifecycle Policies v1](docs/implementation/lifecycle-policies-v1.md)
- [Programmatic API v1](docs/implementation/programmatic-api-v1.md)
- [完整中文使用手册](docs/user-guide/create-yss-spec-cli-guide.md)
