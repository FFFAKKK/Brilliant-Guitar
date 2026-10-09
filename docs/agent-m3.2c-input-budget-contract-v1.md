# M3.2c：显式输入预算与工具反馈准入方案

日期：2026-10-09。状态：c1已提交`daa4cce`并完成有界验证；c2已形成独立合同草案，待审阅、尚未实施。显式16384已使原真实中文例完成，但默认8192与任意长任务的容量限制仍保留。

## 1. 范围、问题与分批

M3.3a已提交d360bbb，解决“失败看起来像完整回答”的展示问题。真实中文7465字符资料两页反馈后，最终估算9896/8192仍失败；相同字符长度ASCII通过。证据见当前任务research/real-acceptance/results.md。8192是我们的工程预算，不是供应商上下文窗口。

建议分为两个可独立验证的批次：

- **c1，已实施批次**：按连接与当前模型设置输入估算预算；预算在Run开始时冻结，提供最小高级设置和准确诊断，保持最终阻断。
- **c2，后续批次**：在工具执行前预判剩余空间，能够减少尚未执行页的结果或提前解释限制。独立[反馈准入合同](./agent-m3.2c2-feedback-admission-contract-v1.md)已给出公共接口、宿主纯预览及整组分配规则，待审阅后实施。

先不做摘要、自动调大预算、工具结果删除、长期记忆或UI全面改版。c1不能承诺任意长度资料均可回答，也不能修复连接间歇失败。

## 2. c1签名与版本草案

保持通用四字段AgentModelConfiguration及模型流v1、External v1、聊天文件v1。输入预算属于宿主运行策略，不能塞入模型连接地址或凭据上下文。

```ts
interface ModelInputPolicyV1 {
  readonly schemaVersion: 1;
  readonly inputTokenBudget: number;
  readonly declaredContextWindow: number | null;
}
// Public ConnectionProfile v2 = existing fields + inputPolicy: ModelInputPolicyV1
// StoredConnectionProfile v2 = existing fields + inputPolicy (sealedCredential unchanged)
// ConnectionSettings / StoredConnectionSettings: schemaVersion 1 -> 2
// StandaloneAgentSnapshot: schemaVersion 4 -> 5; connections is v2

// New API; existing profile save endpoint remains a legacy bridge.
POST /api/connections/profiles-v2
// exact {schemaVersion:2, profileId:string|null, name, configuration,
//        inputPolicy:ModelInputPolicyV1, rememberCredential:boolean, apiKey?:string}

// New optional runtime hook; absence preserves every existing consumer.
AgentSessionOptions.inputTokenBudget?: () => number;
```

输入策略解析器由Runtime contracts拥有，独立应用的设置、存储和Host复用；UI不能另写一套范围校验。新的POST仍进入同一个saveProfile装配/存储流程，不能新增配置执行链。

## 3. c1数据和生命周期合同

### 预算含义

- 默认`{schemaVersion:1,inputTokenBudget:8192,declaredContextWindow:null}`，旧用户升级后默认行为保持。
- inputTokenBudget为1024–65536的安全整数；65536是本产品的工程配置上限，不宣称所有模型支持。
- declaredContextWindow为null，或1–1048576的安全整数；非null时要求`inputTokenBudget + 1500 <= declaredContextWindow`。这只是按用户声明进行的配置一致性检查，估算器不是精确tokenizer，服务端仍可能拒绝。
- 1500输出上限、45000ms超时、现有UTF-8 JSON/3最终估算器保持。UI标签为“输入估算预算”，容量非null时标“用户声明的上下文容量”，没有供应商验证时不能称“已识别上限”。
- 当前createCompletionsModel的32768/8192是固定装配元数据，不能充当已验证容量。c1不从模型名或`/models`返回的ID猜容量，也不靠修改Pi元数据绕过最终预算。

### 连接/模型绑定与兼容

- inputPolicy只适用于该profile当前完整目标和modelId。新profile使用默认值；更改provider/protocol/baseUrl或modelId，设置草稿先重置策略，用户可对新模型明确填写后保存。
- legacy save无inputPolicy时，同目标同model保留原策略，目标或model变化使用默认策略。legacy configure/saveCredential也委托同一归一化函数，不能因更新密钥把预算悄悄重置。
- v1连接文件严格解析后在内存规范化为v2默认策略，打开不写盘；下一次显式配置保存才原子写v2。无效/future文件保留并报错，不能丢弃私有/未来字段来迁移。v2失败回滚内存配置、凭据与策略。
- DPAPI的目标绑定方式保持，预算不是密钥身份。仅改预算或声明容量不得清除密钥、密文或用户“记住密钥”的选择；新目标仍按现有规则处理。
- Host v5与connections v2严格decoder同步发布；旧客户端遇版本不符提示刷新，不把extra字段塞进v4。聊天文件v1与External v1保持。

### 每轮冻结

