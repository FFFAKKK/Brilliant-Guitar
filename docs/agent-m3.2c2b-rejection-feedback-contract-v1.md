# M3.2c2b：工具拒绝反馈与受控恢复合同 v1

日期：2026-10-09。状态：已实施（首发范围）。基线：U2 已提交 `064552d`；c2a 不可变读取准入已提交 `0ccd31c`。本合同只描述“模型收到拒绝后如何理解并决定下一步”，不改变 c2a 的授权、预览、执行和最终预算规则。

## 1. 范围 / 触发

c2a 在执行前可以发现整组读取无法安全执行，但当前 Controller 直接结束 Run，模型看不到结构化原因。c2b 为这类结果增加可选的、一次性的模型可读拒绝反馈：

- `blocked / input-budget`、`blocked / input-limit`：可恢复。模型可以缩小分页、拆分请求、改用已有结果或向用户说明限制。
- `unsupported / unsupported-tool`、`unsupported / unsupported-provider`：不可通过同一工具自动恢复；模型可以选择其他已暴露能力或明确说明不支持。
- `contract-error / invalid-context`、`invalid-preview`、`preview-execution-mismatch`：完整性错误。只保留真实已完成事实并停止模型续接，交给宿主显示原因。
- 取消、停用、会话切换、迟到结果、供应商失败不进入拒绝反馈；这些仍由现有取消/失败/恢复合同处理。

反馈是 Controller 生成的控制数据，不是工具结果、活动完成卡或新的权限。首发实现只对 `input-budget`/`input-limit` 且声明 v1 的第一方 Pi 触发一次恢复决策；恢复决策再次请求同一拒绝组时直接结束，避免循环和隐式重试。Unsupported/External v1 继续走原有本地失败语义。

本批不实现摘要、长期记忆、评分、自动提高预算、自动改写用户目标、写工具审批或 External Agent Protocol v1 的 wire 扩展。

## 2. 签名

```ts
interface AgentToolRejectionFeedbackV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly turnId: string;
  readonly nextTurnId: string;
  readonly status: "blocked" | "unsupported";
  readonly reason: "input-budget" | "input-limit" | "unsupported-tool" | "unsupported-provider";
  readonly retryable: boolean;
  readonly recovery: "reduce-input" | "choose-alternative" | "explain-limit";
  readonly calls: readonly {
    readonly callId: string;
    readonly capabilityId: string;
    readonly contractVersion: number;
    readonly input: unknown;
  }[];
}

interface AgentProviderRequest {
  // Existing fields remain unchanged.
  readonly toolFeedbackRejections?: readonly AgentToolRejectionFeedbackV1[];
}

interface AgentDecisionProviderPort {
  readonly capabilities?: { readonly rejectionFeedback: "v1" | "none" };
}
```

`AgentToolRejectionFeedbackV1` 是严格白名单 DTO：额外字段、重复 callId、跨 Run/Turn、非法状态/原因或非 JSON input 必须拒绝。`input` 是模型刚刚提交的调用参数快照，不是资源正文；Controller 脱离并冻结它。DTO 不含 preview 正文、地址、请求头、密钥、密文、原始异常、文件名或内部堆栈。

第一方 Pi 插件声明 `capabilities.rejectionFeedback: "v1"`，把拒绝反馈映射为当前模型协议可理解的错误工具结果；External Agent v1 默认声明 `none`，因此保持现有终止行为。未来 External v2 可以在协商后映射同一公共 DTO，不在本批修改 v1 wire。

## 3. 合同与状态转换

Controller 仍是唯一的授权、准入、执行和恢复所有者。状态转换为：

```text
模型提出工具调用
  → c2a 整组预检
  → admitted：按现有路径执行
  → blocked/input-budget 或 input-limit + provider 支持 v1：生成一次 rejection feedback
      → Pi/兼容 Provider 做一次新决策
          → 新决策为较小/替代工具：重新走完整授权与 c2a 预检
          → 新决策为普通消息：回答限制或使用已有事实
          → 再次请求原拒绝组：结束为本地拒绝，不能再次反馈
  → provider 不支持 / contract-error：现有失败或完整性停止
```

- 拒绝反馈与 `AgentToolFeedbackGroup` 分离。成功工具反馈只能包含真实已执行的 completed result；拒绝反馈不能进入 `invocations`、活动列表、context-selection 的 executed-result 或成功历史。
- Pi 映射为原请求 callId 对应的 `toolResult`，`isError=true`，内容只包含版本、reason、recovery 和短稳定说明；它不是 CapabilityResult，也不产生 `activity.completed`。
- Controller 对新决策重新生成 turnId、工具身份和输入快照；重新调用任何工具都要再次经过授权、会话、文档版本、preview 和最终输入预算。不能复用上次 candidateInvocationId 或 resultJsonByteLimit。
- 可恢复原因的反馈最多一次；`recovery` 是宿主提示，不是模型必须遵守的命令。模型仍可以直接说明无法完成。
- `unsupported-tool` 和 `unsupported-provider` 只允许 `choose-alternative` 或 `explain-limit`；首发 `input-budget` / `input-limit` 只生成 `reduce-input`。任意不一致组合拒绝 DTO。
- `contract-error` 永不转成模型可执行恢复。若已有真实完成项，继续保留这些活动和完整结果；不裁剪、不重试、不生成“第三次完成”卡片。

