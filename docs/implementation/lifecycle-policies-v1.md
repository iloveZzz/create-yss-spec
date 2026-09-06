# create-yss-spec Lifecycle Policies v1

## 目标

Ownership Policy 回答“CLI 有没有权修改某个路径”；Lifecycle Policy 进一步回答：

1. `managed-customizable` 文件发生本地修改时，CLI 应如何处理？
2. `generated` 文件由哪个生成器产生，生成器 contract 的版本是什么？

v1 仍坚持 fail-closed、可审计、兼容优先，不引入隐式自动合并。

## Customization Policy v1

Contract：`src/contracts/customization-policy-v1.json`

Manifest：`template.manifest.json -> customizationPolicy`

支持两种策略：

### replace-with-force

保持原有 CLI 行为：

- 本地修改进入 conflict / skipped。
- 默认不覆盖。
- `--force` 可覆盖。
- Plan 中：`forceable=true`，`mergeStrategy=replace-with-force`。

当前默认策略为 `replace-with-force`，用于保持兼容。

### manual

用于不应由 CLI 自动覆盖的高价值可定制文件：

- 本地修改进入 conflict / skipped。
- `--force` 也不能覆盖。
- Plan 中：`forceable=false`，`mergeStrategy=manual`。
- 用户必须人工合并后再次执行 sync/attach。

当前首批 manual 路径：

- `CONTEXT.md`
- `DESIGN.md`

这两个文件承载项目上下文与设计决策，自动覆盖风险高于收益。

## 为什么 v1 不直接做 three-way merge

自动三方合并至少需要稳定保存：

- base：上一次模板基线内容；
- local：当前项目内容；
- desired：新模板内容；
- 文件类型/结构化格式对应的 merge engine；
- 冲突块的机器可读表示。

当前 metadata 只持久化 content hash，并未保存完整 base 内容。因此 v1 不伪装成 three-way merge。未来如引入 `three-way-text`，必须设计独立 contract 和 conflict artifact。

## Generator Policy v1

Contract：`src/contracts/generator-policy-v1.json`

Manifest：`template.manifest.json -> generatorPolicy`

每个 generated 资产绑定：

```json
{
  "pattern": "yss-project.yaml",
  "generatorId": "repository-identity",
  "generatorVersion": 1
}
```

当前 generator：

- `yss-project.yaml` -> `repository-identity@1`
- `skills-lock.json` -> `skills-lock@1`
- `yss-public-skills.json` -> `public-skills@1`
- `.agents/skills/.yss-skills-manifest.json` -> `skills-manifest@1`

## Generator v1 的行为边界

v1 的 generator contract 是**身份与版本合同**，不是扩大写权限：

- generated 文件仍参与 managed baseline。
- 本地修改仍进入现有 conflict 逻辑。
- `--force` 行为与 v1 之前兼容。
- Plan 输出 `generatorId/generatorVersion`。
- metadata baseline 同样保存 `generatorId/generatorVersion`。

未来 generatorVersion 升级可供 doctor、CI、Agent 判断是否需要专门 migration，而不依赖文件名猜测。

## Metadata baseline

CLI 写 `.yss-template.json` 时持久化：

```json
{
  "customizationPolicyVersion": 1,
  "customizationPolicyHash": "...",
  "generatorPolicyVersion": 1,
  "generatorPolicyHash": "...",
  "managedFiles": {
    "CONTEXT.md": {
      "ownership": "managed-customizable",
      "mergeStrategy": "manual"
    },
    "yss-project.yaml": {
      "ownership": "generated",
      "generatorId": "repository-identity",
      "generatorVersion": 1
    }
  }
}
```

旧实例缺少这些字段仍可加载；下一次 attach/sync 自动补齐。

## Doctor drift

Doctor 增加两个 check：

- `customization-policy`
- `generator-policy`

状态均为：

- `matched` -> ok
- `missing` -> warning
- `drift` -> warning

Policy drift 本身不自动修改项目。真正写入仍需显式 sync/attach 流程。

## Plan contract

Plan Schema v1 新增可选字段：

- `mergeStrategy`
- `generatorId`
- `generatorVersion`

例如：

```json
{
  "path": "CONTEXT.md",
  "ownership": "managed-customizable",
  "mergeStrategy": "manual",
  "forceable": false
}
```

```json
{
  "path": "yss-project.yaml",
  "ownership": "generated",
  "generatorId": "repository-identity",
  "generatorVersion": 1
}
```

## 下一步

在进入 MCP 之前，建议继续完成：

1. stable programmatic API，直接返回 Plan / Doctor Report / Error Envelope。
2. 如需真正自动合并，再设计 three-way merge contract 与 base artifact。
3. generator version migration registry。
4. 最后 MCP 只作为 programmatic API 的薄适配层。
