# U2：当前运行的上下文与预算说明 v1

日期：2026-10-09。状态：已按用户授权实施并完成本地验收，待实际结果与21文件清单提交审阅。代码基线c2a `0ccd31c`；实际构建预览为本机模型fixture，未新增真实供应商请求。现有视觉方向和配色见[UI计划](./agent-ui-design-plan-v1.md)，当前进度见[任务计划](./agent-task-plan-v1.md)。

## 1. 用户目标与范围

用户能够回答：这次请求准备了多少输入、为什么省略旧对话、为什么下一次读取没有执行，以及接下来在哪里检查预算。独立Agent使用现有真实报告；这批只增加宿主的只读展示投影和界面。

- U2-R1：显示当前Run最后一次模型输入的估算和当时预算，明确它不是供应商实际usage、远端完整上下文或计费金额。
- U2-R2：上下文选择、模型输入、下一次读取准入按各自阶段展示；不会把候选预览显示成已发送或已执行。
- U2-R3：会话、新Run、连接目标/预算变更、断线重连、停用和迟到HTTP回包不能串数据；恢复的历史记录缺少诊断时明确不可用。
- U2-R4：保留项目深色工作区、现有检查区/对话/草稿/焦点行为，增加“上下文”页签；窄屏仍复用原生dialog。
- U2-R5：诊断读取/失败/刷新仅影响面板；预算入口打开现有设置，保存后由用户重新发送，不自动重试旧Run。

本批不提供实际usage/价格采集、诊断历史持久化、摘要/检索、c2b拒绝反馈、写工具或Agent执行链改造。第一方与外部Agent的Controller合同保持；软件Workbench不需要为独立UI导入新组件。

## 2. 界面与信息层级

沿用已有对话工作区。检查区增加第三个按钮“上下文”；输入区增加一个低强调的“上下文”入口。默认关闭检查区；打开后按U1规则收会话栏，让正文保留空间。

1. **模型输入**：`输入估算 ≈ 4,800 / 8,192 tokens`，下方“这是最后一次模型输入准备的本地估算”。status=ready仅表示预算检查通过，不能标为请求成功或回答完成。实际usage单列“供应商实际用量：未提供”。
2. **上下文选择**：展示选中项数、必须保留项数及按原因分组的省略项数；“较早对话已省略X轮”来自Session的当前Run计数。最近完整对话、已执行工具反馈的保护语义沿用原报告。
3. **下一次读取检查**：展示“通过预算检查 / 空间不足，本组未执行 / 未支持 / 数据不一致”等既有准入状态。可展开本组调用数量和结果字节上限。实际完成项仍只来自“本次活动”。
4. **下一步**：预算阻断时提供“检查输入预算”与“查看会话资料”。诊断接口失败只提供“刷新诊断”；不能把按钮叫作“重新生成”。

三个区块可属于不同turnId；caption明确“最后一次模型输入”“当前上下文选择”“下一次读取检查”，不合成一个总使用率、不把两种估算相加。无数据不显示伪0。当前设置预算不替换已准备输入的冻结预算。

设计依据：用户正在委托任务，需要在中断后判断原因并继续；对话正文优先，说明次之。领域词为委托、依据、保留、取舍、读取、交接。签名是从“输入 → 选择 → 下一次读取”追溯本次任务，不展示与任务无关的仪表盘指标。

颜色、字体、密度直接复用独立UI的`--color-*`、`--font-ui`和4px间距体系：canvas #1C1D20、command #242529、surface #2D2F35、ink #F2F0EB、muted #AFB1B8、focus #8FB7FF、danger #D98383。面板16px内边距、区块24px间距、13px标题/12px说明、tabular数字；弱分隔，无装饰阴影或圆环。沿用现有native button/details/dialog，不引入新组件库或动效。

## 3. 只读聚合接口

现有三个GET报告没有共同的session/连接绑定封装。客户端自行拼接三次HTTP响应容易混入不同时刻的状态；U2增加独立的App投影接口，在同一同步读取中采样，但仍保留三个阶段各自的turn身份。

已实现：`GET /api/run-diagnostics`，只读、no-store，沿用现有Host/Origin检查。保留三个原GET接口及Host v5/SSE、External v1、raw stream v1、chat v1、存储Run DTO；不添加模型请求或凭据入口。