## 4. 验证与错误矩阵

| 情况 | 必须行为 |
| --- | --- |
| 可恢复预算阻断 + Pi v1 | 产生一条冻结 rejection feedback，最多一次新决策；模型可缩小调用或解释限制 |
| 可恢复输入结构上限 + Pi v1 | 同上；不提供虚假的最大页大小，模型需自行调整参数 |
| 不支持工具/提供方 | 首发沿用现有本地失败；DTO 为后续兼容预留 |
| Provider 未声明 v1 | 不把新字段传入；Run 直接按现有失败语义结束 |
| Provider 二次仍请求同一组 | 本地结束，不能再次调用模型或工具 |
| 二次请求替代工具/更小输入 | 重新走全部验证；失败仍只能产生一次 rejection |
| contract-error / mismatch | 零模型续接；保留真实已完成结果，面板显示完整性错误 |
| 取消/切换/停用/迟到反馈 | 丢弃 rejection，不写新 Run/历史/活动 |
| 非法/跨身份/多余字段 | Provider 输入验证失败，本地 `invalid-decision`，不执行工具 |
| 拒绝反馈映射异常 | 本地 provider-failed；不让异常改变 Controller 授权状态 |
| 新 Run/恢复历史 | 清空拒绝反馈，不复制旧拒绝原因 |

## 5. Good / Base / Bad

- Good：资料第三页因输入预算不足被阻断；Pi 收到 `input-budget/reduce-input`，把 `maxCharacters` 调小；新调用重新预检并执行，已有两页结果各出现一次。
- Base：External v1 或未支持插件遇到同一阻断；Run 显示明确本地原因并结束，不伪装已恢复。
- Bad：把预览正文包装成 tool result、把拒绝创建为 completed activity、自动把预算改成 16384、无限重复同一调用、将 contract-error 当作普通预算不足、把旧拒绝复制到下一会话。

## 6. 必要测试

1. 严格 DTO：字段白名单、JSON input 深冻结、身份/重复调用/状态原因矩阵、敏感字段排除。
2. Controller：budget/input-limit 一次反馈；二次缩页重新完整预检；二次同调用零模型/工具；unsupported 与 contract-error 分流；取消、切换、迟到隔离。
3. Pi：拒绝映射为 `isError=true` 的工具结果，保留原 callId，但不产生 Activity/Invocation；模型随后普通回复或较小调用均能继续。
4. External：v1 hello/turn wire 字段完全不变且 `capabilities.rejectionFeedback=none` 时无新续接；未来 v2 接口只做类型预留，不发送 v1 未知字段。
5. Session/UI：拒绝反馈不写成功历史；失败/部分回复原因与真实活动一致；完成两页后第三页阻断仍只有两张完成卡；新会话、刷新、停止不复活。
6. 预算/安全：单 Run 恢复上限为1，最大模型决策轮数仍受 `maxTurns`；不产生额外工具权限、请求地址、凭据或正文泄露；provider 发送次数与恢复次数可观测且有界。

## 7. 错误与正确

### 错误

先执行第一页，第二页放不下时，把第二页的预览正文伪装成工具结果并自动再问模型；模型继续重复同一调用，直到 `maxTurns` 或网络超时。

### 正确

整组预检在执行前得出 `blocked/input-budget`，Controller 生成一次独立的冻结拒绝反馈。Pi 将它映射成 `isError=true` 的模型可读结果；下一次调用仍经过原 Controller 和 c2a。External v1 不支持时直接显示现有本地失败原因；contract-error 永不自动恢复。

## 设计决定

1. **恢复权在模型，边界权在 Controller**：模型可以根据原因选择缩小、替代或解释，但不能绕过授权、版本或预算。
2. **拒绝反馈独立于成功反馈**：避免把“没有执行”误记为工具事实、上下文事实或历史成功。
3. **能力协商而非协议猜测**：第一方 Pi 先支持 v1；External v1 明确不接收未知字段，未来通过新 wire 版本协商。
4. **一次恢复上限**：解决最常见的分页过大问题，同时阻断循环、成本失控和模型反复调用。

回退：删除 `toolFeedbackRejections` 和 Pi 映射，c2a 原有失败/活动/诊断语义保持不变；拒绝事件是追加的运行事件，旧记录无需迁移。
