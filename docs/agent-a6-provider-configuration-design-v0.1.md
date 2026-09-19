# AI Agent A6.2 Provider 非秘密配置设计 v0.1

日期：2026-09-18
状态：已实现
前置：[A6.1 Provider 基础合同](agent-a6-provider-foundation-design-v0.1.md)

## 1. 这一阶段解决什么

A6.1 让系统知道“什么是 Provider 会话”，A6.2 让用户可以明确选择 Provider 与模型，并让这个选择跨重启保存。

它只保存：

```text
providerId
modelId
```

它不保存 API Key、不表示已经认证、不授予 Capability 权限，也不允许模型自行改选 Provider。

## 2. 三个事实来源

```text
Application Settings
  -> 用户上次选择了什么

Provider Registry
  -> 当前软件真正实现并注册了什么

Provider Session
  -> 当前选择现在是否可用、是否需要认证、是否已就绪
```

这三个来源必须分离。否则常见错误是：把配置中残留的 Provider 当成已安装，把已安装的 Provider 当成已认证，或把
Provider ready 当成模型有权执行工具。

## 3. 为什么能力属于模型

同一个 Provider 可以提供多个模型，而工具调用、流式输出和结构化输出支持可能不同。因此静态目录采用：

```text
ProviderDescriptor
  -> executionLocation
  -> credentialKind
  -> models[]
       -> capabilities
```

Registry 在创建 Session 前必须验证 `modelId` 确实属于该 Provider，不能把模型名称当成任意字符串直接传给远端。

## 4. 为什么保留失效选择

用户升级、卸载插件或 Provider 暂时不可用后，配置中的选择可能不再存在。系统不会静默清空它，而是进入结构化
`unavailable`：

```text
保留 providerId / modelId
明确说明当前不可用
允许用户在设置中改选
禁止启动新的 Agent Run
```

这比自动回退到另一个云端 Provider 更透明，也避免数据在用户不知情时被发送到不同服务。

## 5. 热切换为什么只替换 Provider Session

Provider 或模型发生变化时，`AgentPluginRuntime` 只执行：

```text
unsubscribe old Provider
dispose old Provider
create + subscribe + refresh new Provider
重新聚合 Runtime 状态
```

Recovery Session、恢复项和插件 UI 保持不变。这里把状态机当作局部变化的边界：模型选择变化只影响 Provider 子状态，
不应该重启整个 Agent 系统。

## 6. 设置界面的信息层级

设置中固定展示：

```text
Agent 插件开关
Provider
模型
本机处理 / 远端处理说明
```

生产 Registry 当前为空，因此控件显示但禁用，并明确提示“尚未接入可用 Provider”。没有真实 Adapter 的 Provider
不会以假选项出现。Agent 关闭时仍允许预先配置 Provider；启停和配置是两件不同的事。

## 7. 已验证行为

```text
旧 V1 配置迁移到 providerSelection: null
已有 Agent 启停值在迁移时保留
未知字段和 API Key 字段被严格拒绝
Rust 宿主验证 Provider 与模型标识
无效选择文件被隔离
未知或已移除的 Provider 形成 unavailable 状态
模型必须属于 Provider
切换模型不重建 Recovery Session
浏览器与 Tauri 使用同一配置合同
```

## 8. 下一阶段 A6.3（已完成）

系统凭据存储将加入：

```text
Rust/Tauri 凭据命令边界
操作系统凭据库
credential-present 状态
设置、删除和检测凭据
日志、错误与前端快照不返回秘密
```

完成 A6.3 后，再实现第一个真实 Provider Adapter。这样网络调用不会迫使 API Key 先进入不安全的普通配置。

详见 [A6.3 系统凭据存储设计](agent-a6-system-credential-design-v0.1.md)。
