# M3.2c2：只读工具反馈准入合同

日期：2026-10-09。状态：c2a已实现，本地验收完成，待精确清单审阅提交。前置c1已提交`daa4cce`；现行合同仍为Host v5、连接v2、External v1、模型流v1、聊天文件v1。研究和设计实验见当前Trellis任务`research/m32c2/`。

## 1. 解决的问题与第一版边界

c1允许显式设置输入估算预算，但工具仍可能执行完成后，才发现完整反馈无法装入下一次请求。c2把判断前移：**在执行本组只读工具前，用真实候选结果预测下一次输入；只执行能装下的方案。**

首批称为c2a，包含公共准入机制、不可变文本分页、Pi与External本地适配预览、当前Run原因及只读报告。c2a只对宿主明确启用、支持精确预览且无副作用的query生效，启用时调用上限取既有权限上限与4的较小值，再由现有decision validator验证，直接使用Controller也适用。启用时未指定上下文策略则采用standalone-context-v1，保护最近完整两轮和真实反馈。现有Workbench默认不启用；启用后的未知工具或缺失预览器明确拒绝整组，不能悄悄绕过检查。两种插件都在同一个Controller中接受判断。

连最小合法页也无法容纳时，本组零执行，本轮明确失败；不再请求模型生成解释。后续c2b才考虑可恢复的拒绝反馈、工具失败后继续决策等语义。当前AgentToolFeedback只容纳completed结果，不在c2a中伪造成功结果或扩大它的含义。

本批不承诺读完任意长资料，不做摘要、检索、长期记忆、AGENTS.md、自动重试、写工具试执行、Pi fork或新的UI布局。已执行结果不能缩小、删除或重新执行。c1的8192默认、用户显式预算、1500输出上限和45000ms超时保持。

## 2. 职责与数据流

```text
模型提出一组调用
  → Controller验证工具、参数、权限、会话及审批条件
  → 宿主只读工具在不可变快照上生成候选页（不向插件/模型发布）
  → Controller组装候选的下一次上下文
  → 宿主适配器纯预览最终输入大小
  → Controller为整组确定页上限，或本地停止
  → 原ActionRuntime.invoke → 原Registry.invoke，每个调用执行一次
  → 校验实际结果与候选一致，记录真实反馈
  → 原Pi continue / External turn.request
```

预览器由宿主装配，与当前插件、模型、协议和预算绑定；不是向任意Agent插件提供的回调。Pi预览器不持有模型Host Port；External预览器只读取已协商限制，不调用transport.open/request/cancel、不推进适配器状态或请求序号。候选正文仅在宿主内短暂存在，执行成功后才进入插件决策请求；预览期间不能发布SSE正文或completed活动。

## 3. 公共接口

以下进程内接口已实现并导出；字段解析、工厂和报告decoder同步。

```ts
interface ReadAdmissionPolicyV1 {
  readonly schemaVersion: 1;
  readonly maxResultJsonBytes: number; // safe integer 1..65536; Node首批配置12288
}

interface AgentReadResultLimitV1 {
  readonly schemaVersion: 1;
  readonly maxResultJsonBytes: number;
}

// 新增可选字段；不改CapabilityTransportRequest或模型提供的call.input。
AgentCapabilityInvocationContext.resultLimit?: AgentReadResultLimitV1;

type AgentReadPreview =
  | { readonly status: "unsupported" }
  | { readonly status: "insufficient-limit" }
  | { readonly status: "ready";
      readonly result: Extract<CapabilityResult<unknown>, { readonly status: "completed" }> };

// 同步、无外部副作用；授权/输入错误走既有definite-failure错误，不冒充空间不足。
AgentCapabilityPort.previewRead?(
  request: CapabilityTransportRequest,
  context: AgentCapabilityInvocationContext & { readonly resultLimit: AgentReadResultLimitV1 },
): AgentReadPreview;

interface AgentInputPreviewV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly turnId: string;
  readonly status: "ready" | "budget-exceeded" | "input-limit-exceeded" | "invalid-input";
  readonly estimator: "utf8-json-bytes-div3-v1" | "external-host-projection-v1";
  readonly estimatedInputTokens: number | null; // 结构限制阻止完整估算时为null，ready/budget-exceeded必须为数值
  readonly inputTokenBudget: number;
  readonly requestBytes: number | null;
  readonly requestByteBudget: number | null;
}
interface AgentInputPreviewPort {
  preview(request: AgentProviderRequest): AgentInputPreviewV1;
}

// 由宿主注入，Controller统一使用；AgentPluginPort不新增preview方法。
AgentSessionOptions.readAdmission?: ReadAdmissionPolicyV1;
AgentSessionOptions.inputPreview?: AgentInputPreviewPort;
AgentSessionOptions.onToolFeedbackAdmission?: (report: ToolFeedbackAdmissionReportV1) => void;
// ControllerDependencies接收相同三个可选装配项。
```