```ts
interface AgentRunDiagnosticsV1 {
  schemaVersion: 1;
  hostInstanceId: string;           // 进程内随机身份，重启改变
  hostSequence: number;            // 采样时现有Host序号，不是模型请求数
  sessionId: string;
  runId: string | null;
  selectedProfileId: string;
  configurationEpoch: number;      // 宿主内有效目标/预算/凭据代次，不是密钥指纹
  availability: "available" | "pending" | "no-current-run" | "disabled"
    | "configuration-changed" | "unavailable";
  modelInput: ModelInputSummaryV1 | null;
  contextSelection: ContextSelectionReportV1 | null;
  admission: ToolFeedbackAdmissionReportV1 | null;
  omittedHistoryTurns: number | null;
  actualUsage: null;               // 本批没有采集来源，不能推算补填
}
interface ModelInputSummaryV1 {
  runId: string;
  turnId: string;
  providerId: string;
  modelId: string;
  status: "ready" | "budget-exceeded";
  estimator: "utf8-json-bytes-div3-v1";
  estimatedInputTokens: number;
  inputTokenBudget: number;
  retainedHistoryTurns: number;
  toolCount: number;
  maxOutputTokens: number;
}
```

App的`contracts/run-diagnostics.ts`拥有精确DTO、decoder与冻结函数。ContextSelection和Admission复用Runtime既有严格guard，不复制枚举/规则；ModelInputSummary从现有类型按白名单投影。所有字段必填、拒绝extra、非负/正值用安全整数，既有ID规则和限制复用。所有非null嵌套report的runId必须匹配外层；各自turnId允许不同。modelInput状态与输入估算/预算关系一致，实际Usage必须为null。

availability=available要求当前runId非null且至少一份报告；pending要求当前runId非null、所有报告及省略轮数均null。disabled/no-current-run/configuration-changed/unavailable清空所有报告及省略轮数。no-current-run的runId必须为null。优先级为disabled→no-current-run→configuration-changed→来源校验→available/pending；只有available可以带省略轮数。无效来源只影响诊断投影，不能让真实Run转为失败。getter不递增序号、不写会话、不读磁盘或调用模型。

hostSequence沿用采样时的Host序号，不承诺每次诊断变化都递增；相同序号的后续串行采样可以更新，不能把它当独立revision。客户端请求序号负责识别新旧响应。来源阶段暂未发布新报告时保留真实缺失状态，不为迎合UI人工生成预算数字。

DTO不含正文、模型原始响应、工具输入/结果、资源文件名、baseUrl、headers、密钥或密文。当前c2a报告的候选invocationId只是预留身份，不是执行事实；界面不据此生成完成卡片。

## 4. 宿主和客户端生命周期

Host在主Session发布新Run时捕获sessionId/runId/profileId/configurationEpoch，不能只在Host.submit捕获，否则直接Session测试装配会遗漏。当前选中profile、有效目标/model/inputPolicy或实际凭据变化后递增代次；单纯重命名及编辑未选中profile不改变有效目标。凭据是否变化只在Host内比较，不生成或公开密钥指纹。完成旧Run后修改配置会使旧绑定失效，聚合接口返回configuration-changed，直到新的Run建立绑定；不把旧估算套到新设置上。

报告仅在主Session、当前绑定、当前Run及有效源身份下投影。probe不能建立或覆盖主绑定。取消可保留之前有效模型输入，但已由Session清空的选择/准入保持null；不能复活迟到报告。停用清除绑定，再启用同一个旧Run不重新绑定；只有真正的新Run能够建立新绑定。切换/重启或恢复的历史按现有事实返回缺失状态，不重建猜测报告。

客户端读取现有useAgent的宿主重连代次，并使用独立的诊断请求序号和AbortController。接受回包前检查：组件未销毁、连接仍有效、请求未被替代、当前sessionId/runId/profile目标与捕获值一致、hostInstanceId/sequence未倒退。新连接代次建立自己的hostInstance基线，不将不同进程的sequence直接比较。v5快照没有configurationEpoch，客户端不能伪造该字段或假定它与sequence相同：比较捕获的已选profile配置/inputPolicy/credentialPresent，实际凭据变化由Host绑定代次验证。同一公开目标下hostSequence更新时，非运行面板先清旧数据；回包sequence必须不早于最新公开快照，而非仅比较请求发起时的快照。旧成功和旧失败均不得覆盖新状态。会话/Run/配置变化或断线立即清空旧显示并取消旧请求；旧失败回包也不能覆盖新面板。

