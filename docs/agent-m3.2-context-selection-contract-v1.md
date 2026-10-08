# M3.2 上下文选择与预算合同 v1

日期：2026-10-08。代码基线：`7ec2f9b`。用户在方案讲解后回复“继续”，已授权M3.2a实施。a代码及本地跨层验证完成并提交78cac1e；b离线比较已完成，未通过采用门槛，生产继续时间排序。机制与真实DeepSeek质量分别记录，M32-A8/M31-A5/M30-A5/A10保持待验收。

## 1. 解决什么问题

每次模型决策之前，把当前目标、可用历史和执行证据组成有限输入。选择策略必须说明哪些信息可省略，不能只按总分裁剪所有内容。

交付分成两步：

1. **M3.2a：保留规则与预算闭环。** 保护最近完整对话及本轮真实工具反馈，统一候选选择和省略报告，明确超限行为。
2. **M3.2b：可选历史相关性排序。** 在a的固定用例通过后，对较早的可选历史比较简单词面排序与时间排序。效果没有改善时保留时间排序，不为评分器增加无效复杂度。

a已实现并提交；b已完成离线比较，结论见[词面排序评估](./agent-m3.2b-ranking-evaluation-v1.md)，本版评分不接入生产。向量检索、模型重排、摘要压缩和长期记忆另行规划。

## 2. 已有实现与实际缺口

| 层 | 基线已有行为 | 本阶段需要补充 |
| --- | --- | --- |
| Session | 从最近成功历史倒序装入预算；碰到放不下的一轮便停止 | 交给统一选择器选择完整候选，避免上层先丢掉需要保护的最近对话 |
| ContextBuilder | 必需/高/普通/低优先级，去重、过期、历史轮数和数量/估算预算 | 可识别的保留单元、明确作用域规则、真实调用身份、可解释报告 |
| Pi消息投影 | 原user/assistant角色、当前目标去重、完整工具反馈与continue | 识别选择器保护的历史单元，最终预算不能把它们再次移除 |
| 最终预算 | 纳入消息/工具定义，必要时删除最早可选对话，仍超限则拒绝 | 与公共选择器的保留/裁剪顺序一致，整轮省略记录去重 |
| 外部Agent v1 | 从contextItems取数据，由同一Controller执行 | 工具结果不能在选择/去重阶段丢失；公共规则不依赖Pi角色 |

基线`ContextBuilder.itemKey()`不包含调用身份。基线探针已复现：同一能力/范围的两个不同invocation候选只剩最后一个，前一个标记duplicate；Pi的独立toolFeedback组保留全部调用，但External v1只投影选中的contextItems。本批已修复此通用反馈缺口，并用真实ExternalAgentAdapter及序列化Fake传输回归；这不等于外部生产传输已经可用。复现脚本和输出在任务research/m32-baseline-probe.mjs/json。

资源目录仍最多3份，正文按需调用`resource.read-text`。本阶段没有足够理由扫描所有文件正文再排名；首次请求继续只给完整的小目录和已授权工具。

## 3. 架构与责任

```text
Session提供本会话候选 + Host提供资源目录
                   ↓
共享ContextBuilder：校验 → 建保留单元 → 去重 → 预算选择
                   ↓
同一Controller：上下文检查 + 工具权限检查
            ↙                         ↘
      默认Pi插件                  外部Agent适配器
      消息/工具投影                External v1投影
      最终输入估算                  协商协议大小检查
            ↘                         ↙
                   决策返回Controller执行
```

- **开发者**维护版本化保留策略和用例，Host提供真实资源/会话/调用身份；模型负责根据输入判断下一步及是否读取资料。
- **Controller**继续独占执行、取消、审批与实际结果，不由上下文分数授予工具权限。
- **Pi**继续复用1.0.3的Agent、prompt/continue及流组件。已安装Pi支持`transformContext`，但把公共选择策略只塞进这个钩子，会让外部Agent绕过它；通用规则应放在已有ContextBuilder，Pi负责协议装配与最后估算。
- 不新增第二个运行循环、Controller或模型传输。

## 4. M3.2a的选择单元

