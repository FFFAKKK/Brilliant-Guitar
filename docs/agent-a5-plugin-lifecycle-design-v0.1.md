# AI Agent A5 插件生命周期设计 v0.1

日期：2026-09-18
状态：用户启停、懒加载、工作台激活过滤与恢复面板生命周期已实现
前置：[A4 恢复协调器](agent-a4-recovery-coordinator-design-v0.1.md)

## 1. 本阶段解决的问题

Agent 模块随应用安装，不代表它应该随应用启动。用户没有开启时，系统必须满足：

```text
不创建 Provider
不扫描恢复记录
不订阅 Agent 状态
不向工作台贡献 Agent View / Command / Component Extension
不接受新的 Agent Run
```

因此插件生命周期不能只用一个 `enabled` 布尔值描述。

## 2. 三个互相独立的概念

```text
installed
  模块和清单属于当前产品版本，宿主可以校验其身份、能力与贡献。

activated
  用户允许插件参与当前工作台组合，View、Command 和扩展才会被解析。

runtime status
  激活后，Provider、恢复流程和执行器目前处于什么事实状态。
```

当前 First-party 插件清单新增：

```text
activation: always | user
```

`always` 插件始终参与工作台组合；`user` 插件只有其 ID 出现在宿主提供的激活集合中才参与组合。
插件不会因为关闭而反复 install/uninstall，所以插件身份、布局位置和所有权校验保持稳定。

## 3. 生命周期状态

```text
disabled
  -> unavailable
  -> configuring
  -> ready
  -> running
  -> recovering
  -> error
```

状态必须由事实决定：

| 状态 | 事实 |
| --- | --- |
| `disabled` | 用户没有激活插件 |
| `unavailable` | 当前宿主或 Provider 明确不可用 |
| `configuring` | 插件已激活，但尚未配置 Provider |
| `ready` | Provider 可用，且没有阻断恢复项 |
| `running` | Controller 正在处理一个 Run，后续阶段接入 |
| `recovering` | 正在扫描恢复记录，或存在需要处理的恢复项 |
| `error` | 恢复或运行时边界返回确定错误 |

`enabled` 不等于 `ready`。用户打开插件后，如果 Provider 尚未配置，界面必须显示 `configuring`，不能伪装成
“Agent 已就绪”。

## 4. 组合根与运行时分工

```text
ApplicationSettings
  -> 保存用户是否开启 Agent

AgentPluginRuntime
  -> 懒创建 Agent 子服务
  -> 聚合 Provider 与 Recovery 状态
  -> 关闭时释放订阅并拒绝新动作

UiPluginHost
  -> 安装并校验所有编译期插件
  -> 根据 activatedPluginIds 解析当前 View / Command / Component Extension

WorkbenchApp
  -> 把设置映射为激活集合
  -> 把 AgentPluginRuntimeSnapshot 投影给 UI
```

`UiPluginHost` 不读取用户设置，`AgentPluginRuntime` 也不操作布局。两者由组合根连接，避免基础设施层互相依赖。

## 5. 启用与关闭流程

启用：

```text
读取 settings.v1.json
  -> agent.enabled = true
  -> 激活 brilliant.agent.assistant 的 UI 贡献
  -> AgentPluginRuntime 懒创建 Recovery Session
  -> 扫描恢复事实
  -> Provider 未配置时进入 configuring
```

关闭：

```text
agent.enabled = false
  -> 从激活集合移除插件 ID
  -> View / Command / Component Extension 从工作台组合消失
  -> 释放 Recovery 订阅
  -> 清空当前进程的 Agent 恢复投影
  -> 回到 disabled
```

关闭不会删除持久化 Run，也不会重写工作区布局。再次开启时，恢复协调器会重新根据持久化事实进行核对。

## 6. 为什么清单和激活集合分开

如果关闭插件等于卸载插件，宿主将失去以下稳定性：

```text
组件和命令所有权无法在启动时统一校验
布局中的组件位置容易被当作未知数据删除
重复启停需要重复注册全局 ID
插件间扩展点的依赖顺序变得不确定
```

保留安装、过滤运行时贡献，可以同时得到：

```text
启动时一次性合同校验
运行时低成本启停
用户布局不丢失
关闭后不运行 Agent 子服务
```

## 7. 配置边界

`settings.v1.json` 当前只保存：

```json
{
  "agent": {
    "enabled": false
  }
}
```

它不保存 API Key，也不把 Provider 是否可用压缩为一个配置值。Provider 配置属于下一阶段的独立合同：

```text
非秘密元数据
  -> Provider ID、模型 ID、端点模式

秘密
  -> 操作系统凭据存储

运行事实
  -> unconfigured / ready / unavailable
```

## 8. 当前验证

自动化测试覆盖：

```text
默认 disabled，不构造 Recovery Session
浏览器宿主启用后结构化 unavailable
桌面宿主首次启用才创建并刷新 Recovery Session
重复启用不重复创建
Provider 未配置进入 configuring
恢复项优先进入 recovering
Provider ready 且恢复清空后才能 canStartRun
关闭后取消订阅，旧 Recovery 发布不能复活插件
user 插件未激活时不贡献 View / Command
旧 V1 设置缺少 agent 字段时迁移为关闭
```

## 9. 下一阶段

A6.1 Provider 基础合同已经实现，详见
[A6.1 Provider 基础合同](agent-a6-provider-foundation-design-v0.1.md)。后续继续：

```text
1. 持久化非秘密 Provider / Model 选择
2. 通过系统凭据存储管理 API Key
3. 接入第一个真实 Provider Adapter
4. 为超时、限流、认证失败和模型不可用建立结构化错误
```

本阶段不发起真实模型请求。先稳定生命周期边界，再接 Provider，可以让网络失败、凭据错误和用户关闭插件
都通过同一个确定性控制面处理。
