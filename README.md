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
- `update` / `upgrade` 子命令：检查 npm 最新版本，如有更新则安装 CLI 自身
- 基于 `.yss-template.json` 的模板版本基线和 managed baseline
- 只使用当前 CLI 包内置、绑定不可变 commit 的模板快照
- 初始化时将 `yss-project.yaml` 从 `template-source` 改写为 `project-instance`
- 接管 / 升级时迁移 Spec / Ticket 路径并删除 `to-prd`、`to-issues` 旧 skill
- 旧、新资产内容冲突或清单 schema / mode 非法时 fail closed
- 保留模板的共享 skill 投影；生成实例可在尚未 `git init` 时运行模板校验
- init / sync 不把模板源治理笔记、wiki、审查证据、源仓 CI / Cloud 环境和公开发布清单写入项目实例；attach 会带上 `yss-public-skills.json` 供 `verify-template` 使用
- 空 gitlink / detached HEAD / git-submodule 挂载点 fail closed，`--force` 也不能覆盖

本次模板适配按 `2.2.6` 绑定 `yss-spec-project-template@4743a3f`（Git 源码快照；本轮不发布 npm）。`templateCommit` 会写入实例 metadata；“最新模板”指用户执行的 `npx create-yss-spec@latest` 所携带的最新已发布快照，CLI 运行时不会拉取模板仓库。实例会带上数字人角色叠加（`docs/agents/digital-human-roles.yaml`）、YSS 前端技能叠加层（如 `ytable-usage`、`formily-foundation`、`yss-page-module-development`）、DDD Tactical Design 与生命周期转换校验资产、唯一 `code-review` 入口及其 YSS / Alibaba 专项检查与 finding 分流合同、`.cursorrules` 与 `.agents/rules/yss-ai-skills.md`；审查临时目录 `docs/.scratch/` 与已退役的 `high-fidelity-html-prototype` 等独立入口不进入快照。

## 当前版本说明

当前 CLI 版本为 `3.0.0`，模板固定到 `ec54212e2a3c3ab2f2496dc27c3979b6f2ecba03`。该主版本将 Web 生成升级为批准的 schema v2 合同，绑定 `yss-dto` wire profile，并要求通过完整首切片验证器后才能声明 `first-slice-verified`。

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
- 合法 `template-source` 身份会转换为 `project-instance`；非法身份、迁移冲突和 attach 时无法判断归属的扁平 Ticket 始终阻断。
- Git worktree 有脏改动时只提醒，不自动 stash 或提交。
- `.gitmodules`、gitlink 和 `apps/` 挂载工作树是用户资产；空 gitlink / detached HEAD 即使 `--force` 也阻断。

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
- 默认只更新未被本地修改的受管模板文件
- 对本地已修改文件只提示和跳过，不自动覆盖
- `--force` 先备份，再覆盖受管冲突文件；不覆盖模板无关文件
- 对模板已删除文件只报告，不自动删除
- 对已知的 Spec / Ticket 旧路径执行一次性迁移
- `docs/requirements/tickets/` 只在 attach 时检查归属；sync 不迁移、不删除，也不因其中存在 Ticket 而阻断
- 迁移目标已存在且内容不一致时停止，不静默覆盖
- `.gitmodules`、gitlink（mode `160000`）和 `apps/` 下已挂载实现仓是用户资产，不创建、不覆盖、不删除
- init / sync 保持实例边界：不复制 `wiki/`、`.github/`、`.template-source/`、源仓库 ADR、Cursor Cloud 环境配置、`docs/reviews/` 或根 `package.json`；共享 `scripts/`、`scripts/vendor/`、`.nvmrc` 和 `.gitignore` 属于实例门禁所需资产。attach 结束后会执行 `scripts/sync-skills --check`、`scripts/update-skill-lock --check` 和 `scripts/verify-template`，门禁失败会回滚文件和 metadata

```bash
npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir . [--force]
```

## 升级 CLI 自身

`update`（别名 `upgrade`）检查 npm registry 上的最新 `create-yss-spec` 版本，如有更新则按当前安装方式自动安装。它升级的是 CLI 包本身，不会同步项目里的模板资产；模板同步仍使用 `sync`。

```bash
npx create-yss-spec update
npx create-yss-spec update --dry-run
npx create-yss-spec upgrade
```

- 全局安装会执行 `npm install -g create-yss-spec@latest`
- 项目本地依赖会在对应项目根执行 `npm install create-yss-spec@latest`
- 通过 npx 运行或在源码目录中运行时只报告版本并给出安装建议，不覆盖当前文件
- `--dry-run` 只查询和预览，不安装；`--force` 在已是最新时仍重新安装（npx / 源码目录除外）

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
