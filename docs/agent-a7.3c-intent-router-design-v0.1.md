# Agent A7.3c 意图路由设计 v0.1

日期：2026-09-18
状态：已实现

## 目标

把“用户说了什么”与“控制面允许执行什么”分开。意图路由器只负责将自然语言任务归一化为受限的读取意图，不能直接执行 Capability，也不能绕过 Run Policy、Decision Validator 或 Completion Verifier。

## 为什么独立出来

此前 `AgentAssistantSession` 同时承担会话生命周期和关键词判断。能力增加后，这会让会话类持续膨胀，也会把路由优先级隐藏在控制流程中。独立路由器有三个价值：

- 路由规则可以单独测试，避免必须启动完整 Agent Run 才能验证意图映射。
- 路由结果是结构化合同，后续可以加入置信度、澄清问题、用户偏好或模型分类器，而不改变执行层。
- 冲突意图可以在执行前停止。比如“读取标题和声部”不能静默选择其中一个 Capability，也不能让模型误以为一次最小读取已经覆盖了两个域。

## 当前行为

第一版只允许三个读取域：

```text
summary   -> score.read-summary
metadata  -> score.read-metadata
structure -> score.read-structure
```

没有命中明确词时，使用 `summary` 作为兼容性默认值。命中多个读取域时返回澄清结果，不获取 Provider lease，不创建持久化 Run，也不调用 Capability。

## 边界原则

路由器不是安全边界。它提供的是候选任务计划；真正的安全边界仍然是：

```text
Intent Router
  -> Run Policy
  -> Toolset Resolver
  -> Decision Validator
  -> Capability Gateway
  -> Completion Verifier
```

后续增加 `score.read-measure`、`score.read-part` 或分析能力时，先扩展路由合同和评测，再把对应 Capability 加入控制面目录。不要把完整内核对象直接暴露给路由器或模型。