`RegisteredAgentTool`增加可选同步`previewRead(input, context)`，仅返回ready/data或insufficient-limit；Registry根据原请求封装invocationId/capabilityId/contractVersion，不让工具或插件自行建立调用身份。未注册预览返回unsupported。只有query、所有sideEffects为none、无prepared-change-set且当前决策无审批需求的工具可走c2a；descriptor声明本身不能替代宿主注册和校验。

`AgentActionRuntime.previewRead`和`invoke`复用相同workflow授权入口；Registry预览和执行复用相同版本/参数校验。`resultLimit`由Controller创建并冻结，不接受模型或HTTP请求夹带。新增上限明确按`JSON.stringify(result.data)`的UTF-8字节计算；完整CapabilityResult、source和原生call/result封装另由输入预览计算。既有`toolResultSizeBudget`没有统一字节单位和执行处，不在此批悄悄重解释。

不启用readAdmission时保持既有消费者行为。启用时必须有inputPreview，否则在任何工具预览/执行前拒绝；对本组任何unsupported工具同样整组拒绝，不采取只检查一部分再放行另一部分的方式。

## 4. 单一预算算法

### 冻结候选输入

Controller先验证整组，再预分配本组invocationId和下一turnId；这不是invocation.dispatched。所有候选保留模型原始callId和input。复用现有reducer在副本上推演成功后的planning状态，复用ContextBuilder/ToolsetResolver及工具反馈封装来组装下一请求，不能另写简化版状态机或估算提示词。

候选结果ID在这份私有候选请求中作为必需反馈处理；未执行前不能对外宣称executed-result。冻结来源时间、工作区版本、工具目录、下一阶段、受保护最近两轮和既有完整反馈。预览不触发onInput/onContextSelection等实际请求报告。候选请求只存在内存；崩溃后不能据此恢复或执行。

### 整组分配

1. 先以byte1对每个调用执行授权/版本/参数预检；文本不能返回正文，整组授权有效后再为每个调用生成最大候选页。先按现有选择规则移除可选历史，保留当前要求、最近两轮和全部已执行反馈。确定本组固定的可选项集合；搜索中不能再把省略的历史反复加回来。
2. 在字节上限1..maxResultJsonBytes内找到每个工具的最小合法候选。未到EOF时必须至少一个Unicode code point；已在EOF或空文件可返回合法空页。任何调用缺少合法候选，整组拒绝。
3. 用整组最小候选进行ContextBuilder和适配器预检。上下文身份无效立即拒绝；必需项数量或大小超限也拒绝。此时不创建本组Invocation、不执行工具、不发送下一模型/远端请求。
4. 最小组合可容纳时，按模型给出的调用顺序，逐个在字节上限内二分扩大；尚未分配的调用保留最小候选。每次试算包含整组，不只减一个text长度。最多4个调用，有限字节区间，每个区间最多16步；最小页查找、扩大各一次，另计常数次整组检查。
5. 固定最终候选和每个resultLimit，然后仍通过ActionRuntime.invoke串行执行。执行前后检查取消/会话/文档身份，使用与预览相同的不可变资源与分页函数；每个execute最多一次。
6. 校验实际data、身份与候选一致且满足上限，再建立真实feedback。仅在全组完成后，使用与预览一致的下一请求快照继续；使用前重新校验会话、工作区/模型/工具目录和所有选中项是否已到expiresAt，过期或身份变化时使候选失效、本地停止，保留已完成记录。实际发送前保留原最终预算检查。若实际数据违约，已完成记录保持真实，本轮失败，零续接/零重试；不能把数据裁到候选或把已完成工具改成“未执行”。

该算法优先完整保留已执行证据，并在可选历史腾出空间后为新页分配。按调用顺序分配是确定性选择，可能使前一调用得到较大页；第一版不声称最优或公平。文本前缀的大小必须单调；通用预览工具若不满足此约束不能注册此策略。首批验证包含引号、反斜杠、换行、emoji及nextStart/eof边界，不能根据几个中文样例就假定所有工具可二分。

