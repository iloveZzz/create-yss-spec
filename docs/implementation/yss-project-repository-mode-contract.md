---
pipeline: template-governance
stage: cross-repo-implementation
status: verified
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
| working_branch | `main` |
| template_ref | `644111b5c438b1e90dfb5974a327302979410210` |
| ci_system | GitHub Actions 尚未配置 |
| test_command | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test` |
| package_command | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm pack --dry-run` |

本切片不涉及 frontend、backend、OpenAPI、数据库、权限或审计日志；相关字段均为 `not-applicable`。

## CLI 行为契约

### 初始化

空目录初始化仍生成 `schema_version: 1`、`repository_mode: project-instance`，并写入 metadata schema v2。init / sync 按显式分发清单只复制项目需要的根规则、文档、skills、共享 `scripts/`、`scripts/vendor/`、`.nvmrc` 和 `.gitignore`；不复制模板源治理笔记、源仓库 ADR、`.github/`、`.cursor/environment.json`、`wiki/`、`docs/reviews/` 或根 `package.json`。metadata 至少包含：

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

`attach` 仅处理 manifest 声明的研发管理资产；前后端运行时代码、业务目录、用户文件、`.git`、`.gitmodules`、gitlink 和 `apps/` 下已挂载工作树原样保留。必须显式选择 `--dry-run` 或 `--apply`。已有 `.yss-template.json` 时拒绝并提示 `sync`。快照级排除 `.template-source/`、`.github/`、`.cursor/environment.json`、源仓库 ADR、`wiki/`、`docs/reviews/` 和根 `package.json`。`yss-public-skills.json` 仅 init / sync 排除，attach 会带上以便 `verify-template` 通过。

身份规则：缺失身份文件时创建合法 `project-instance`；合法 `template-source` 在显式 attach 中转换为 `project-instance`；合法 `project-instance` 保留并校验；schema、字段或 mode 非法时在写入前阻断。

`644111b` 起实例会带上数字人角色叠加（`docs/agents/digital-human-roles.yaml`）、`@yss/skills` 前端技能叠加层、DDD Tactical Design 与生命周期转换校验资产、`.cursorrules` 和 `.agents/rules/yss-ai-skills.md`，退役技能如 `high-fidelity-html-prototype` 不再作为独立物理目录进入实例。快照会把已登记 shared skill 的投影对齐到 `.agents/skills` 权威树，再按逻辑文件名刷新 `skills-lock.json` hash，最后才做 npm 点文件编码。叠加层已在模板源完成全 Agent 投影并登记进锁文件。

每个 manifest 路径在计划中归类为 `missing`、`matched`、`conflict` 或 `unsafe`。`--force` 只允许覆盖受管 `conflict`，不能绕过 `unsafe`、旧路径迁移冲突或无法推断功能归属的扁平 Ticket。覆盖前保存目标目录外的临时备份；校验失败时按操作日志回滚，metadata 不更新。

### `sync`

`sync` 只使用当前 CLI 包内置模板快照；“最新”指用户执行的 `npx create-yss-spec@latest` 所携带的最新已发布快照，运行时不直接拉取模板仓库。

- 缺少 metadata 时拒绝并提示 `attach`。
- dry-run 展示新增、更新、冲突、迁移和模板删除报告。
- 普通同步新增缺失文件，更新 baseline 未被本地修改的文件，跳过并报告冲突。
- `sync --force` 先备份，再覆盖受管冲突文件；模板删除默认只报告。
- 旧 skill、旧 Spec / Ticket 路径和根 `.scratch/<feature>/` 只在安全迁移计划成功时移动或删除；unsafe / conflict 阻断。
- 空 gitlink、uninitialized、detached HEAD 和 git-submodule 挂载点在写入前 fail closed；`--force` 不能覆盖。
- init 完成后做实例边界校验（禁止源仓笔记、维护工具和环境配置泄漏）。sync 对已误进实例的 `.template-source/`、`wiki/`、`docs/reviews/` 和源仓库 ADR 只 `remove-report`，不把遗留文件当成校验失败。attach 完成后重新执行 `scripts/sync-skills --check`、`scripts/update-skill-lock --check` 和 `scripts/verify-template`；任一失败则回滚文件并保留旧 metadata 版本。

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
| 空目录初始化 | `project-instance`、metadata v2、固定 commit、实例包含共享 `scripts` / `scripts/vendor`，且不含源仓笔记 / `.github` |
| 任意已有项目 attach dry-run | 不写文件、不删除 `.git`，运行时代码保持不变 |
| attach 冲突 | 无 force fail closed；force 覆盖并输出外部备份路径 |
| attach 旧路径迁移 | Spec / Ticket 映射生效；unsafe / conflict 不落盘 |
| gitlink 挂载点 | 空 gitlink / detached HEAD / `--force` 覆盖均 fail closed，不改 `.gitmodules` |
| sync baseline | 新增、更新、跳过、删除报告与 metadata 升级通过 |
| post-attach gates | attach 三个模板门禁全部 fresh 通过，失败时文件和 metadata 回滚 |
| 固定快照 | `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test` 与 `npm pack --dry-run` 通过 |

