# 第六小阶段审计：类型化读取端口的文档身份边界

日期：2026-09-23（Asia/Shanghai）

范围：沿第五阶段确认的 Agent 读取身份问题，继续检查 `ScoreReadClient`、直接 Agent 读取端口和已有的 `documentPrecondition` 是否在更低层被执行。不修改生产源码，不使用子代理，不启动产品 GUI，不访问真实作品、Provider、系统凭据或外部服务。

## 结论

1. **补强第五阶段 P2：身份缺口存在于类型化读取端口，不只是最终完成验证。** `ScoreReadClient.readSummary()` 可以接受属于 `other-score@99` 的合法概要结果；随后 `DirectScoreReadAgentPort` 在请求明确要求 `score-1@7`、context 也明确是 `score-1@7` 时，仍将该结果包装为 `completed`。
2. **不是所有读取边界都同样缺失。** `readMeasureIndex` 已通过输入中的 `expectedDocumentId/expectedDocumentVersion` 做结果匹配，`readMeasureRange` 已检查范围边界和数量；本阶段没有把这些已有约束误报成新问题。
3. **共同根因进一步收敛。** `CapabilityTransportRequest.documentPrecondition`、`AgentCapabilityInvocationContext.workspace` 与 `ScoreReadClient` 的 `workspaceId` 目前是三套彼此未统一的身份输入。summary、metadata、structure 没有身份检查，Direct Agent port 还忽略调用上下文，最终才由完成验证和 workspace 投影继续放大影响。

第六阶段新增复现 **2/2**，相关 Workbench 用例 **62/62**，测试类型检查通过。通过表示现有边界行为可重复，不表示缺陷已修复。

## 证据

工作树：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`

生产基线：`eae40757681a3aa6810ee63ac70ea8f880687994`

可提交证据：`docs/audit/evidence/stage6-20260923/`

运行：

```powershell
node docs/audit/evidence/stage6-20260923/typed-read-identity.test.mjs
```

关键结果：

```text
ScoreReadClient.readSummary(): ready, other-score@99
DirectScoreReadAgentPort.invoke(): completed, other-score@99
request.documentPrecondition: score-1@7
context.workspace: score-1@7
```

复现直接导入生产 `ScoreReadClient` 和 `DirectScoreReadAgentPort`。宿主返回的是合法 `ScoreSummaryV1`，没有伪造 transport identity；唯一冲突是返回文档身份与请求前置条件不同。

相关生产位置：

- `apps/workbench/src/services/score-read-port.ts:28-35`：summary、metadata、structure 的读取方法没有接收或绑定 document precondition。
- `apps/workbench/src/services/score-read-port.ts:66-145`：Client 只固定 `workspaceId`；只有 bounded index/range 路径做了各自的结果约束。
- `apps/workbench/src/agent/direct-score-read-agent-port.ts:52-81`：`context` 参数被命名为 `_context` 且未参与身份检查，typed result 直接被包装。
- `apps/workbench/src/agent/capability-port.ts:31-43`：通用 Agent port 仅检查 invocation/capability/contract 三类传输身份。
- `apps/workbench/src/agent/run-controller.ts:920-925`：控制器已经生成 `documentPrecondition`，但它没有贯穿到 direct typed read。

## 根因与影响

当前系统同时存在三层合同：

1. transport identity：确认结果属于哪个 invocation/capability/contract；
2. typed data shape：确认结果有合法的 documentId/version 字段；
3. document scope：确认结果属于当前 workspace/request 的文档。

前两层已有实现，第三层没有成为共享合同。于是 summary/metadata/structure 的合法错文档结果可以：

- 穿过 `ScoreReadClient`；
- 穿过 `DirectScoreReadAgentPort`；
- 被 `WorkbenchAgentCapabilityPort` 视为合法返回；
- 最终被第五阶段发现的完成验证和 workspace 投影当作当前任务结果。

这不是需要在每个读取方法里复制同一段判断的信号，而是读取端口缺少一个统一的“请求身份与结果身份匹配”职责。已有 bounded read 的局部约束应保留为范围/选择验证，不应再复制一份。

## 建议的统一修复面

1. 把文档身份匹配放在一个共享的 read-result boundary，输入同时明确 workspace/document precondition；summary、metadata、structure 和已有 bounded reads 复用它。
2. 让 direct Agent port 使用已有 request/context 身份，而不是新增第二套 Agent 专用 workspace 解析。
3. 让完成验证和 workspace/context 投影消费同一份已验证身份结果；读取端口拒绝错身份后，完成验证不再承担宿主路由校验职责。
4. 对首次读取时没有 document precondition 的情况保留现有初始化语义，但结果建立身份后必须成为后续请求的前置条件。迁移前要核对旧恢复记录和所有宿主装配。
5. 不为 summary、metadata、structure 分别增加开关，不修改 Kernel 历史，不新增 Plugin 包装层；修复后将本阶段 characterization test 改为“错身份被拒绝”的回归测试。

## 验证

```text
node docs/audit/evidence/stage6-20260923/typed-read-identity.test.mjs
2/2 passed

node --experimental-strip-types --test --test-reporter=spec \
  test/score-read-port.test.ts test/score-measure-index-port.test.ts \
  test/measure-reference-capability-port.test.ts test/agent-action-runtime.test.ts \
  test/agent-run-core.test.ts test/agent-assistant-session.test.ts
62/62 passed

node node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json
exit 0
```

已有 index/range 的通过用例证明本阶段没有要求删除其具体范围合同；统一修复应在保留这些业务约束的同时，补上它们与共享文档身份合同的连接。

## 阶段边界

本阶段只新增审计报告、复现说明和 characterization test，未修改生产实现、锁文件、配置或 main。第五、六阶段应作为同一个“读取结果身份不变量”修复面汇总，不应拆成多个按能力 ID 的补丁。本阶段完成后停止，等待统一审计汇总和修复授权。