### Pi与External的估算边界

Pi将现有projectMessages/projectTools/createRequest提取为无IO共享投影，再让实际stream和预览复用；两边都用budgetModelInput。不能调用Pi agent.prompt/continue或streamAgentModel来“预览”。估算仍为UTF-8封装JSON/3加现有固定开销，不是精确tokenizer；1500输出预留不从inputTokenBudget重复扣除。

External使用本机v1投影/严格限制检查，检查context项、字符串、单项/总字节、深度、节点及协商request上限；已协商限制不足时缩页或拒绝，不能截断v1 JSON。宿主输入估算为`ceil(UTF8(JSON({goal,context,tools}))/3)+32`，只表示宿主交付信息大小，不宣称远端内部提示词或模型窗口可用。预检request总字节用既有字段加requestId最坏JSON开销（256个UTF-16 code units，每个最多6字节转义）及最长合法24字符deadline预留，不调用createId/时钟回调或推进序号；正式发送仍走原validator。预览需要有结构化的尺寸/结构限制原因，不解析英文错误消息分支。v1线协议不增加budget、preview或feedback字段。

## 5. 文本页与失败语义

`TextResourceStore.previewRead`统一分页计算，取产品12KiB上限与Controller上限的较小值；工具preview与带resultLimit的execute复用此函数，原`read`入口使用产品上限。外部`resource.read-text@1`输入/输出字段不变：maxCharacters原本是上限，实际text可以更短；start、nextStart、totalCharacters、eof必须据实际结果计算。模型原call.input保持原样，不能把4096偷偷改写为实际页长。

若下一个code point及元数据也放不下，返回insufficient-limit；不得成功返回`nextStart === start && eof === false`。缩页不等于摘要，不可声称覆盖未读区间。工具描述明确“受本轮输入空间限制，可能返回更短页；必须用nextStart续读、以eof判断完整”。普通提示词无需为此改写整个Agent人格或Pi源码。

空间不足沿用`run.failed/budget-exceeded`；Session从本Run准入结果给出稳定原因，例如“剩余输入空间不足，本组读取未执行；此前已读结果保留。可缩小资料范围或确认模型容量后调整输入预算。”不是模型生成的回答，不追加伪tool_result。缺失支持、授权错误、预览异常、结果违约分别映射现有capability-failed/internal-error并保留独立报告原因。取消优先，不写预算错误或completed活动。

同组已全部预检通过不代表事务：执行中取消或工具失败时，前面的真实完成项保留，后面的不执行，按现有失败/恢复规则终止；不承诺rollback。写工具、prepared-change-set、审批和恢复入口保持原语义，不能用本机制试执行或改写它们的结果。

## 6. 只读准入报告

已实现`ToolFeedbackAdmissionReportV1`及`GET /api/tool-feedback-admission`，返回报告或null；沿用现有Host/Origin及no-store规则，不扩充Host v5/SSE或聊天文件。报告仅保存当前Run最新一次已结算的准入判断，不是完整审计日志。

精确字段：`schemaVersion=1, policyVersion="immutable-query-v1", runId, turnId, nextTurnId, status, reason, inputPreview, calls`。

- status：admitted / blocked / unsupported / contract-error。
- reason：fit / context-budget / input-budget / input-limit / unsupported-provider / unsupported-tool / invalid-context / invalid-preview / preview-execution-mismatch。
- inputPreview：上一节AgentInputPreviewV1或null；只有进行过对应试算才能填数字；External结构/尺寸检查阻止完整估算时estimatedInputTokens为null，不用0伪装未知。
- calls最多4项，字段严格为callId、capabilityId、contractVersion、candidateInvocationId、resultJsonByteLimit、previewResultJsonBytes。未形成候选的后两字段为null。candidateInvocationId只表示预留身份，不能显示为已执行。

report不含工具输入、正文、文件名、错误原文、地址、密钥、提示词或回答。decoder验证身份、整数上限、枚举和extra字段；inputPreview的runId/turnId必须分别匹配report.runId/nextTurnId，calls的callId和candidateInvocationId均唯一，非null字节值为安全整数且不超对应上限。observer收到独立冻结副本，异常/同步重入不能控制执行。报告只在对应Run/Turn接受；新Run、切换/新会话、停用、dispose清空，取消后迟到结果不覆盖。刷新可以读取，重启不恢复；probe无工具/准入报告且不能污染主会话。原ContextSelection和ModelInput诊断继续只描述实际请求，不能被候选预览替换。