面板打开时读一次；打开且运行中最多每秒读取一次本地诊断，最多一个在途请求，状态变更合并为一次待刷新。终止/取消/配置变化/重连做一次刷新；关闭面板清理请求/计时器，手动“刷新诊断”仍是本机只读GET。不能按每个流式字符请求一次，也不能用永远被流式事件推迟的纯尾部debounce。数据错误使用面板自己的稳定状态，不写useAgent全局执行错误。

打开设置复用SettingsDialog，仅增加可选的预算定位入口：展开现有高级预算details并把焦点移到预算字段；保存/关闭仍按原流程。运行中编辑限制保留。返回后恢复触发按钮焦点；保存使旧预算按钮移除时，回到仍在当前检查区的“上下文”按钮，不能focus已脱离DOM的节点或窄屏inert背景。预算字段受fieldset禁用时以matches(":disabled")判断并聚焦details标题。不清草稿、不调用submit、不自动提高默认8192。

## 5. 状态与错误

| 情况 | 展示与行为 |
| --- | --- |
| 新会话/恢复的历史 | “当前没有运行诊断”，无伪0、无历史复制 |
| 正在准备首个输入 | “正在准备本次输入”，不预填模型窗口或usage |
| ready输入、正常完成 | 显示最后一次输入估算，回答完成来自Session |
| 输入超预算 | 当前输入估算/冻结预算及设置入口；无自动重发 |
| c2a读取阻断 | 本组未执行，已有真实活动保留；模型输入区不替换为候选预览值 |
| 配置已更新 | “设置已更新，发送新消息后生成新的诊断” |
| 断线/取消/切换/重启 | 清理或按上述生命周期显示有效最后输入，不接受迟到数据 |
| HTTP失败/DTO无效 | “暂时无法读取运行说明”，本地刷新；聊天继续可用 |

## 6. 实施顺序与验收

1. App DTO/纯投影/Host绑定与聚合GET，先补错误身份、配置变化、probe/取消/恢复及Host/Origin/no-store回归。
2. 诊断请求协调器与薄React hook，验证重连/会话/Run/配置代次、乱序成功与失败、关闭/销毁、最多一个请求及有界刷新。
3. 现有检查区接第三页、输入区入口、估算/阶段/缺失状态及预算定位，复用U1样式/原生控件与焦点规则。
4. 实际HTTP fixture驱动完成/输入超限/c2a阻断/停止/切换；真实浏览器检查1280、1024、390、320、键盘/焦点/滚动及console。生成与诊断GET数量分开断言。
5. App测试、类型和隔离构建，必要依赖边界检查；修改涉及Runtime才增加相应测试。展示实际界面和精确diff后审阅提交，不推送/归档。

- [x] U2-A1 → R1/R2：严格DTO/纯投影，估算、真实usage、阶段和候选执行事实准确区分。
- [x] U2-A2 → R2/R3：新Run/配置/停用/probe/取消/恢复及历史缺失状态正确；只读GET和权限边界通过。
- [x] U2-A3 → R3/R5：延迟/乱序/断线回包隔离，关闭清理，刷新有界且零额外模型生成。
- [x] U2-A4 → R4/R5：真实UI各状态、桌面/窄屏/键盘/焦点/草稿通过，预算入口不提交消息。
- [x] U2-A5 → R1–R5：App受影响测试/类型/隔离构建、实际截图、数据与模型流量证据完整；记录原生IME及真实供应商限制。

实际文件：App新run-diagnostics合同/纯投影/请求协调器/hook/组件及测试，修改agent-host/http-server/use-agent/agent-app/workspace-inspector/settings-dialog/styles.css；README与现行规范按实现同步。具体提交范围由实际diff确定，不先承诺文件数量。本批无新依赖、无Runtime/Workbench生产改动。

回退移除新增面板及聚合GET，保留原始三份只读报告和聊天入口；不改设置文件或恢复旧Run。U2-A1–A5已完成本地验收：App91/91、测试/客户端类型、隔离生产构建和边界通过；实际1280/1024/390/320、预算定位/保存/焦点/草稿、取消/恢复历史/重连及局部诊断故障通过。运行中每秒有界GET、maxInflight=1、关闭后停止读取；本机模型请求3→6仅对应三次显式发送。证据为当前Trellis任务research/u2/implementation-verification.md及live-*文件。原生中文IME、整体视觉签收和真实供应商长期稳定性仍单独保留；不以c2a的58/77/222充当U2功能验收。