| 信息单元 | 选择规则 | 超预算行为 |
| --- | --- | --- |
| 当前目标、不同于目标的追加输入、Run状态、当前作用域 | 必需 | 拒绝本次决策请求，不裁掉用户要求 |
| 已提供的宿主必需事实与约束 | 校验适用性后必需 | 无法装入时明确失败 |
| 最近完整成功对话 | 最近`min(2, historyTurnBudget, 可用成功轮数)`轮整体保护 | 不截断、不只留下助手回复；无法装入时明确失败 |
| 更早成功历史 | a按新到旧选择，最终投影按原对话顺序排列 | 按完整user/assistant对省略 |
| 当前资源目录 | 继续必需，只含元数据 | 目录无法装入时失败；不能偷偷扫描正文 |
| 本Run真实工具调用与结果 | 每次调用身份唯一，全部已完成反馈组保护 | 不只留call或result，不截正文；无法装入时停止后续模型请求 |
| 其他可选Host资料 | 保留既有优先级，稳定选择，保留来源 | 可省略并报告；a不臆测内容语义 |

保护最近两轮是有限的连续对话策略，不宣称识别了所有重要事实。候选窗口以现有historyTurnBudget为上限，默认16轮；更早的用户限制可能仍未进入本轮输入。失败/取消的历史、跨窗口偏好提取和长期记忆不在本批。不能把“最近两轮保护”标成“永不遗忘”。

两轮来自Session认可的成功记录与明确顺序，不依据正文里的“user/assistant”字样，也不把重建时相同的createdAt当成原始聊天时间。historyTurnBudget为1时保护1轮；没有历史时为0。

## 5. 校验、作用域、版本与去重

1. **先校验适用性，后决定保留。** required不豁免错误会话、无效估算或失效数据。可选项不合格则报告省略；必需项不合格则明确失败，不静默丢弃。
2. **作用域由宿主语义决定。** conversation和resource.catalog必须匹配当前session。`run`、`turn`、`workspace`、`document`、`range`、`none`不是一组可以直接与sessionId比较的字符串；不对所有业务资料做一刀切相等检查。
3. **版本按对象比较。** 只有documentId等于当前文档的资料才与该文档版本比对；其他文档的版本数字不能和当前版本横向比较。独立TXT/MD是不可变快照，resourceId/version按资源合同处理，不挪用乐谱documentVersion。
4. **旧证据保留历史语义。** 已经执行得到的本Run结果不能因后来版本变化而删除；仍保留原版本和警告，修改工具继续走既有版本前置条件。此策略不授权修改。
5. **工具结果以invocationId为身份。** 两次读取同一工具、同一资源、同一页也是两个实际调用，不按正文或sourceId合并。同一次调用的重复副本只保留一个；同ID不同内容明确失败。
6. **普通资料按明确来源/对象/版本/范围去重。** 保持完整来源，不能把内容相同但属于不同消息/资源的项合并。对话以runId识别，不做相似文本去重。
7. **资料不升级角色。** 相关性和required只控制保留，不能把文件正文升级成系统指令，也不把助手历史当作新用户要求。

当前Workbench既有版本警告、范围和恢复规则继续保留。新策略先由独立Agent宿主显式启用；Workbench未启用时保持原行为。修复真正调用身份的通用缺口时须补External与Workbench回归，不能复制两套算法。

## 6. 两阶段预算只有一套保留语义

第一阶段在公共ContextBuilder选择有界信息单元；第二阶段在协议装配完成后核对真实请求结构。

- 保持8192的既有输入估算预算，输出1500和超时45000ms不在本批调整。
- 最终Pi估算继续使用`utf8-json-bytes-div3-v1`，覆盖基础职责、消息、工具定义及JSON包装。它是工程估算，不是供应商真实token/usage，也不是模型窗口保证。
- 数量与估算预算都须检查；protected内容超过数量或输入预算时明确失败。
- 可选资料的保留顺序由公共选择器确定；最终估算需要腾空间时按同一顺序反向移除可选完整单元，再重新投影估算。a的历史策略就是从最早可选整轮开始删。
- 最终装配不能降级受保护的最近对话，也不能裁剪工具反馈组或当前目标。
- 同一工具结果如果同时存在于contextItems和Pi反馈组，Pi只投影一次正文；External v1仍得到带调用来源的结果，不要求External采用OpenAI的tool角色。
- 必需内容仍超限：在Provider/模型请求前明确终止本次决策；此前确已完成的工具调用保留实际记录，不伪装为从未执行。不能自动重读、重试或生成有损摘要。
- Session的省略数以候选窗口之外的历史基数加本次唯一省略ID计算，不能每个工具决策都累加同一轮。

