# create-yss-spec 使用指南

源码候选版本：`3.1.2`。模板固定到 `017925706a981aec9eadefd470232bb531acd4d6`；最终快照身份与摘要见 `template.snapshot.json`。本次更新用户手册、五家族导航和设备借用教学案例，命令行为沿用既有身份保护。

## 已发布安装与候选版本

截至本轮核验，npm latest 为 `3.1.0`；源码候选尚未发布 npm。后续请自行查询实际发布状态：

```bash
npm view create-yss-spec version
npm create yss-spec@latest
```

`@latest` 获取已发布包，不保证包含 GitHub 最新手册。每次初始化使用包内固定模板，不会在运行时拉取模板仓。

## 首次初始化

```bash
npx create-yss-spec@latest --project-name "设备借用" --business-domain "内部设备管理" --target-dir ./equipment-project
```

生成后进入实例，核对 yss-project.yaml 为 project-instance、家族 metadata 的 templateCommit，然后阅读 docs/user-guide/用户手册索引.md。先让 Agent 只读检查身份、根 CONTEXT.md、profile 和当前上游，再按本仓流程推进。CLI 不创建远程仓、CI、Tracker 或运行时代码工程。

## 家族与覆盖边界

五家族分别使用 .yss-template.json、.yss-harness-design.json、.yss-harness-dev.json、.yss-harness-backend.json、.yss-harness-frontend.json。已有 profile 同样参与判定。

异族、多重身份、损坏 metadata、未知/矛盾 profile 在写入前拒绝。`--force` 不能绕过，`--dry-run` 使用同一检查。不要删除 metadata 或用另一家族 CLI 覆盖。后端/前端专职只提供仓内 `node scripts/instantiate-harness --target <新目录>`，没有专用 npm 包、attach/sync 或原地迁移。

## 已有项目与同族升级

attach 用于尚未由本 CLI 管理的项目，必须选择预览或 apply；存在本族 metadata 时改用 sync。先保存 Git 基线，按场景选择命令，不连续盲目执行：

```bash
npx create-yss-spec@latest attach --target-dir . --project-name "设备借用" --business-domain "内部设备管理" --dry-run
npx create-yss-spec@latest attach --target-dir . --project-name "设备借用" --business-domain "内部设备管理" --apply
npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir .
```

普通 sync 更新未被用户修改的 baseline，保留用户冲突并报告删除项；force 仅在身份和路径安全检查通过后处理受管冲突。校验失败事务回滚并保留旧 metadata。成功后的撤销用升级前 Git 基线或备份，不用旧 CLI 强制反向同步。运行时代码、Git 与挂载点按现有保护语义处理。

## 更新 CLI 程序

```bash
npx create-yss-spec update --dry-run
npx create-yss-spec upgrade
```

update/upgrade 只处理 CLI 程序，不同步实例资产；源码目录和 npx 环境按工具给出的安全提示操作，全局/项目安装按安装位置升级。

## 使用尚未发布的候选手册

从本 CLI 仓库检出需要的固定提交。先读取 scripts/sync-template.js 的 DEFAULT_TEMPLATE_REF，将下列 `<模板完整SHA>` 替换为该值；在 CLI 仓库根运行。模板源地址须保持本家族。

```bash
YSS_SPEC_TEMPLATE_REPO=https://github.com/iloveZzz/yss-spec-project-template.git YSS_SPEC_TEMPLATE_REF=<模板完整SHA> pnpm run sync-template
npm pack --ignore-scripts
```

`--ignore-scripts` 仅在上一步已成功产生并核对固定快照后使用，以免 prepack 改写输入。检查 tgz 中 template.snapshot.json 的模板 SHA 和 package.json 版本，然后使用实际包路径初始化：

```bash
npx --yes --package /absolute/path/create-yss-spec-3.1.2.tgz create-yss-spec --project-name "设备借用" --business-domain "内部设备管理" --target-dir ./equipment-candidate
```

这是安装本地已构建包的示例，不是 npm 发布操作。候选验证需覆盖新建实例的本地文档链接、身份、Skill 检查与适用交接链路；不要把历史验证日志当当前发布证据。

## 详细手册与维护

[模板使用指南](https://github.com/iloveZzz/yss-spec-project-template/blob/main/docs/user-guide/用户手册索引.md)介绍职责、提示词、确认和案例。问题涉及参数/同步/包分发时在本 CLI 跟踪；涉及模板内容或生命周期时在模板源跟踪。

开发验证优先 `pnpm exec node --test tests/*.test.js`；需要重建快照时显式运行上面的固定输入 sync-template。模板先验证并提交，再绑定其 SHA、测试实际 tgz，最后交付 CLI 和父仓 gitlink。npm 发布须另外获得授权。

## 命令速查与失败处理

运行 `npx create-yss-spec@latest --help` 查询当前安装版本实际支持的参数；帮助/版本查询不受目标家族限制。`--git-init` 仅按初始化选项创建本地 Git，不等于提交或推送。

| 现象 | 处理 |
|---|---|
| 目标非空 | 新建用新目录；已有项目按 attach 或 sync 场景处理 |
| 异族或矛盾身份 | 核对包名、目标 profile 和 metadata，保留原文件，不能 force 绕过 |
| conflict | 比较 baseline 与用户改动，决定保留、合并或有备份后覆盖 |
| unsafe/gitlink 阻断 | 修复路径/挂载状态，不复制源码冒充普通目录 |
| 校验失败 | 检查回滚输出及旧 metadata，修复原因后重试 |
| 最新手册缺失 | 比对 npm 版本和模板 SHA，等待发布或核验本地候选 tgz |
