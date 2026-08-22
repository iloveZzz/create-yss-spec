# create-yss-spec

`create-yss-spec` 是一个纯 Node.js 的 npm CLI，用于初始化 / 接管 / 同步 `yss-spec-project-template` 研发管理资产。项目本身没有运行时 npm 依赖（仅使用 Node 内置模块），因此没有 `package-lock.json`。

## Cursor Cloud specific instructions

面向后续 Cloud Agent 的启动/运行注意事项（依赖安装由 update script 完成，这里不重复）：

- 运行时组件：这是一个 CLI（无长驻服务）。入口为 `bin/create-yss-spec.js`，核心逻辑在 `src/cli.js`。子命令：默认初始化、`attach`、`sync`（用法见 `README.md` 与 `node bin/create-yss-spec.js --help`）。
- 模板快照是生成物，不入库：`template/`、`template.snapshot.json` 被 `.gitignore` 忽略，由 `npm run sync-template` 从 `github:iloveZzz/yss-spec-project-template`（`scripts/sync-template.js` 中 pin 的 commit）克隆生成。**直接运行 CLI 前必须先存在 `template/`**；update script 已执行 `sync-template` 生成它。若快照丢失或需刷新，重跑 `npm run sync-template`（需要访问 GitHub）。
- 测试：`npm test`。注意 `pretest` 会先跑 `sync-template`，所以测试会自动重新拉取并覆盖 `template/`（需要 GitHub 网络）。测试用 `node --test tests/*.test.js`，单测用临时目录 + 本地 git fixture，不影响仓库。
- 隐藏的 Python 依赖：模板里的 `scripts/verify-template`（经 `node-verify-lifecycle-registry.mjs` 等）会调用 `python3 -c ... from jsonschema import Draft202012Validator` 做 JSON Schema 校验。缺少 Python `jsonschema` 时，`init-cli.test.js` 中触发 `verify-template` 的 5 个用例会失败并报 `ModuleNotFoundError: No module named 'jsonschema'`。update script 已安装 `jsonschema`（`pip3 --break-system-packages`）。其余校验脚本只用 Python 标准库。
- 没有 lint 脚本：`package.json` 未定义 lint / build（`build` 概念即 `sync-template` 生成模板快照 + `npm pack`）。发布用 `prepack` → `sync-template`。
- 发布/固定模板版本：正式流程用 `YSS_SPEC_TEMPLATE_REF=<pinned-commit> npm test` / `npm pack`，可用 `YSS_SPEC_TEMPLATE_REPO` / `YSS_SPEC_TEMPLATE_REF` 覆盖模板来源。