错误分类沿用现有Run failureCode集合：公共选择超限映射budget-exceeded，无效/冲突映射invalid-decision；两者均零Provider请求。最终Pi超限沿既有provider-failed结束，Session依预算报告显示明确原因；已执行记录保留。

## 7. 公共反馈与兼容方案

内部API扩展Controller/Session可选配置，ContextBuildInput/Result和AgentContextItem持久形状保持不变。Provider以request-local sidecar接收公共选择计划，不把Pi特有字段放进通用策略。具体接口：

```ts
// 已实现：计划不写入ContextBuildResult或持久Run。
type ContextSelectionPolicyId = "standalone-context-v1";
// Session/Controller: contextSelectionPolicy?: ContextSelectionPolicyId
// Provider: contextSelection?: {report: ContextSelectionReportV1, optionalRemovalOrder: readonly string[]}
// Session: getContextSelection(): ContextSelectionReportV1 | null
// Session: reportContextSelection(report: ContextSelectionReportV1): boolean
// onContextSelection / onSelection只观察冻结、无正文的报告。
```

- `ContextBuilder`仍是唯一公共选择入口；纯函数辅助模块可拆分策略/单元判断，避免Session、Pi和External各写一遍。
- 不向External v1、聊天文件v1、存储Run DTO或Host v4快照追加严格decoder未知字段。
- 既有GET `/api/model-input`仍返回Diagnostic v1。新增选择报告使用单独的版本化合同与只读GET `/api/context-selection`；新页面面板放在M3.3，a提供可检查接口及fixture证据。
- 选择报告只含policyVersion、runId、turnId、selected/omitted的contextItemId、理由、受保护标记、预算估算和状态；b增加分数时另行版本化。无正文、URL、凭据、输出内容或正文指纹。
- 只保存当前Run最新报告，刷新读取不发起生成；新Run/新会话/切换/停用/退出与迟到报告按现有代次规则隔离。probe不接触主会话资料或报告。
- 报告observer异常不能影响执行。Host提供候选/策略回调异常应在预留Run前失败；其他Controller错误仍沿已有状态机结束。
- 报告不持久化；恢复聊天不自动执行。a不新增执行恢复功能，也不声称旧Run已经记录新策略版本。

## 8. M3.2b词面评分的边界与评估结论

只为已经通过作用域/版本校验、可以省略的旧对话比较排序。受保护信息不参加竞争，工具定义也不按分数改变权限。下面的词面策略仅用于离线评估，a运行代码没有接入评分器。

建议基线：使用当前问题和最近受保护的用户原文构造查询；匹配较早历史的用户原文。先比较匹配词项比例，再比较原始会话顺序，稳定打破平局。中文可用相邻双字，英文用单词；统一NFKC和大小写、去重并限制扫描长度/词项数。扫描窗口只用于排名，选中历史仍保留原文。

不先设一组看似精确的80/60/20权重。用固定数据比较“按时间”与“词面相关性+时间”的命中结果，再决定分词、窗口、权重与阈值。词面匹配不懂否定、同义词或隐含限制；低分不等于无用，高分不等于可信。

正文资料检索需要另有明确、获授权的索引入口。不能为了算相关性绕过`resource.read-text`把所有正文自动放入模型输入，或假装模型已读过正文。

## 9. 用已有练习场景解释

假设最近两轮包含“每天20分钟，重点练节奏”和安排要求，当前用户说“改为12分钟，其他照旧”。

1. 第一次请求保留最近两轮原文、当前12分钟修正及资源目录。模型可以定位《练习计划.md》，需要原文时提出真实读取。
2. Controller执行后，第二次请求保留同一用户要求及完整call/result。文件写30分钟也只是资料；模型按用户最新12分钟要求安排。
3. 下一轮用户只说“继续”，最近两轮仍整体保留。模型有依据理解短追问；若两轮仍不足以确定指代，需要澄清，不编造所谓长期记忆。
4. 若工具反馈与受保护内容已超预算，系统明确停止下一次请求并说明缩小资料读取范围/任务。此前执行事实保留，聊天完整记录不被删除。

本机HTTP fixture已实际捕获修正/继续及三次真实读取的wire，见任务research/m32-wire-evidence.json；它验证机制，不代表真实DeepSeek回答质量。

