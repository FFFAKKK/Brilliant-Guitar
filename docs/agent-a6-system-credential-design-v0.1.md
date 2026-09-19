# AI Agent A6.3 系统凭据存储设计 v0.1

日期：2026-09-18
状态：已实现
前置：[A6.2 Provider 非秘密配置](agent-a6-provider-configuration-design-v0.1.md)

## 1. 为什么凭据不能放在普通配置

`providerId` 与 `modelId` 是用户偏好，可以进入版本化 JSON；API Key 是秘密，生命周期、访问者和失败方式都不同。

```text
普通配置
  -> 可读、可迁移、可诊断

Provider 凭据
  -> 最小暴露、不可回读到前端、不能进入日志和模型上下文
```

把两者放在同一个对象里，会让设置导出、错误报告、调试快照或模型上下文很容易意外携带秘密。

## 2. 五层秘密边界

```text
Preferences UI
  -> 用户输入后立即提交，成功后清空输入框

WorkbenchClient
  -> 校验 providerId 和秘密格式

Tauri IPC
  -> status / set / delete
  -> 不存在 get-secret 命令

AgentCredentialStore
  -> 我们自己的存储端口与错误分类

OS Credential Store
  -> Windows Credential Manager
  -> macOS Keychain
  -> Linux Secret Service
```

Provider Adapter 将来通过 Rust 内部的 `read_secret()` 获取凭据。该方法不是 Tauri command，因此 WebView 即使知道名称也不能调用。

## 3. 为什么仍然包一层 AgentCredentialStore

业务代码不直接依赖 `keyring`：

```text
第三方库负责操作系统适配
AgentCredentialStore 负责产品合同、校验、错误隐藏和测试替身
```

这样可以独立替换底层库，也不会让 `keyring::Error`、凭据库实现类型或平台差异进入前端合同。

测试使用内存后端，不会读写开发机的真实系统凭据库。

## 4. 前端只能看见状态

跨 IPC 返回：

```text
providerId
present
status: configured | missing | unavailable
message
```

返回结构使用严格字段白名单。多出 `secret`、`token` 或其他字段会被整个结果拒绝，而不是忽略未知字段。

浏览器开发宿主只返回 `unavailable`，并拒绝 set/delete，因此不会为了演示功能而退化到 localStorage。

## 5. 明文生命周期

Rust 命令参数进入后立即包装为 `Zeroizing<String>`，离开作用域时覆盖内存。系统凭据读取结果也使用相同包装。

前端密码输入不保存在 React state，只在提交瞬间读取；成功或删除后立即清空。JavaScript 字符串无法保证可靠擦除，所以这里的原则是：

```text
不持久化
不日志记录
不加入应用快照
不提供回读
尽量缩短驻留时间
```

## 6. 校验与错误策略

```text
providerId 必须符合统一命名规则
秘密不能为空、不能带首尾空白或控制字符
秘密最多 2560 UTF-8 字节
底层凭据库错误不携带平台详情返回前端
```

命令只返回产品级错误：无效 Provider、无效凭据或系统凭据库不可用。不会把密钥、账户条目或底层错误文本写入错误消息。

## 7. 与 Provider 状态机的关系

```text
missing
  -> Provider Session: authentication-required

configured
  -> Provider Session 继续做连接健康检查

unavailable
  -> Provider Session: unavailable 或 error
```

“凭据存在”不等于“凭据有效”，也不等于“Provider ready”。真实 Adapter 仍需通过一次受控健康检查验证认证结果。

## 8. 已验证行为

```text
系统后端依赖可编译
测试后端不会访问真实凭据库
status/set/delete 合同通过
浏览器宿主拒绝保存秘密
前端拒绝带额外 secret 字段的响应
无 read-secret IPC
全部 Rust 宿主单元测试通过
```

## 9. 下一阶段 A6.4（已完成）

实现第一个真实 Provider Adapter：

```text
宿主侧 HTTP 请求
统一 Turn/Decision 合同
流式事件解码
认证、限流、超时和模型不可用分类
Token 与时间预算
工具调用仍只作为候选动作返回控制面
```

详见 [A6.4 OpenAI Provider Adapter 设计](agent-a6-openai-provider-adapter-design-v0.1.md)。
