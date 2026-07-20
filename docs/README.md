# CLI 研发记录

本目录保存 `create-yss-spec` 的需求、切片和实施记录。相关源码、测试、发布与 Issue 跟踪均由本仓库独立管理。

这些文档从 `iloveZzz/yss-spec-project-template` 迁移而来，保留了拆仓前的历史决策和原 Issue 链接。GitHub 已将原 Issues 转移到本仓库，旧链接会自动重定向。

当前仓库边界以根目录 [README](../README.md) 为准：

- 本仓库负责 CLI 源码、测试、打包、发布和研发记录。
- `iloveZzz/yss-spec-project-template` 负责模板内容、用户手册和使用实践。
- `scripts/sync-template.js` 在测试和发包前从模板仓库同步受管快照。

使用说明见 [create-yss-spec 中文使用手册](user-guide/create-yss-spec-cli-guide.md)。
