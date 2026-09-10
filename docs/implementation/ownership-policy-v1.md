# create-yss-spec Ownership Policy v1

## 目标

Ownership Policy 回答：某个路径由谁负责，CLI / Programmatic API 到底有没有权修改它。

`template.manifest.json` 的 allow/exclude 负责模板分发边界；Ownership Policy 负责实例运行时所有权和安全约束。

Contract：`src/contracts/ownership-policy-v1.json`

## 五类 ownership

### managed

模板完全管理。未修改时可自动同步；本地修改按普通 conflict 处理。

### managed-customizable

模板提供基线，但允许项目定制。具体冲突策略由 Customization Policy 决定。

### generated

由生成器产生。Generator Policy 提供 `generatorId + generatorVersion`。

### user-owned

用户/业务工程拥有。CLI 和 Programmatic API 永不作为普通模板资产写入或覆盖。

### protected

安全边界。即使 `--force` 或 API `force:true` 也不得覆盖。

## Policy 格式

```json
{
  "version": 1,
  "default": "managed",
  "rules": [
    { "pattern": "README.md", "ownership": "user-owned" },
    { "pattern": ".gitignore", "ownership": "managed-customizable" },
    { "pattern": "apps/**", "ownership": "user-owned" },
    { "pattern": ".git/**", "ownership": "protected" }
  ]
}
```

规则按声明顺序匹配，第一个命中生效。

v1 pattern 支持 exact、`/*`、`/**`，路径越界或非法通配符 fail closed。

## Runtime 传播

```text
template.manifest.json
        ↓
ownership-runtime
        ↓
desired operations
        ↓
Sync / Attach Planner
        ↓
Plan Schema v1
        ↓
CLI / Programmatic API
```

Init 在实际写入前直接执行 ownership guard。

README 是 init 的一次性生成种子，写入后立即归项目所有且不进入受管 baseline。`.gitignore` 仅管理标记区，项目内容保留在标记外。

## Metadata baseline

实例 metadata 持久化：

- ownershipPolicyVersion
- ownershipPolicyHash
- managedFiles[path].ownership

旧实例缺失 baseline 仍可读取，下一次同步自动补齐；doctor 报告 missing/drift/matched。

## 与安全层关系

```text
Ownership Policy
      +
Customization / Generator Policy
      +
Path containment / symlink guard
      +
Gitlink / submodule / detached HEAD guard
      =
最终写权限
```

任何一层拒绝都必须 fail closed。

## Programmatic API

`templatePlan()` 返回 ownership-aware Plan；`templateApply()` 与 CLI 使用相同 ownership guard。

`force:true` 不得绕过 user-owned/protected。

未来 MCP 只能薄映射 Programmatic API，不得重新判断 ownership。