- submit先同步读取一次inputTokenBudget hook并验证，再做当前输入的预检查、历史投影及Run预算装配；函数抛错/非法值时不创建半条聊天、不触发checkpoint或模型/工具请求。
- 本Run所有Controller轮次与Pi最终输入使用同一冻结值。预算修改、连接/模型切换和保存仍受Host busy保护，运行中不能让预算变动。
- 静态budget及其他数量/历史/结果限制保持；新hook只覆盖tokenBudget，不覆盖权限、historyTurnBudget、toolResultSizeBudget等字段。
- 无hook的Workbench/外部适配默认行为不变。启用该hook的进程内外部插件/适配器入口仍收到唯一Controller冻结后的公共context.budget，不在Pi内部独自修改。现有External v1线协议仅传context.items，不含预算字段；远端收到按冻结预算选择后的上下文，本批不偷偷扩充v1或声称远端已收到预算元数据。若需远端显式协商预算，另行设计版本化协议。
- 只读model-input/context-selection报告继续记录实际Run预算。Probe沿用原有独立默认预算，无资料/工具、不覆盖主会话报告。刷新/改设置零模型请求；手动发送才使用新预算，不自动续跑旧失败Run。

## 4. 验证与错误矩阵

| 条件 | 行为 |
| --- | --- |
| 小数、负数、越界、extra字段或future策略版本 | 400稳定配置错误；零模型请求、原配置不变 |
| 输入预算与用户声明容量不相容 | 400指出输入预算与1500输出预留的关系；不保存 |
| 保存时Run/probe/其他配置变更活跃 | 409；不应用一半策略 |
| v1合法文件加载 | 内存v2默认值，磁盘原文不变、disabled、零生成 |
| v2写盘失败 | 原目标/密钥/策略仍权威；可读存储错误 |
| 当前必需输入仍超所选预算 | 继续阻止下一次模型请求，保留已完成工具与部分回复 |
| 声明容量未知或供应商拒绝 | 明示未知/现有服务失败；不自动换模型/地址或重试 |

## 5. Good / Base / Bad

- Good：用户确认服务支持后，把输入估算预算明确设为16384；新Run完整接收同一份中文两页结果并回答；实际最终诊断采用16384，旧失败Run保持。
- Base：v1数据加载使用8192，原中文例仍明确失败；未知模型容量显示未知，不能保证此例通过。
- Bad：静默把全局常数改到很大、依赖固定32768冒充供应商容量、只改Pi预算、删掉第一页结果或自动重放写工具。

## 6. c1验收清单

- [x] M32C-A1：策略精确字段/范围/容量一致性，保存v2、v1内存迁移/原文件不变、future与损坏文件保留、写失败回滚、DPAPI哨兵及目标/model隔离。
- [x] M32C-A2：hook只采样一次且非法值零请求/零半条记录；所有轮次预算一致，修改409；无hook与External/Workbench兼容，旧聊天文件不变。
- [x] M32C-A3：同中文/ASCII资料，在8192和显式16384下用真实HTTP fixture对照；完整调用/反馈无删除、预算诊断正确、超限零下一次请求、停止/切换/迟到报告隔离。
- [x] M32C-A4：最小高级设置可填、可保存、显示未知/用户声明，键盘与窄屏可用；运行时禁用修改，不自动生成。类型/受影响测试/隔离构建/边界/独立打包通过。
- [x] M32C-A5：用户授权下经现有应用接口重测真实中文资料；记录所设预算、实际回答和网络失败，M32-A8只有完整回答证据通过后才勾。

## 7. c2设计入口与后续顺序

公共接口、取舍和验收现统一维护于[反馈准入合同](./agent-m3.2c2-feedback-admission-contract-v1.md)。c2a已实现，只对不可变query启用：授权/参数/会话先校验，候选正文留在宿主，Pi与External本地适配器通过同一Controller准入；不能执行写工具来“试算”。

本组最小候选也无法装入时，本地停止、本组零执行，不向现有completed-only反馈塞入伪结果。可恢复拒绝反馈属于后续c2b；c2a先完成整组预检、缩页、独立报告及既有失败原因展示。

可缩小页必须保证start/nextStart/eof真实且有进展，模型原call.input和已执行结果不可重写。即使每页缩小，累计内容仍可能超限；需要另行摘要/检索策略才能覆盖任意长任务。c2a续批已实现并完成本地验收，证据见当前任务research/m32c2/verification.md；不把c2a结果倒算为c1阶段的能力。


## 8. c1实施结果（2026-10-08）

证据位于当前Trellis任务research/m32c1/verification.md。Runtime43/App75/Workbench Agent222项通过，相关类型、隔离构建、边界与packed独立安装通过；Workbench全量测试类型报错来自其他窗口新增desktop-startup-window.test.ts:43，未改该文件。真实设置的桌面/390px、320px无横向溢出指标、键盘、错误反馈、模型重置、运行时禁用已检查；原生中文IME没有新增实机证据。

两次原应用真实提交：8192估算8428，已执行两工具但只51字符开场白并失败；16384仍估算8428，完成378字符中文回答，BEGIN-2746/MID-5083/END-9317与源文件独立核对一致。本轮无网络失败，不能据此称间歇连接问题根治或模型真实窗口已验证。原数据保留，加密密钥由应用恢复；连接现为16384/容量未知，验收后停用。旧失败Run不重试，复测是两个明确配置的新Run。原26条记录保留，新增专用4条验收记录，当前浏览器展示复测会话。

c1不实现c2、不删反馈、不改变External v1线协议；M32-A8的有界中文完整回答证据已补齐，任务因原生IME/后续规划保留in_progress，不归档。
