# create-yss-spec Ownership Policy v1

## 目标

Ownership Policy 用来回答一个比 include/exclude 更重要的问题：**某个路径由谁负责，CLI 到底有没有权修改它**。

`template.manifest.json` 的 allow/exclude 仍负责模板分发边界；Ownership Policy 负责实例运行时的所有权语义与安全约束。

Contract：`src/contracts/ownership-policy-v1.json`

## 五类 ownership

### managed

模板完全管理的文件。

当前行为：

- 内容与 managed baseline 一致时可自动更新。
- 本地被修改时进入 conflict / skipped。
- `--force` 可覆盖 forceable conflict。

### managed-customizable

模板提供标准基线，但预期项目会进行定制。

v1 为兼容现有行为，暂时仍沿用 managed 的 conflict / `--force` 规则；区别先作为显式语义进入 Plan，为未来三方合并、局部字段合并等能力预留稳定边界。

当前代表路径：

- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- `DESIGN.md`
- `README.md`
- `.mcp.json`

### generated

由 CLI / 模板变量 / 生成器产生的资产。

v1 不自动扩大覆盖权限；本地修改仍遵守现有 baseline 冲突规则。

当前代表路径：

- `yss-project.yaml`
- `skills-lock.json`
- `yss-public-skills.json`
- `.agents/skills/.yss-skills-manifest.json`

### user-owned

用户或业务工程拥有，CLI 永不将其作为普通模板资产写入或覆盖。

当前代表路径：

- `.gitmodules`
- `apps/**`
- `packages/**`
- `wiki/**`
- `docs/reviews/**`
- `docs/.scratch/**`

若 user-owned 路径意外进入 desired operations，Planner 必须把它放入 `unsafe` 并设置 `blocked=true`。

### protected

安全边界。即使 `--force` 也不得覆盖。

当前代表路径：

- `.git/**`
- `.template-source/**`
- `.cursor/environment.json`

动态 gitlink/submodule/detached HEAD 保护仍由 Git Security 层负责；Ownership Policy 不替代动态安全检测。

## Policy 格式

```json
{
  "version": 1,
  "default": "managed",
  "rules": [
    {
      "pattern": "README.md",
      "ownership": "managed-customizable"
    },
    {
      "pattern": "apps/**",
      "ownership": "user-owned"
    },
    {
      "pattern": ".git/**",
      "ownership": "protected"
    }
  ]
}
```

规则按声明顺序匹配，第一个命中的规则生效；无规则命中时使用 `default`。

## Pattern v1

v1 只支持三种模式，以保持实现简单且可审计：

- exact：`README.md`
- 单层：`apps/*`
- 递归前缀：`apps/**`

禁止路径越界和任意位置通配符，例如：

- `../outside`
- `foo/**/bar`
- `foo*bar`

这些配置在加载时 fail closed。

## Runtime 传播

Ownership v1 已传播到：

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
```

Init 没有差异 Planner，因此在实际写入前直接执行 ownership write guard。

人类计划示例：

```text
update: README.md [managed-customizable]
add: scripts/check.sh [managed]
```

JSON 示例：

```json
{
  "action": "update",
  "path": "README.md",
  "ownership": "managed-customizable"
}
```

## 与现有安全层关系

Ownership 与 Git/Path Security 是叠加关系，而不是替代关系：

```text
Ownership Policy
      +
Path containment / symlink guard
      +
Gitlink / submodule / detached HEAD guard
      =
最终写权限
```

任何一层拒绝都必须 fail closed。

## v1 明确不做的事情

为避免同时改变同步语义，v1 不做：

- managed-customizable 自动三方合并
- generated 无条件覆盖
- user-owned 自动迁移
- protected 的 `--force` 例外
- ownership 自动推断

这些能力必须在独立版本中设计和测试。

## 后续演进

推荐顺序：

1. 将 ownership 纳入 metadata baseline 的显式记录。
2. doctor 输出 ownership 分布和 policy drift。
3. managed-customizable 引入 merge strategy。
4. generated 引入 generator/version contract。
5. MCP tools 直接消费 ownership-aware Plan，而不是重新判断写权限。
