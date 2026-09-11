# create-yss-spec

用于初始化、接管已有项目并持续同步 `yss-spec-project-template` 研发管理资产的 npm CLI。

源码候选版本：`3.3.7`。当前固定模板为 `yss-spec-project-template@857265c065d48198aaa2a8bcece22da5885daf7b`；CLI 运行时不会拉取模板仓库。`npm create yss-spec@latest` 获取的是实际已发布 npm 包，发布版本请以 `npm view create-yss-spec version` 为准。

## 本版模板能力

本版同步 Handoff v4、领域与阶段决策 v3、前后端交付边界和 committed-source 身份校验。CLI 仍会在同一事务内刷新生成型 `skills-lock.json`，再运行项目实例校验；刷新或校验失败恢复同步前状态。版本升级只完成 GitHub 源码交付，npm 发布状态仍以 registry 为准。

## 快速开始

```bash
npm create yss-spec@latest
npx create-yss-spec@latest --help
npx create-yss-spec@latest --version
```

候选源码示例：

```bash
npx create-yss-spec@latest \
  --project-name "设备借用" \
  --business-domain "内部设备管理" \
  --target-dir ./equipment-project
```

## 五家族身份保护

CLI 在规划和写入前检查模板家族身份，当前识别：

- `create-yss-spec` / `.yss-template.json`
- `create-yss-harness-design` / `.yss-harness-design.json`
- `create-yss-harness-dev` / `.yss-harness-dev.json`
- repository-local backend / `.yss-harness-backend.json`
- repository-local frontend / `.yss-harness-frontend.json`

`docs/process/harness-profile.yaml` 也参与身份判断。异族、多重 identity、损坏 metadata、未知或矛盾 profile、identity symlink 均在写入前 fail closed，`--force` 不能绕过；Programmatic API 使用相同 guard。帮助和版本查询不受目标家族限制。

后端/前端专职模板使用各自仓库的 `scripts/instantiate-harness --target <新目录>`，不由本 CLI 做跨家族原地迁移。

## CLI 能力

- `attach`：接管已有未管理项目。
- `sync`：同步受管资产。
- `sync --dry-run`：传统文本预演。
- `sync --plan`：结构化文本计划。
- `sync --json`：Plan Schema v1。
- `sync --prune`：备份并清理仍等于旧受管基线的退出分发文件。
- `diff / diff --json`：只读差异。
- `doctor / doctor --json`：只读健康诊断。
- `update / upgrade`：只更新 CLI 程序，不同步实例资产。

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
  --apply

npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir .
npx create-yss-spec@latest sync --target-dir . --plan --prune
npx create-yss-spec@latest sync --target-dir . --prune
```

同步安全规则：

- 默认只更新未被本地修改的受管文件。
- `replace-with-force` 冲突只有显式 `--force` 才覆盖。
- `manual` 冲突即使 `--force` 也不会覆盖。
- `user-owned` / `protected`、gitlink/submodule/detached HEAD、路径越界和中间 symlink 均不可被 force 绕过。
- README 仅在初始化时生成，随后由项目维护；attach、sync 和 doctor 均不创建、覆盖或校验。
- `.gitignore` 只更新 `create-yss-spec managed rules` 标记区，标记外内容原样保留；损坏标记不可被 `--force` 绕过。
- 模板删除项默认只报告；`--prune` 只清理仍等于可信旧 baseline 的模板所有文件。
- 校验失败通过 FileTransaction 回滚，并保留必要备份。

## Programmatic API v1

npm package 根入口已经开放稳定 Node.js API：

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
const pruned = templateApply({ targetDir: "/path/to/project", prune: true });
```

返回合同：

- `projectDoctor()` → Doctor Report v1
- `projectDiff()` / `templatePlan()` → Plan Schema v1
- `templateApply()` → Apply Result v1
- `toErrorEnvelope(error)` → Error Envelope v1

API 不解析 argv，也不负责 CLI 文本输出；CLI 与未来 MCP 复用同一 Planner / Policy / Security / Transaction 逻辑。

## Policy 与 metadata baseline

当前五类 ownership：

- `managed`
- `managed-customizable`
- `generated`
- `user-owned`
- `protected`

Customization Policy v1：

- `replace-with-force`
- `manual`

Generator Policy v1 为 generated 资产记录稳定 `generatorId + generatorVersion`。

`.yss-template.json` 会持久化 ownership/customization/generator policy version/hash，以及每个 managed file 的 ownership、mergeStrategy、generatorId/generatorVersion。Doctor 会报告 policy missing/drift/matched。

## 模块化架构

历史约 72KB 的 `src/cli.js` 已退役为兼容桥接。当前执行模型：

```text
CLI / Programmatic API
          ↓
Inspect → Desired State → Policy → Plan → Validate → Transaction → Verify → Metadata
```

核心机器合同：

- Plan Schema v1
- Error Envelope v1
- Doctor Report v1
- Apply Result v1
- Ownership Policy v1
- Customization Policy v1
- Generator Policy v1

## 使用未发布候选包

从本仓固定提交构建候选包时，先使用 `scripts/sync-template.js` 中的 `DEFAULT_TEMPLATE_REF` 重建模板快照，再打包：

```bash
YSS_SPEC_TEMPLATE_REPO=https://github.com/iloveZzz/yss-spec-project-template.git \
YSS_SPEC_TEMPLATE_REF=017925706a981aec9eadefd470232bb531acd4d6 \
node scripts/sync-template.js

npm pack --ignore-scripts
```

`--ignore-scripts` 仅用于已经显式重建并核对固定快照后的候选打包，不代表 npm 发布。

## 开发验证

```bash
npm run test:contracts
npm run test:unit
npm run test:integration
YSS_SPEC_TEMPLATE_REF=017925706a981aec9eadefd470232bb531acd4d6 npm test
npm pack --dry-run
```

## 设计与手册

- [CLI v4 模块化](docs/implementation/cli-v4-modularization.md)
- [Machine Contracts v1](docs/implementation/machine-contracts-v1.md)
- [Ownership Policy v1](docs/implementation/ownership-policy-v1.md)
- [Lifecycle Policies v1](docs/implementation/lifecycle-policies-v1.md)
- [Programmatic API v1](docs/implementation/programmatic-api-v1.md)
- [完整中文使用手册](docs/user-guide/create-yss-spec-cli-guide.md)
