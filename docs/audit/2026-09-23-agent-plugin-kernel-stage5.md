# 第五小阶段审计：Agent 读取完成与文档身份边界

日期：2026-09-23（Asia/Shanghai）

范围：核查 Agent、Plugin 与 Kernel/宿主边界中，读取结果是否绑定到当前任务的 workspace/document 身份；同时复核此前报告中 Resolver 身份覆盖问题在当前基线是否仍存在。本阶段不修改生产源码，不使用子代理，不启动产品 GUI，不访问真实作品、Provider、系统凭据或外部服务。

## 结论

1. **确认 P2：Agent 的只读完成验证没有绑定请求文档身份。** 一个字段完全符合 `ScoreSummaryV1`、传输身份也正确，但属于 `other-score@99` 的返回值，当前 `verifyScoreSummaryCompletion` 仍判定任务完成。该问题是跨宿主、迟到或错误路由结果的防线缺失；本阶段没有证据表明当前 Kernel 读命令已经实际返回了错误文档。
2. **未复现此前的 Resolver 身份覆盖问题。** 当前 `TrustedPluginHostBindingsResolver` 由冻结 grant 生成最终 `plugin.id/version`，调用方版本只用于一致性校验；相关 3 个插件绑定用例通过。该项不应在修复阶段重复加判断或重写 Resolver。

新增复现 **2/2**，Agent/Plugin 相关现有测试 **49/49**，Workbench 测试类型检查通过。通过表示当前基线行为可重复，不表示缺陷已修复。

## 证据

工作树：`C:\Users\ATOM\.codex\worktrees\e610\brilliant_guitar`

生产基线：`eae40757681a3aa6810ee63ac70ea8f880687994`

可提交证据：`docs/audit/evidence/stage5-20260923/`

运行：

```powershell
node docs/audit/evidence/stage5-20260923/completion-identity.test.mjs
```

输出中的关键结果：

```text
sameDocument.satisfied = true
differentDocument.satisfied = true
differentDocument.evidence = ["inv-summary", "other-score@99"]
```

复现调用的是生产 `verifyScoreSummaryCompletion`，不是复制实现。两次输入都使用相同的 invocation/transport identity 和合法的 `ScoreSummaryV1`；唯一关键差异是返回数据的 `documentId/documentVersion`。

相关生产位置：

- `apps/workbench/src/agent/completion-verifier.ts:37-64`：`AgentCompletionInput` 没有 workspace/document precondition；通用只读验证只检查结果形状并记录结果身份。
- `apps/workbench/src/agent/run-controller.ts:694`：调用完成验证时只传入 `goal`、`contextItems` 和 `invocations`。
- `apps/workbench/src/agent/run-controller.ts:1043`：能力结果被接受后，控制器直接把结果中的文档身份写回当前 workspace。
- `apps/workbench/src/plugins/plugin-host-bindings.ts:184`：当前 Resolver 从 frozen grant 生成最终插件身份。
- `apps/workbench/src/services/workbench-agent-plugin-host.ts:80`：调用方 `pluginVersion` 只参与与 frozen grant 的相等性校验。

## 根因与影响

Agent 的传输层合同校验了 `invocationId`、`capabilityId` 和 `contractVersion`，能力数据校验器校验了 `documentId`、`documentVersion` 等字段的类型和值域，但“这个结果是否属于本次请求的文档”没有进入完成验证输入。结果身份反而在验证后被当作新的 workspace 身份，因此一个合法但错文档的读取结果可以同时：

- 使只读任务被标记为完成；
- 作为高信任 context item 保存；
- 推进 Agent 当前 workspace 到另一个文档/版本。

这是 Agent 读取验证、宿主能力边界和 workspace 身份管理的同一个身份不变量，不应按 summary、metadata、structure、measure range 分别添加分支，也不应在 Plugin 层复制一套文档校验。

## 建议的统一修复面

1. 将当前 run 的 workspace/precondition 身份带入一个共享的只读结果验证入口；有明确 document precondition 时，要求结果 `documentId` 和 `documentVersion` 与其一致。
2. 让完成验证和 context/workspace 投影复用同一身份结果，不允许“验证未绑定、投影却接受”的两套逻辑并存。
3. 对无当前文档身份的首次读取保留现有初始化语义；一旦结果建立 workspace 身份，后续读取必须使用该身份。具体迁移应先核对旧的恢复记录和跨宿主合同，再把本阶段字符化断言改成失败断言并迁入现有 Agent 测试。
4. 不修改 Kernel 历史，不新增 Plugin 包装层，不保留按能力 ID 分散的兼容开关。

## 验证

```text
node docs/audit/evidence/stage5-20260923/completion-identity.test.mjs
2/2 passed

node --experimental-strip-types --test --test-reporter=spec \
  test/agent-run-core.test.ts test/agent-evaluation.test.ts \
  test/agent-recovery.test.ts test/plugin-host-bindings.test.ts \
  test/plugin-platform-bootstrap.test.ts
49/49 passed

node node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json
exit 0
```

现有测试覆盖了 Agent run/recovery、Plugin binding 和 startup bootstrap；它们没有覆盖“合法但属于其他文档的只读结果”这一边界，所以没有把缺陷提前暴露出来。

## 阶段边界

本阶段只新增审计报告、复现说明和 characterization test，未修改生产实现、锁文件、配置或 main。修复应等审计汇总后，在单独、职责明确的 Agent/Workbench 边界工作树中完成；本阶段不自动合并 main，也不宣称整体审计已经结束。
