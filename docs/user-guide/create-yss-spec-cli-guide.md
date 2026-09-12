# create-yss-spec 使用指南

`create-yss-spec` 初始化、接入和持续同步综合模板实例。实际 npm 版本用 `npm view create-yss-spec version` 查询，当前执行版本用 `create-yss-spec --version` 核对，包内模板身份、来源状态和摘要以 `template.snapshot.json` 为准。CLI 运行时不拉取模板仓库。

## 选择家族

新项目有四条现行路线：

| 职责 | CLI | 身份文件 |
|---|---|---|
| 综合管理与完整生命周期 | `create-yss-spec` | `.yss-template.json` |
| 战略设计与业务方案交接 | `create-yss-harness-design` | `.yss-harness-design.json` |
| 后端设计、实现与 Backend Delivery | `create-yss-harness-backend` | `.yss-harness-backend.json` |
| 前端联合接收、实现与 Frontend Acceptance | `create-yss-harness-frontend` | `.yss-harness-frontend.json` |

旧 `create-yss-harness-dev` 实例只按原固定版本维护。异族、多重身份、损坏 metadata、未知或矛盾 profile 会在写入前拒绝，`--force` 不能绕过；不要删除 metadata 或用另一家族 CLI 接管。

## 初始化与阅读入口

```bash
npm view create-yss-spec version
npx create-yss-spec@latest --version
npx create-yss-spec@latest --help
npx create-yss-spec@latest \
  --project-name "设备借用" \
  --business-domain "内部设备管理" \
  --target-dir ./equipment-project
```

初始化只接受不存在或空目录。完成后核对 `yss-project.yaml` 为 `project-instance`、`.yss-template.json` 中的模板摘要、根 `CONTEXT.md` 和 `docs/process/harness-profile.yaml`，再阅读 `docs/user-guide/用户手册索引.md`。CLI 不创建远程仓、CI、Tracker 或运行时代码工程。

## 接入、同步与诊断

尚未受管的已有项目使用 attach，且必须显式选择预览或写入：

```bash
npx create-yss-spec@latest attach --target-dir . --project-name "设备借用" --business-domain "内部设备管理" --dry-run
npx create-yss-spec@latest attach --target-dir . --project-name "设备借用" --business-domain "内部设备管理" --apply
```

已有本家族实例使用 sync。综合 CLI 的 sync 默认写入，`--dry-run` 与 `--plan` 才是预览：

```bash
npx create-yss-spec@latest diff --target-dir . --json
npx create-yss-spec@latest doctor --target-dir . --json
npx create-yss-spec@latest sync --target-dir . --dry-run
npx create-yss-spec@latest sync --target-dir . --plan
npx create-yss-spec@latest sync --target-dir .
npx create-yss-spec@latest sync --target-dir . --plan --prune
npx create-yss-spec@latest sync --target-dir . --prune
```

普通 sync 保留退出分发文件。显式 `--prune` 只备份并删除内容仍等于可信旧 baseline 的模板文件；人工修改过的旧副本、用户文件和证据不足的文件继续保留并报告。README 初始化后由项目维护，attach、sync、force 和 doctor 都不创建、覆盖或校验它；根 `CONTEXT.md`、批准记录和业务材料也不能被越权接管。

同步只更新满足当前 ownership 与 merge policy 的受管文件。`replace-with-force` 冲突需要显式 `--force`，`manual`、`user-owned`、`protected`、gitlink、路径越界和中间 symlink 均不能被 force 绕过。生成型 `skills-lock.json` 在同一事务内刷新；校验失败会回滚文件和 metadata。成功同步的反向恢复使用升级前 Git 基线或事务备份，综合 CLI 没有独立 `recover` 命令。

## 更新程序

```bash
npx create-yss-spec update --dry-run
npx create-yss-spec upgrade
```

update/upgrade 只更新 CLI 程序，不同步实例。npx、源码、全局或项目安装方式按命令输出的指引处理，不自动降级。

## 本地候选与固定交付

在 CLI 仓库中使用明确模板源生成快照；生成文件只能由同步脚本维护：

```bash
YSS_SPEC_TEMPLATE_REPO=/absolute/path/to/yss-spec-project-template \
YSS_SPEC_TEMPLATE_REF=WORKTREE \
pnpm run sync-template

npm pack --ignore-scripts --pack-destination /absolute/path/to/output
```

`WORKTREE` 快照用于 implementation-ready 验收，`template.snapshot.json` 会记录 `sourceState: working-tree`。候选或发布必须改用完整 40 位提交，重新运行同步并验证实际 tgz。`--ignore-scripts` 只用于已显式重建并检查快照的包，不代表 npm 发布。

从实际 tgz 初始化临时目录后，检查新的精简手册集合、本地链接、身份文件、模板摘要和适用交付链路。模板交付、CLI Git 交付与 npm publish 是三个独立边界；历史测试和旧快照不能作为当前证据。

## 常见失败

| 现象 | 处理 |
|---|---|
| 新建目标非空 | 新项目换空目录；已有项目按 attach 或 sync 处理 |
| 异族或矛盾身份 | 核对 CLI、profile 和 metadata，保留原目录，不能 force 绕过 |
| 受管冲突 | 比较 baseline 与本地修改，决定保留、人工合并或备份后覆盖 |
| gitlink、symlink 或路径越界 | 修复挂载和路径状态，不能复制源码冒充普通目录 |
| 校验失败 | 查看事务回滚和旧 metadata，修复原因后重新预览 |
| npm 手册与源码不同 | 比对 `npm view`、`--version` 和包内 `template.snapshot.json` |

综合模板的职责、提示词、用户决定和贯穿案例见模板根 `docs/user-guide/用户手册索引.md`；CLI 参数以当前安装版本的 `--help` 为准。
