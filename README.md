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
- 非空目录默认拒绝，初始化命令的 `--force` 允许重新生成
- `--git-init`
- `--issue-tracker github|gitlab`
- `--include-example-docs`
- `--no-example-docs`
- `attach` 子命令：在已有项目中补齐研发管理资产
- `sync` 子命令
- 基于 `.yss-template.json` 的模板版本基线和 managed baseline
- 只使用当前 CLI 包内置、绑定不可变 commit 的模板快照
- 初始化时将 `yss-project.yaml` 从 `template-source` 改写为 `project-instance`
- 接管 / 升级时迁移 Spec / Ticket 路径并删除 `to-prd`、`to-issues` 旧 skill
- 旧、新资产内容冲突或清单 schema / mode 非法时 fail closed
- 保留模板的共享 skill 投影；生成实例可在尚未 `git init` 时运行模板校验

本次模板适配按 `2.1.16` 发布。`templateCommit` 会写入实例 metadata；“最新模板”指用户执行的 `npx create-yss-spec@latest` 所携带的最新已发布快照，CLI 运行时不会拉取模板仓库。

## 接管已有项目

`attach` 只处理 manifest 声明的研发管理资产，不扫描或覆盖前后端运行时代码、业务目录、用户文件和 `.git`。必须先 dry-run，再显式 apply：

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

规则：

- 目标已有 `.yss-template.json` 时拒绝接管，请使用 `sync`。
- `--dry-run` 与 `--apply` 互斥；非交互执行只依赖显式参数。
- 根规则文件等受管冲突默认阻断；`--force` 才覆盖，并把被覆盖文件备份到目标目录外的临时目录。
- 不复制、不覆盖 `.gitignore`、`.nvmrc`、`wiki/`，以及模板源实例文档（`docs/adr/`、`docs/discovery/reports/`、`docs/design/design.md`）。
- 合法 `template-source` 身份会转换为 `project-instance`；非法身份、迁移冲突和无法判断归属的扁平 Ticket 始终阻断。
- Git worktree 有脏改动时只提醒，不自动 stash 或提交。

## 同步已有模板实例仓库

当项目仓库已经由 `create-yss-spec` 初始化，或已经通过 `attach` 接管，并且根目录存在 `.yss-template.json` 时，可以执行：

```bash
npx create-yss-spec@latest sync
```

只预演，不真实写入：

```bash
npx create-yss-spec@latest sync --dry-run
```

当前同步能力的边界：

- 只支持带模板元数据的模板实例仓库
- 不写入 `.gitignore`、`.nvmrc`、`wiki/` 和模板源实例文档
- 默认只更新未被本地修改的受管模板文件
- 对本地已修改文件只提示和跳过，不自动覆盖
- `--force` 先备份，再覆盖受管冲突文件；不覆盖模板无关文件
- 对模板已删除文件只报告，不自动删除
- 对已知的 Spec / Ticket 旧路径执行一次性迁移
- 迁移目标已存在且内容不一致时停止，不静默覆盖
- 同步结束会重新执行 `scripts/sync-skills --check`、`scripts/update-skill-lock --check` 和 `scripts/verify-template`；门禁失败会回滚文件和 metadata

```bash
npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir . [--force]
```

## 开发验证

CLI 源码和研发记录由本仓库独立维护。首次测试会从
[`iloveZzz/yss-spec-project-template`](https://github.com/iloveZzz/yss-spec-project-template)
同步受管模板快照；正式发布应显式绑定确定 commit：

```bash
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm pack --dry-run
```

## 研发记录

- [初始化 CLI Discovery](docs/discovery/yss-spec-cli-init-discovery.md)
- [模板同步 Discovery](docs/discovery/yss-spec-cli-template-sync-discovery.md)
- [初始化 CLI PRD](docs/requirements/yss-spec-cli-init-prd.md)
- [模板同步 PRD](docs/requirements/yss-spec-cli-template-sync-prd.md)
- [垂直切片](docs/requirements/issues/)
- [`yss-project.yaml` 跨仓库实现记录](docs/implementation/yss-project-repository-mode-contract.md)
- [实施路由与 Build Architecture Checklist](docs/implementation/)
- [完整中文使用手册](docs/user-guide/create-yss-spec-cli-guide.md)