第一版UI复用M3.3a失败原因展示，不添加新布局或假工具卡；详细预算面板属于后续U2。

## 7. 验证矩阵与验收

| 条件 | 必须验证的行为 |
| --- | --- |
| 无权限、错误参数、错误会话/版本 | 零正文预览、零execute；原权限规则不变 |
| 完整页可放入 | 原参数、单次execute、完整call/result一次，正常续接 |
| 完整页超限、缩页可放入 | 真正缩小未执行页，nextStart有进展/eof准确，实际请求估算不超限 |
| 本组最小页组合也不够 | 本组零Invocation/零execute/零下一请求；此前结果完整保留，UI原因正确 |
| 多调用 | 先检查整组，顺序分配，后面最小页有预留；无单项检查后整组溢出 |
| EOF/空文件、中文/ASCII/emoji/转义字符 | 合法空EOF及非EOF进展，严格结果字节及完整封装估算 |
| 预览和实际违约 | 保留实际已完成记录，失败且不续接/重试/裁剪 |
| observer抛错/重入、取消、切换、迟到、probe | 控制流程和当前Run报告不被污染，无候选正文泄漏 |
| External/Fake/Workbench旧入口 | 同Controller准入；External既有v1字节/结构限制与无预算字段；默认不开启消费者保持 |

- [x] M32C2-A1：公共策略/预览/resultLimit/报告合同、不可变边界、权限先行与错误分类回归。
- [x] M32C2-A2：真实Controller整组预检、缩页、最小页阻断、可选历史/近两轮/已执行反馈保护、单次执行及违约/取消矩阵。
- [x] M32C2-A3：本地真实HTTP Completions捕获，与Pi预览的messages/tools估算逐次一致；External序列化Fake Transport的限制/无副作用/同链路验证。
- [x] M32C2-A4：当前Run稳定原因、独立no-store报告、probe/会话/停止/刷新隔离；实际UI显示与工具活动事实一致。
- [x] M32C2-A5：受影响Runtime/App/Workbench Agent类型与测试、隔离构建、依赖边界、packed独立安装；记录所有实际命令和未测项。

真实供应商长期稳定性、远端隐藏上下文/模型容量、任意长任务和原生中文IME不由上述fixture测试认证。后续有界真实复测须单独记录，不自动重跑用户旧失败任务。

## 8. 证据、实施顺序与回退

规划阶段复现既有工具执行后溢出的2项测试，另用真实本地Pi装配捕获请求做4种文本的尺寸实验。2048预算下，候选可用前缀分别为中文921、ASCII2764、转义754、emoji691字符，全部非EOF。数字仅用于该固定实验；不是产品默认页长，也不是c2已经生效。实验不包含整组分配/可选历史/权限/取消等新机制验收。

实施按五步：公共合同与失败回归 → 提取共享纯投影/External本地预检 → Registry和不可变文本预览/上限 → Controller整组准入/Session原因/报告 → HTTP/External/软件/浏览器及包检查。具体文件候选与命令见任务implement.md；审批/恢复或动态可变工具需要支持时另做合同，不默认扩范围。

回退方式是移除独立宿主的readAdmission装配，保留原最终预算阻断；新增接口均可选、报告独立，现有文件/外部协议无需迁移。不能通过关闭最终检查、提高默认预算或删除真实反馈回退。实现已同步七部分可执行规范；本批验收证据见任务research/m32c2/verification.md。


## 9. c2a实施结果（2026-10-09）

用户继续后按本合同实施。Runtime58/App77/Workbench Agent222通过；相关类型、隔离生产构建、依赖边界与packed独立安装通过。新增Runtime15项和App2项回归；旧执行后溢出样例已更新为缩页/执行前阻断，Runtime保留默认未启用时的旧溢出回归。

实际本地HTTP中文7465字：8192预算下前两次读取成功、第二页缩小，第三组最小结果不足时零新Invocation/零第四次模型请求，已有反馈保留。Pi每次实际输入估算与前一准入报告一致；External采用序列化Fake Transport，预览不联系远端，不推进ID/时钟或序号。

实际构建预览8830（本地fixture），桌面1280×720和390×844均显示当前稳定原因、部分回复与两次完成卡片；窄屏scrollWidth=390，console warn/error为空，刷新状态保留。此次没有真实供应商请求，不认证网络稳定性、远端窗口、任意长任务或原生IME。任务保持in_progress；c2b、U2另排，未提交/推送/归档。