## 10. M3.2a验收表

| ID | 输入/操作 | 必须观察的结果 |
| --- | --- | --- |
| M32-A1 | 两轮成功历史后“继续”；historyTurnBudget=1/2/16 | 最近期望轮完整保留、原顺序与角色，当前问题一次；保护单元放不下时零新模型请求 |
| M32-A2 | 20→12分钟修正，插入无关旧历史 | 原修正与近两轮仍在，旧轮按完整对省略；不把助手/文件内容升级为要求；真实效果独立验收 |
| M32-A3 | 同一工具连续读不同页/相同页、多调用 | 每个invocation保留；Pi每次反馈正文一次；External v1获得各实际结果；执行数量不因重连增加 |
| M32-A4 | 错会话、过期、重复、同ID冲突、多个documentId版本 | 明确选择/拒绝理由，required不绕过校验；Workbench默认原版本警告回归 |
| M32-A5 | 工具定义/JSON包装造成最终超限；超数量；伪造估算 | 最终策略一致、整组反馈无悬空；保护内容仍超限时零后续请求，实际执行记录保留 |
| M32-A6 | 读取报告、刷新、probe、停止、新会话、迟到observer | 无额外生成，不跨Run/会话，报告无正文/哨兵凭据；observer异常不改变实际执行 |
| M32-A7 | 类型/运行时/应用/软件/External/打包回归 | 原公开版本与存储fixtures通过，独立安装无需软件，单一执行链 |
| M32-A8 | 用户主动配置真实DeepSeek，固定修正/继续/分页样例 | 单独记录实际回答效果与失败，不以fixture或选择分数替代 |

## 11. 实施顺序与边界

1. 先写ContextBuilder与实际Controller的失败用例：近两轮被裁、工具多结果合并、required无效被静默省略；捕获完整决策输入。
2. 收敛纯选择策略、身份和原子单元；在独立Session交付候选窗口，取消该路径重复token裁剪，保持完整记录与其他宿主默认兼容。
3. 接Controller必需输入检查和External v1实际反馈，校对Pi的最终估算及保护集合。捕获实际wire验证，而非只测排序函数。
4. 独立Host装配显式策略，新增严格选择报告API，补迟到/凭据/probe隔离。无需改Host v4或资源UI。
5. 运行Runtime typecheck/test/build/boundaries/standalone，App typecheck/test/隔离构建，刷新Workbench安装Runtime副本后跑Agent相关回归和类型检查。
6. 展示“继续”、修正、多页读取及超限的实际输入/诊断证据；同步规范和计划，再按本批具体清单提交。真实M32-A8独立保留。
7. a稳定后才用固定数据评估b，决定是否值得实现排序器。

候选文件：Runtime的agent-contracts/context-builder/run-controller/agent-session/Pi input-projection与model-input-budget；可拆单个selection策略/报告合同；App agent-host/http-server与对应测试。External仅当通用反馈投影必须调整时修改现有模块。不改Pi源码、Rust、根package、notation或其他窗口文件。

回退：宿主关闭显式新策略，保持旧公共DTO/存储可读；已提交的M3.1资源工具、聊天记录和活动UI继续可用。不得用关闭严格decoder或绕过Controller处理兼容问题。

## 12. 当前状态

- [x] 核对现有Session/ContextBuilder/Pi预算/External投影与Pi本地扩展点。
- [x] 形成a/b分批方案、保留/作用域/反馈/预算/报告合同和固定验收表。
- [x] M3.2a实施及M32-A1–A7本地证据（research/m32-verification.md）。
- [ ] M32-A8及此前M31-A5/M30-A5/A10真实质量验收。
- [x] M3.2b数据比较和选择结论：20固定样例，窗口内召回55%→60%，复核组66.7%→55.6%，6个关键情形退步；保留时间排序，详见[评估报告](./agent-m3.2b-ranking-evaluation-v1.md)。

M3.2a已实现并提交78cac1e，保留Pi1.0.3与同一Controller。Runtime38/38、App56/56、Workbench Agent222/222及类型/构建/边界/独立安装通过；旧预览不替换，隔离M3.2预览8792启动disabled且无凭据，未向真实供应商发送请求。a的结果与22文件清单已获用户确认；b本轮只交付离线评估和文档，真实验收仍未完成，任务不归档。
