# create-yss-spec

用于初始化和同步 `yss-spec-project-template` 模板实例仓库的 npm CLI。

## 用法

```bash
npm create yss-spec@latest
```

也可以使用 `npx`：

```bash
npx create-yss-spec@latest
```

## 当前支持

- 交互式收集 `projectName`、`businessDomain`、`targetDir`
- `--team-size`
- `--dry-run`
- 非空目录默认拒绝，`--force` 覆盖
- `--git-init`
- `--issue-tracker github|gitlab`
- `--include-example-docs`
- `--no-example-docs`
- `sync` 子命令
- 基于 `.yss-template.json` 的模板版本基线
- 已有模板实例仓库的受管模板资产同步
- 初始化时将 `yss-project.yaml` 从 `template-source` 改写为 `project-instance`
- 升级时迁移 Spec / Ticket 路径并删除 `to-prd`、`to-issues` 旧 skill
- 旧、新资产内容冲突或清单 schema / mode 非法时 fail closed
- 保留模板的共享 skill 投影；生成实例可在尚未 `git init` 时运行模板校验

## 同步已有模板实例仓库

当项目仓库已经由 `create-yss-spec` 初始化，并且根目录存在 `.yss-template.json` 时，可以执行：

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
- 对模板已删除文件只报告，不自动删除
- 对已知的 Spec / Ticket 旧路径执行一次性迁移
- 迁移目标已存在且内容不一致时停止，不静默覆盖

## 开发验证

CLI 源码和研发记录由本仓库独立维护。首次测试会从
[`iloveZzz/yss-spec-project-template`](https://github.com/iloveZzz/yss-spec-project-template)
同步受管模板快照：

```bash
npm test
```

发布前可检查打包结果：

```bash
npm pack --dry-run
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
