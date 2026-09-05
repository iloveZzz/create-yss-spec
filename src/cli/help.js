"use strict";

function versionText(version) {
  return `create-yss-spec ${version}`;
}

function helpText(version) {
  return `create-yss-spec ${version}

USAGE
  $ create-yss-spec [COMMAND] [OPTIONS]

COMMANDS
  (default)  初始化新的模板实例仓库
  attach     向已有项目补齐受管研发管理资产
  sync       同步已有模板实例的受管资产
  update     检查 npm 最新版本，如有更新则安装
  upgrade    update 的别名

OPTIONS
  --project-name <name>              项目名称；init 不传则进入交互输入
  --business-domain <domain>         业务领域；init 不传则进入交互输入
  --team-size <size>                 团队规模；init 不传则可留空，默认「待补充」
  --target-dir <dir>                 目标目录；init 不传则进入交互输入，sync 默认为当前目录
  --issue-tracker github|gitlab      默认 issue tracker 偏好（默认 github）
  --dry-run                          只预览计划，不写入文件；update 只查询不安装
  --apply                            attach 确认执行写入；不能与 --dry-run 同时使用
  --force                            init：允许清空非空目录后重新生成
                                     attach / sync：覆盖受管冲突文件；unsafe 路径始终阻断
                                     update：即使已是最新也重新安装；npx / 源码目录仍不覆盖
  --git-init                         初始化完成后执行 git init
  --include-example-docs             显式保留示例文档（默认开启）
  --no-example-docs                  不生成示例文档
  -h, --help                         显示本帮助信息
  -v, --version                      显示 CLI 版本

EXAMPLES
  $ npm create yss-spec@latest
  $ npx create-yss-spec@latest --help
  $ npx create-yss-spec@latest --version
  $ npx create-yss-spec@latest \\
      --project-name "Acme Spec Repo" \\
      --business-domain "Investment Research" \\
      --team-size "12" \\
      --target-dir "./acme-spec-repo" \\
      --issue-tracker github \\
      --git-init
  $ npx create-yss-spec@latest \\
      --project-name "Preview Repo" \\
      --business-domain "Data Platform" \\
      --target-dir "./preview-repo" \\
      --dry-run
  $ npx create-yss-spec@latest attach \\
      --target-dir . \\
      --project-name "Acme Application" \\
      --business-domain "Data Platform" \\
      --dry-run
  $ npx create-yss-spec@latest attach \\
      --target-dir . \\
      --project-name "Acme Application" \\
      --business-domain "Data Platform" \\
      --apply
  $ npx create-yss-spec@latest sync
  $ npx create-yss-spec@latest sync --dry-run
  $ npx create-yss-spec@latest sync --target-dir . --force
  $ npx create-yss-spec update
  $ npx create-yss-spec update --dry-run
  $ npx create-yss-spec upgrade

LEARN MORE
  仓库 README：https://github.com/iloveZzz/create-yss-spec#readme
  使用手册：https://github.com/iloveZzz/create-yss-spec/blob/main/docs/user-guide/create-yss-spec-cli-guide.md
  模板仓库：https://github.com/iloveZzz/yss-spec-project-template
`;
}

function printVersion(version, stdout = process.stdout) {
  stdout.write(`${versionText(version)}\n`);
}

function printHelp(version, stdout = process.stdout) {
  stdout.write(`${helpText(version)}\n`);
}

module.exports = {
  versionText,
  helpText,
  printVersion,
  printHelp,
};
