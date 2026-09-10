# 生成器维护身份核对

日期：2026-09-10。用户已在实施计划中确认五个生成器属于本次分发范围，并要求补齐旧生成器身份。

核对根 README、package.json 和 scripts/sync-template：本仓生成固定流程模板快照，未承载产品业务资产。原先缺少根 yss-project.yaml，本轮明确补为 schema_version 1 / template-source。 原先缺少根 CONTEXT.md，本轮补充工具链维护上下文，不导入上游产品词汇。

后续只通过同步脚本生成包内模板，运行原有初始化及同步测试；不直接修改 template/ 或 vendor/。Git 提交、推送与发布仍按本轮授权边界处理。
