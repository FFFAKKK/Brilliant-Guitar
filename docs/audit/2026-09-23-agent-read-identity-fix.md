# Agent 读取文档身份修复阶段报告

日期：2026-09-23（Asia/Shanghai）

修复分支：`codex/agent-read-identity-fix`

修复提交：`79a1756 fix(workbench): bind Agent reads to document identity`

## 修复内容

第五、六阶段确认的共同根因是：传输身份、类型字段合同和文档范围分别校验，`documentPrecondition` 没有贯穿读取端口、Agent 入口和完成验证。

本阶段在 `apps/workbench/src/contracts/capability.ts` 增加一份共享文档身份匹配规则，并接入已有边界：

- `ScoreReadPort` 可接收调用时的文档前置条件，summary、metadata、structure 和 bounded read 复用类型化结果检查。
- `DirectScoreReadAgentPort` 将 request/context 身份传给读取端口，并再次保护自定义 typed port 返回值。
- `ApplicationCapabilityGateway` 和 `WorkbenchAgentCapabilityPort` 对带文档身份的完成结果固定文档 ID；写操作允许正常推进版本。
- `AgentRunController` 在写入上下文和 workspace 前先检查返回结果的文档归属，并在 invocation 中保存发起时的 `documentPrecondition`。
- 只读完成验证使用 invocation 发起时的身份，避免后续 workspace 变化掩盖错误结果。
- 工作树宿主的 scoped score read binding 转发身份参数。

现有旧记录没有 `documentPrecondition` 字段时仍可解码；新 invocation 会持久化该字段。没有修改 Kernel 历史、Plugin Resolver、外部接口版本或数据文件 schema 版本。

## 测试

```text
Workbench production TypeScript: pass
Workbench test TypeScript: pass
Workbench full tests: 622 passed, 0 failed
Focused Agent/Plugin/Score set: 229 passed, 0 failed
```

新增回归覆盖：

- summary 读取返回其他文档时被 typed read 拒绝；
- Direct Agent port、通用 Agent port 和 Gateway 拒绝错文档结果；
- Run controller 不把错文档结果写入 context/workspace；
- completion verifier 拒绝与 invocation 前置条件不一致的结果；
- 写操作 `documentVersion: 7 -> 8` 仍按既有 ChangeSet/事务规则通过。

全量测试使用当前 main 已验证的 `.kernel`、native addon 和前端依赖目录作为隔离 worktree 的只读测试环境；没有改写这些产物。

## 交付状态

- 修复 worktree：`C:\Users\ATOM\.codex\worktrees\agent-read-identity-fix\brilliant_guitar`
- 工作树：干净
- `main`：未修改，仍为 `eae40757681a3aa6810ee63ac70ea8f880687994`
- 未执行 merge、rebase、push 或 amend
