# create-yss-spec CLI v4 模块化重构方案

## 目标

在不改变现有 `init`、`attach`、`sync`、`update/upgrade` 外部行为的前提下，将历史 `src/cli.js` 单体拆分为可测试、可组合、可供 JSON API / Programmatic API / MCP 复用的领域模块。

## 当前状态

P0 模块化、P1 Machine Contracts、Ownership/Lifecycle Policy 与 Programmatic API v1 已完成首轮落地。

历史 `src/cli.js` 已退役为兼容桥接；生产命令使用模块化 runtime。

统一执行模型：

```text
Inspect -> Desired State -> Plan -> Validate -> Preview/Apply -> Verify -> Metadata
```

## 当前模块边界

```text
src/
├── api/
│   ├── index.js
│   ├── project-doctor.js
│   ├── project-diff.js
│   ├── template-plan.js
│   ├── template-apply.js
│   └── _sync-service.js
├── cli/
├── commands/
├── template/
├── filesystem/
├── git/
├── validation/
└── contracts/
```

CLI 只负责 argv / 文本渲染；Programmatic API 与 CLI 共享 Planner / Policy / Validation / Transaction。

## Programmatic API v1

`package.json` 的 `main` 指向 `src/api/index.js`。

公开接口：

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

`API_VERSION = 1`。

返回 contract：

- projectDoctor -> Doctor Report v1
- projectDiff/templatePlan -> Plan Schema v1
- templateApply -> Apply Result v1
- toErrorEnvelope -> Error Envelope v1

详细说明见 `docs/implementation/programmatic-api-v1.md`。

## Policy 层

### Ownership Policy v1

- managed
- managed-customizable
- generated
- user-owned
- protected

### Customization Policy v1

- replace-with-force
- manual

`manual` 即使 `--force` 也不能覆盖。

### Generator Policy v1

Generated 资产携带稳定 `generatorId + generatorVersion`。

这些策略均进入 Plan 与 metadata baseline，并由 doctor 检查 drift。

## Transaction / Security

所有写入通过 FileTransaction 执行，支持 prepare / backup / rollback / finish。

以下边界 fail closed：

- 路径越界
- 中间 symlink
- 非目录父路径
- gitlink/submodule/detached HEAD
- user-owned/protected
- manual customization

## Machine Contracts v1

当前 contracts：

- plan-schema-v1.json
- error-envelope-v1.json
- doctor-report-v1.json
- apply-result-v1.json
- ownership-policy-v1.json
- customization-policy-v1.json
- generator-policy-v1.json

开发环境通过 Ajv Draft 2020-12 验证。

## 测试分层

```bash
npm run test:contracts
npm run test:unit
npm run test:integration
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test
```

Programmatic API 额外覆盖：package main、只读 plan/doctor/diff、templateApply、manual conflict、policy baseline。

## 下一阶段

当前不继续扩展业务语义，优先完成真实测试与发布门禁。

MCP 仅在 Programmatic API v1 经完整测试和发布验证后，以薄适配层形式实现；不得复制 Planner / Security / Policy 逻辑。
