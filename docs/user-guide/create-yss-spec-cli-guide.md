# create-yss-spec 使用手册

本文档面向需要初始化、接管已有项目或持续同步 `yss-spec-project-template` 研发管理资产的内部开发者、Tech Lead、项目初始化负责人。

## 适用场景

当你需要基于 [YSS Spec Project Template](https://github.com/iloveZzz/yss-spec-project-template) 快速生成一个新的研发管理仓库时，使用 `create-yss-spec`。

它适合做的事：

- 初始化新的 Spec / 架构 / OpenAPI / Ticket 管理仓库
- 统一生成项目级文档骨架、Agent 协作约定和模板目录结构
- 通过参数渲染项目名称、业务领域、团队规模等元信息
- 在已有项目中只补齐 manifest 声明的研发管理资产
- 基于 CLI 包内置的固定模板 commit 持续同步受管资产

它不负责做的事：

- 生成前端 / 后端运行时代码工程
- 自动安装依赖
- 自动创建远端 Git 仓库、CI 或 Issue Board
- 自动修改前后端运行时代码、业务目录、用户文件或 `.git`
- 自动解决本地已修改受管文件的冲突

## 快速开始

推荐入口：

```bash
npm create yss-spec@latest
```

兼容入口：

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

运行后会按顺序询问：

1. `项目名称`
2. `业务领域`
3. `团队规模（可留空）`
4. `目标目录`

初始化完成后，CLI 会输出结果目录和下一步建议。

## 最常见用法

### 交互式初始化

```bash
npm create yss-spec@latest
```

适合第一次使用或希望手动确认输入内容的场景。

### 指定参数直接生成

```bash
npx create-yss-spec@latest \
  --project-name "Acme Spec Repo" \
  --business-domain "Investment Research" \
  --team-size "12" \
  --target-dir "./acme-spec-repo" \
  --issue-tracker github \
  --git-init
```

适合脚本化、重复初始化或在 CI / shell 脚本中调用的场景。

### 只预览，不真正写入

```bash
npx create-yss-spec@latest \
  --project-name "Preview Repo" \
  --business-domain "Data Platform" \
  --target-dir "./preview-repo" \
  --dry-run
```

`--dry-run` 只展示计划，不会创建目录，也不会删除已有文件。

### 接管已有项目

在已有项目根目录执行 `attach`。它不会触碰运行时代码和 `.git`，但会检查并补齐根规则、`docs/`、skills、投影、校验脚本和模板 metadata：

```bash
npx create-yss-spec@latest attach \
  --target-dir . \
  --project-name "Acme Application" \
  --business-domain "Data Platform" \
  --dry-run
```

确认 dry-run 计划后才写入：

```bash
npx create-yss-spec@latest attach \
  --target-dir . \
  --project-name "Acme Application" \
  --business-domain "Data Platform" \
  --apply [--force]
```

`attach` 必须显式选择 `--dry-run` 或 `--apply`，两者互斥。已有 `.yss-template.json` 的项目不能重复 attach，应改用 `sync`。`--force` 只用于覆盖受管冲突文件；unsafe 路径和迁移冲突始终阻断。发生覆盖时，CLI 会在目标目录外保留备份，并输出恢复目录和清理命令。

### 同步已有模板实例仓库

```bash
npx create-yss-spec@latest sync
```

适合已经由 `create-yss-spec` 初始化过、并且根目录带有 `.yss-template.json` 的模板实例仓库。

### 只预演同步，不真正写入

```bash
npx create-yss-spec@latest sync --dry-run
```

适合在升级前先查看版本变化、Spec / Ticket 旧路径迁移、将要更新的文件、将被跳过的本地改动文件，以及模板已删除但不会自动删除的文件。

同步使用当前 CLI 包内置的模板快照；“最新”由 `npx create-yss-spec@latest` 的发布版本决定，运行时不会直接拉取模板仓库。普通同步只更新 baseline 未被本地修改的文件，`--force` 才覆盖受管冲突文件：

```bash
npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir . [--force]
```

## 参数说明

| 参数 | 含义 | 默认行为 |
|---|---|---|
| `--project-name` | 项目名称 | 不传则进入交互输入 |
| `--business-domain` | 业务领域 | 不传则进入交互输入 |
| `--team-size` | 团队规模 | 不传则进入交互输入，可留空 |
| `--target-dir` | 输出目录 | 不传则进入交互输入 |
| `--issue-tracker github\|gitlab` | 默认 issue tracker 偏好 | 默认 `github` |
| `--dry-run` | 只预览复制、接管或同步计划，不写入文件 | 默认关闭 |
| `--apply` | `attach` 确认执行写入；不能与 `--dry-run` 同时使用 | 默认关闭 |
| `--force` | 初始化时允许清空非空目录；`attach` / `sync` 时允许覆盖受管冲突文件 | 默认关闭 |
| `--git-init` | 初始化完成后执行 `git init` | 默认关闭 |
| `--include-example-docs` | 显式保留示例文档 | 默认开启 |
| `--no-example-docs` | 不生成示例文档 | 默认关闭 |
| `-h`, `--help`, `-help` | 显示用法、命令、参数、样例和文档入口 | 立即退出，不执行写入 |
| `-v`, `--version`, `-version` | 显示 CLI 版本 | 立即退出，不执行写入 |

`sync` 子命令当前只支持：

- 在模板实例仓库根目录执行
- 仓库内已存在 `.yss-template.json`
- 以当前 npm 已发布包内置、绑定 40 位 `templateCommit` 的模板快照作为同步源

## 输出内容说明

CLI 会根据模板清单把源仓库内容分成三类处理：

- `render`：需要写入实例身份或项目变量的文件，例如 `yss-project.yaml`、`AGENTS.md`、`README.md`
- `copy`：原样复制的模板资产
- `exclude`：不会进入实例仓库的维护性文件、本地配置和本需求自身的实现资产

生成结果通常包含：

- `AGENTS.md`
- `CONTEXT.md`
- `yss-project.yaml`，固定写入 `schema_version: 1` 与 `repository_mode: project-instance`
- `docs/requirements/`
- `docs/architecture/`
- `docs/api/`
- `docs/design/`
- `docs/testing/`
- 项目级 Agent skills 与流程文档

初始化会明确排除模板源专属资产：`.gitignore`、`.nvmrc`、`scripts/`、`wiki/`、`.github/`、`.template-source/`、`.cursor/environment.json` 和 `yss-public-skills.json`。只同步必要文档目录、Spec / Ticket 规范和 Agent skills；模板仓库自己的治理笔记与源仓工具链不会进入项目实例。`attach` 仍可为已有项目补齐受管校验脚本和 `yss-public-skills.json`（`verify-template` 门禁需要），但同样不会带上源仓 CI 与 Cloud 环境。

如果启用了 `--git-init`，目标目录下还会生成 `.git/`。

初始化完成后，CLI 还会额外生成：

- `.yss-template.json`

这个文件用于记录 metadata schema、模板名称、CLI 版本、模板来源、不可变 `templateCommit`、manifest hash、最近同步时间、受管模板文件 baseline 和关键渲染变量。后续 `sync` 能否安全工作，依赖这份模板元数据。

## 默认安全策略

为了避免误覆盖，CLI 采用默认安全策略：

- 目标目录非空时，默认直接失败
- 只有显式传入 `--force` 时，才允许清空目标目录后重新生成
- 目标目录不能位于模板源仓库内部
- `--dry-run` 没有副作用
- `attach` 和 `sync` apply 前会把将被覆盖的文件备份到目标目录外；成功后默认保留备份，失败会用操作日志回滚
- Git worktree 有脏改动时只提醒，不自动 stash 或提交
- `.gitmodules`、gitlink 挂载点和 `apps/` 下已检出的实现仓工作树是用户资产；空 gitlink、uninitialized、detached HEAD 一律阻断，`--force` 不能覆盖挂载点
- CLI 不创建 git submodule，也不把 CLI 仓库自己的 git root 当成输出目录的 git root

对于 `sync`，默认安全策略还包括：

- 当前目录缺少 `.yss-template.json` 时，直接拒绝同步
- `yss-project.yaml` schema、字段或模式非法时，在写入前拒绝同步
- 将 `prd-template.md`、`vertical-slice-issue-template.md`、`docs/requirements/issues/` 和 `*-prd.md` 迁移到对应 Spec / Ticket 路径
- 删除各 Agent root 下的 `to-prd`、`to-issues` 旧 skill，不创建兼容别名
- 旧、新迁移目标同时存在且内容不一致时，输出冲突清单并停止，不执行部分写入
- 只自动更新未被本地修改的受管模板文件
- 本地已修改的受管文件会被跳过并报告
- 模板新版本已删除的受管文件只报告，不自动删除

## 示例结果

一次典型执行完成后，你会看到类似输出：

```text
初始化完成
输出目录：/path/to/your-project
下一步建议：
1. cd /path/to/your-project
2. 如需版本管理，可执行 git init
3. 检查 AGENTS.md、README 和 docs 目录是否符合预期
```

如果已经传了 `--git-init`，第二步会提示执行 `git status` 检查初始化结果。

一次典型同步完成后，你会看到类似输出：

```text
同步完成
模板版本：0.9.0 -> 1.0.0
自动更新：2
新增文件：1
跳过文件：1
删除差异：1
本地已修改，已跳过：
- README.md: 检测到本地已修改的受管文件
模板已移除但未自动删除：
- docs/legacy-note.md
下一步建议：
1. 运行 git diff 或 git status 检查同步结果
2. 人工处理被跳过文件和删除差异（如有）
3. 确认无误后提交本次模板同步结果
```

## 常见问题

### 1. 提示“目标目录非空，当前主路径不支持覆盖已有内容”

说明目标目录里已经有文件。

处理方式：

- 改用新的空目录
- 或确认可以清空后，显式传入 `--force`

### 2. 提示“目标目录不能位于模板源仓库内部”

说明你把输出目录设到了当前模板仓库内部。这样会污染模板源仓库，CLI 会直接拒绝。

处理方式：

- 把 `--target-dir` 改成模板仓库外部目录

### 3. 我想在 shell 管道或脚本里调用

可以，CLI 已支持非 TTY 输入。建议优先显式传参；如果要走标准输入，请按交互顺序提供：

```bash
printf 'Acme Spec Repo\nInvestment Research\n12\n/tmp/acme-spec-repo\n' \
  | node bin/create-yss-spec.js
```

### 4. 为什么没有自动安装依赖或创建远端仓库

这是设计上的非目标范围。当前 CLI 只负责初始化研发管理模板实例仓库，组织级权限操作和后续 bootstrap 仍由人工控制。

### 5. 为什么 `attach` 提示已有模板元数据

说明当前项目已经被接管或初始化过。`attach` 不会重复建立 baseline；请使用：

```bash
npx create-yss-spec@latest sync --target-dir . --dry-run
```

### 6. 为什么 `sync` 提示缺少模板元数据

说明当前目录不是受支持的模板实例仓库，或者它是一个早期初始化的历史项目，还没有 `.yss-template.json` 基线。

处理方式：

- 先确认当前目录是否真的是由 `create-yss-spec` 初始化出来的项目
- 当前版本的 `sync` 只支持带模板元数据的项目
- 没有 metadata 的历史项目先使用 `attach --dry-run`，确认无 unsafe / conflict 后再 `attach --apply`

### 7. 为什么 `sync` 没有覆盖我改过的文件

这是刻意的默认安全策略。CLI 会把这类文件识别为“本地已修改的受管文件”，只报告、跳过，不自动覆盖。

处理方式：

- 查看输出中的跳过文件列表
- 用 `git diff` 比较当前项目版本和模板版本的差异
- 人工决定是否合并模板变更
- 确认模板内容应覆盖本地版本时，使用 `sync --force`；CLI 会先保存外部备份

### 8. 为什么 `sync` 报告旧、新资产冲突

说明旧版 PRD / Issue 路径与新版 Spec / Ticket 路径同时存在，且文件内容不一致。CLI 会 fail closed，避免覆盖任一版本。

处理方式：

- 根据错误中的旧、新路径比较内容
- 人工合并并只保留目标 Spec / Ticket 路径
- 重新执行 `sync --dry-run`，确认迁移计划后再正式同步

## 维护与验证

如果你在维护这个 CLI，本地验证命令是：

```bash
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test
YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm pack --dry-run
```

## 继续阅读

- [模板仓库使用说明](https://github.com/iloveZzz/yss-spec-project-template#readme)
- [产品全生命周期使用手册](https://github.com/iloveZzz/yss-spec-project-template/blob/main/docs/user-guide/product-lifecycle-workflow.md)
- [产品研发全生命周期最佳实践](https://github.com/iloveZzz/yss-spec-project-template/blob/main/docs/user-guide/product-rd-lifecycle-best-practices.md)
- [实现路由记录](../implementation/yss-spec-cli-init-routing.md)
- [`yss-project.yaml` 跨仓库实现记录](../implementation/yss-project-repository-mode-contract.md)
- [产品需求文档：yss-spec 模板初始化 CLI](../requirements/yss-spec-cli-init-prd.md)