### 2026-08-26 跨仓库验证回写（`030d806` / CLI `2.2.3`）

- 模板：`yss-spec-project-template@030d8062634018880a3422fd55065d8d8e61e41e`（数字人角色叠加、分级会签与运行时解耦）
- CLI：`create-yss-spec@2.2.3`，`DEFAULT_TEMPLATE_REF` 已绑定上述 commit
- `YSS_SPEC_TEMPLATE_REF=030d8062634018880a3422fd55065d8d8e61e41e npm test` → **41/41 pass**
- `YSS_SPEC_TEMPLATE_REF=030d8062634018880a3422fd55065d8d8e61e41e npm pack --dry-run` → `create-yss-spec-2.2.3.tgz`
- 交互式 init 实例：`project-instance`、`templateCommit` 写入 metadata；含 `docs/agents/digital-human-roles.yaml`、`.cursorrules`、共享 `scripts/`、`scripts/vendor/`、`.nvmrc`、`.gitignore`；不含 `.template-source/`、`.github/`、`wiki/`、`docs/reviews/`、根 `package.json`
- 本轮不执行 npm publish（由维护者手动发布）

### 2026-08-25 跨仓库验证回写（`51189ca` / CLI `2.2.2`）

- 模板：`yss-spec-project-template@51189cae987209ff9076a3336269318f47615d5a`（合并 `codex/agents-skills-governance` 与源仓库分发边界归档）
- CLI：`create-yss-spec@2.2.2`，`DEFAULT_TEMPLATE_REF` 已绑定上述 commit
- `YSS_SPEC_TEMPLATE_REF=51189cae987209ff9076a3336269318f47615d5a npm test` → **41/41 pass**
- `YSS_SPEC_TEMPLATE_REF=51189cae987209ff9076a3336269318f47615d5a npm pack --dry-run` → `create-yss-spec-2.2.2.tgz`（5.6 MB / 4908 files）
- 交互式 init 实例：`project-instance`、`templateCommit` 写入 metadata；含 `.cursorrules`、共享 `scripts/`、`scripts/vendor/`、`.nvmrc`、`.gitignore`；不含 `.template-source/`、`.github/`、`wiki/`、`docs/reviews/`、根 `package.json`
- 本轮不执行 npm publish（由维护者手动发布）

### 2026-08-27 跨仓库验证回写（`37251d0` / CLI `2.2.4`）

- 模板：`yss-spec-project-template@37251d0c7dacbe62a66cd935f1d33031891afedd`（DDD Tactical Design、生命周期转换校验、实例门禁与源仓证据边界修复）
- CLI：`create-yss-spec@2.2.4`，`DEFAULT_TEMPLATE_REF` 已绑定上述 commit
- `YSS_SPEC_TEMPLATE_REF=37251d0c7dacbe62a66cd935f1d33031891afedd npm test` → **55/55 pass**
- `YSS_SPEC_TEMPLATE_REF=37251d0c7dacbe62a66cd935f1d33031891afedd npm pack --dry-run` → `create-yss-spec-2.2.4.tgz`（5.8 MB / 5160 files）
- 本轮不执行 npm publish（由维护者手动发布）

### 2026-08-27 跨仓库验证回写（`0c325d4` / CLI `2.2.5`）

- 模板：`yss-spec-project-template@0c325d4f578481b1aa90c1897c0f986f040ea62b`（技能注册表激活、生命周期路由与前端实现证据门禁同步）
- CLI：`create-yss-spec@2.2.5`，`DEFAULT_TEMPLATE_REF` 已绑定上述 commit
- `YSS_SPEC_TEMPLATE_REF=0c325d4f578481b1aa90c1897c0f986f040ea62b npm test` → **55/55 pass**
- `YSS_SPEC_TEMPLATE_REF=0c325d4f578481b1aa90c1897c0f986f040ea62b npm pack --dry-run` → `create-yss-spec-2.2.5.tgz`（5.8 MB / 5160 files）
- 本轮执行 npm publish，并以 npm registry 查询结果作为发布证据

## 发布顺序与阻断条件

1. 模板仓库修复流程资产和 `.qoder` 投影，fresh verification 通过并形成确定 commit。
2. CLI 绑定该 commit，执行跨仓库 attach / sync 集成测试和独立 review。
3. 执行 `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test`、`npm pack --dry-run`，确认包内 snapshot 可用。
4. 发布 CLI `2.2.5`；验证记录与回滚点已回写（见上文 2026-08-27 条目）。

跨仓库实现与固定快照验证已完成；独立 review 仍为发布门禁，但不再阻断“CLI 已适配模板 `0c325d4`”这一技术结论。
