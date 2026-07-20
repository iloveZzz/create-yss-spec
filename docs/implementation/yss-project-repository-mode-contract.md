---
pipeline: template-governance
stage: cross-repo-implementation
status: ready-for-review
owner: ai
---

# `yss-project.yaml` 跨仓库实现记录

本文记录 `yss-spec-project-template` #24 / #26 与本 CLI 仓库之间的身份转换、旧版升级、共同验证和发布约束。

## 实现仓库登记

| 字段 | 值 |
|---|---|
| repo_role | other / npm CLI |
| git_url | `https://github.com/iloveZzz/create-yss-spec.git` |
| default_branch | `main` |
| working_branch | `codex/repository-mode-contract` |
| template_ref | `codex/ticket-directory-contract`；合并后改为对应确定 commit / tag |
| ci_system | GitHub Actions 尚未配置 |
| test_command | `npm test` |
| package_command | `npm pack --dry-run` |

本切片不涉及 frontend、backend、OpenAPI、数据库、权限或审计日志；相关字段均为 `not-applicable`。

## CLI 行为契约

初始化时：

1. 只接受 `schema_version: 1`、`repository_mode: template-source` 且仅含这两个字段的模板清单。
2. 输出实例固定写入 `schema_version: 1`、`repository_mode: project-instance`。
3. 实例中不得出现单数 `.agent/`、`to-prd`、`to-issues`、旧 PRD 模板或旧 Issue 切片模板。
4. 模板内的安全相对符号链接必须保留或等价物化，生成实例的 skill 投影校验必须通过。

同步升级时：

1. 目标清单缺失时由模板新增；`template-source` 可升级为 `project-instance`。
2. 目标清单 schema、字段或 mode 非法时，在写入前停止。
3. 迁移 `prd-template.md -> spec-template.md`、`vertical-slice-issue-template.md -> vertical-slice-ticket-template.md`、`docs/requirements/issues/ -> docs/requirements/tickets/`、`*-prd.md -> *-spec.md`。
4. 删除各 Agent root 下的 `to-prd`、`to-issues`，不创建兼容别名。
5. 旧、新目标内容不一致时输出完整冲突路径并 fail closed；内容一致时只删除旧副本。

## 验证证据

测试 seam 固定为公开 CLI 入口，观察退出码、标准输出 / 错误和目标目录内容，不测试内部函数。

| 场景 | 验证 |
|---|---|
| 空目录初始化 | 输出清单为 `project-instance` 且仅含两个字段 |
| 模板清单异常 | 未知 schema、mode、字段均在写入前拒绝 |
| 旧版升级 | Spec / Ticket 路径迁移、旧 skill 删除、身份转换通过 |
| 内容冲突 | 命令非零退出，冲突双方不被修改 |
| 共同集成 | `YSS_SPEC_TEMPLATE_REF=codex/ticket-directory-contract npm test`：20/20 通过 |
| 实例自校验 | 初始化结果直接执行 `scripts/verify-template` 通过，无需先 `git init` |
| 包内容 | `YSS_SPEC_TEMPLATE_REF=codex/ticket-directory-contract npm pack --dry-run` 通过 |

## 发布顺序与阻断条件

1. 先审查并合并模板 PR，获得确定模板 commit / tag。
2. 将 CLI 验证绑定到该确定引用，重新执行 `npm test` 与 `npm pack --dry-run`。
3. 审查并合并 CLI PR；本变更按 `2.0.0` major 版本准备，但本记录不授权执行 npm 发布。
4. npm 发布后，在模板 #26 / #24 回写版本、PR、验证与回滚证据。

以下任一条件成立时禁止声明整体可发布：模板 PR 未合并、CLI PR 未独立 review、共同测试未绑定确定引用、`npm pack --dry-run` 失败，或 npm 包尚未按发布流程确认。
