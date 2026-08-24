---
pipeline: template-governance
stage: cross-repo-implementation
status: ready-for-review
owner: ai
---

# `yss-project.yaml` 与模板生命周期跨仓库实现记录

本文记录 `yss-spec-project-template` 与 `create-yss-spec` CLI 的初始化、已有项目接管、持续同步、迁移和发布契约。

## 实现仓库登记

| 字段 | 值 |
|---|---|
| repo_role | other / npm CLI |
| git_url | `https://github.com/iloveZzz/create-yss-spec.git` |
| default_branch | `main` |
| working_branch | `cursor/adapt-template-04a6151-ed3f` |
| template_ref | `04a6151612289f3cd0ddce2c1411eb3aa2444ba7` |
| ci_system | GitHub Actions 尚未配置 |
| test_command | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test` |
| package_command | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm pack --dry-run` |

本切片不涉及 frontend、backend、OpenAPI、数据库、权限或审计日志；相关字段均为 `not-applicable`。

## CLI 行为契约

### 初始化

空目录初始化仍生成 `schema_version: 1`、`repository_mode: project-instance`，并写入 metadata schema v2。init / sync 只分发必要文档目录、Spec 规范和 skills，不复制模板源治理笔记、`scripts/`、`.github/`、`.nvmrc` 或 `.gitignore`。metadata 至少包含：

- `cliVersion`
- `templateSource: github:iloveZzz/yss-spec-project-template`
- 40 位不可变 `templateCommit`
- `managedFilesManifestVersion`
- `managedFiles` baseline

### `attach`

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

`attach` 仅处理 manifest 声明的研发管理资产；前后端运行时代码、业务目录、用户文件、`.git`、`.gitmodules`、gitlink 和 `apps/` 下已挂载工作树原样保留。必须显式选择 `--dry-run` 或 `--apply`。已有 `.yss-template.json` 时拒绝并提示 `sync`。快照级排除 `.template-source/`、`.github/` 和 `.cursor/environment.json`。`yss-public-skills.json` 仅 init / sync 排除，attach 会带上以便 `verify-template` 通过。

身份规则：缺失身份文件时创建合法 `project-instance`；合法 `template-source` 在显式 attach 中转换为 `project-instance`；合法 `project-instance` 保留并校验；schema、字段或 mode 非法时在写入前阻断。

每个 manifest 路径在计划中归类为 `missing`、`matched`、`conflict` 或 `unsafe`。`--force` 只允许覆盖受管 `conflict`，不能绕过 `unsafe`、旧路径迁移冲突或无法推断功能归属的扁平 Ticket。覆盖前保存目标目录外的临时备份；校验失败时按操作日志回滚，metadata 不更新。

### `sync`

`sync` 只使用当前 CLI 包内置模板快照；“最新”指用户执行的 `npx create-yss-spec@latest` 所携带的最新已发布快照，运行时不直接拉取模板仓库。

- 缺少 metadata 时拒绝并提示 `attach`。
- dry-run 展示新增、更新、冲突、迁移和模板删除报告。
- 普通同步新增缺失文件，更新 baseline 未被本地修改的文件，跳过并报告冲突。
- `sync --force` 先备份，再覆盖受管冲突文件；模板删除默认只报告。
- 旧 skill、旧 Spec / Ticket 路径和根 `.scratch/<feature>/` 只在安全迁移计划成功时移动或删除；unsafe / conflict 阻断。
- 空 gitlink、uninitialized、detached HEAD 和 git-submodule 挂载点在写入前 fail closed；`--force` 不能覆盖。
- init 完成后做瘦实例校验（禁止源仓笔记与工具链泄漏）。sync 对已误进实例的 `.template-source/`、`wiki/`、`docs/reviews/` 只 `remove-report`，不把遗留文件当成校验失败。attach 完成后重新执行 `scripts/sync-skills --check`、`scripts/update-skill-lock --check` 和 `scripts/verify-template`；任一失败则回滚文件并保留旧 metadata 版本。

## 固定迁移映射

| 旧路径 | 当前路径 | 处理 |
|---|---|---|
| `to-prd` | `to-spec` | 已知 skill 映射，安全时删除旧目录 |
| `to-issues` | `to-tickets` | 已知 skill 映射，安全时删除旧目录 |
| `docs/templates/prd-template.md` | `docs/templates/spec-template.md` | 内容冲突阻断 |
| `docs/templates/vertical-slice-issue-template.md` | `docs/templates/vertical-slice-ticket-template.md` | 内容冲突阻断 |
| `docs/requirements/<feature>-prd.md` | `docs/requirements/<feature>-spec.md` | 目标冲突阻断 |
| `.scratch/<feature>/` | `docs/.scratch/<feature>/` | 目标冲突阻断 |
| 扁平 `docs/requirements/tickets/*` | `docs/.scratch/<feature>/issues/` | 无法推断功能归属时 `unsafe`，不强制迁移 |

## 验证证据

测试 seam 固定为公开 CLI 入口，观察退出码、标准输出 / 错误和目标目录内容：

| 场景 | 验证 |
|---|---|
| 空目录初始化 | `project-instance`、metadata v2、固定 commit、瘦实例不含源仓笔记 / `scripts` / `.github` |
| 任意已有项目 attach dry-run | 不写文件、不删除 `.git`，运行时代码保持不变 |
| attach 冲突 | 无 force fail closed；force 覆盖并输出外部备份路径 |
| attach 旧路径迁移 | Spec / Ticket 映射生效；unsafe / conflict 不落盘 |
| gitlink 挂载点 | 空 gitlink / detached HEAD / `--force` 覆盖均 fail closed，不改 `.gitmodules` |
| sync baseline | 新增、更新、跳过、删除报告与 metadata 升级通过 |
| post-attach gates | attach 三个模板门禁全部 fresh 通过，失败时文件和 metadata 回滚 |
| 固定快照 | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test` 与 `npm pack --dry-run` 通过 |

## 发布顺序与阻断条件

1. 模板仓库修复流程资产和 `.qoder` 投影，fresh verification 通过并形成确定 commit。
2. CLI 绑定该 commit，执行跨仓库 attach / sync 集成测试和独立 review。
3. 执行 `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test`、`npm pack --dry-run`，确认包内 snapshot 可用。
4. 发布 CLI `2.2.0`；发布后回写模板与 CLI 的验证记录和回滚点。

任一仓库未通过共同验证、模板引用仍为浮动 ref、独立 review 未完成或打包失败时，只能声明“本仓库实现完成，跨仓库发布受阻”，不得声明整体可发布。本轮不执行 npm publish。
