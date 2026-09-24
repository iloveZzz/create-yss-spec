# 项目实例按阶段分发

## 现状与边界

以 2026-09-24 的工作树快照创建 Codex 实例，原初始化结果为 346 个文件（2,887,488 字节）：`scripts/` 122 个，`docs/process/` 68 个，`docs/templates/` 19 个。原规则已按 Agent 平台和入口 Skill 过滤，但 `template.manifest.json` 对 `docs/`、`scripts/` 仍是宽白名单。

新实例在 `distribution.assetProfile=stage-selective` 下创建；默认只安装 `stage.entry-triage`、`stage.plan` 的共同资产，以及 `yss-product-lifecycle`、`yss-research`、`i-have-adhd`。同样输入的本地探针生成 154 个文件（1,452,072 字节）。CLI 包仍保留完整的受允许模板快照，以便同一模板提交下补装。

## 不随初始化生成的资产

| 资产 | 处理 |
|---|---|
| `scripts/lib/*.test.mjs`、`.vscode/mcp.json`、`docs/adr/README.md` | 不属于实例入口或所选 Agent 平台的执行依赖；不在初始实例中生成 |
| `docs/api/`、`docs/architecture/`、`docs/design/`、`docs/engineering/` | 随适用阶段或专项 Skill 安装；设计预览和事实包仍受原分发排除规则约束 |
| Spec、Ticket、交付、复盘模板和对应的专项脚本 | 随阶段安装；条件能力由 `skills ensure` 补装 |
| 模板维护入口、fixture、review 证据、`.template-source/` | 继续遵守 `template.manifest.json` 的源/实例边界 |

初始实例保留身份、根合同、生命周期注册表和已发布 ID 基线、Skill 注册表、用户决定与 Plan 入口文档，以及实例校验和这些入口的静态 JavaScript 依赖。`scripts/verify-project-instance` 是初始闭包的实际校验入口。

## 安装合同

- `create-yss-spec assets ensure <stage-id> --plan` 列出新增 Skill、文件和阶段；`--apply` 在一个事务内写入、刷新 Skill 锁并运行实例校验。
- `create-yss-spec skills ensure <skill-id...> --plan|--apply` 保留原有 Skill 依赖解析，并为新实例补齐已选 Skill 在快照中引用的文档、脚本及脚本的静态相对导入。`--when` 继续控制注册表中的条件 Skill 依赖。
- `sync` 使用实例元数据中的阶段与 Skill 选择重算目标文件集；旧 v3 `selected` 元数据没有 `assetProfile` 时维持原宽分发，v2 维持 `legacy-all`。普通同步不自动清理退出分发文件；显式安全清理继续受 `--prune` 的可信旧基线与用户修改保护约束。
- 阶段包覆盖共同入口。业务影响触发的 OpenAPI、现有 UI、特定后端组件等专项能力，按工作单元路由后再运行 `skills ensure`。未安装的条件资产不能解释为对应门禁不适用。

阶段 ID 取自 `docs/process/lifecycle-registry.yaml`；本 CLI 的阶段到文件映射位于 `src/template/asset-runtime.js`。新增阶段、修改阶段入口或增加跨 Skill 的静态导入时，必须同步该映射并验证真实项目实例。当前快照是工作树来源，不构成固定提交发布验证。
