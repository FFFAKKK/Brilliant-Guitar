# Agent 验证与修复回执

日期：2026-09-21，Asia/Shanghai。
阶段：G3 Agent 验证缺口收口；同时处理 G6 的两行文档格式问题。
本文件与 `2026-09-21-agent-evidence.json` 是本阶段证据，不代表四线组合已经验收。

## 1. 隔离与交付

- 工作树：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/agent-verification-20260921`。
- 分支：`codex/agent-verification-20260921`。
- 固定基线：`fe546976d00a6f2a76da16efbfced4c852886bb1`。
- 修复提交：`8af822958df825d7811ea57655129ad9df0f7eb3`，直接以该基线为父提交。
- 本阶段没有合并、cherry-pick、rebase、push、修改 main、清理旧工作树或启动其他开发任务。
- 未创建 Trellis 任务；视觉任务不参与本阶段汇报。

只在独立工作树修复实际复现的问题，没有引入审批、持久化、工作流或插件激活的新架构。
源码修复与本回执分开提交；本回执的后续提交只含文档，不能称为重新执行过功能测试。

## 2. 基线与修复

基线工作树干净。27 个明确存在的测试文件运行结果是 180 项中 175 通过、5 失败。
生产和测试类型检查都失败，具体错误类别见 evidence JSON。

| 问题 | 本阶段处理 |
| --- | --- |
| Agent 中两个未使用的导入声明 | 仅删除实际阻挡类型检查的导入 |
| trusted-shell Provider facade 的参数被推断为隐式 any | 从 `AgentProviderHostPort` 方法类型派生参数类型；未改装配或 resolver 行为 |
| snapshot fixture 仍带已移除的 `enabled` | 移除过期字段，不恢复第二套插件启用状态 |
| range fixture 仍返回通用 capability envelope | 改为已有 typed port 的 `status: "ready"` 和 `data`；外层 invocation identity 断言保留 |
| measure index fixture 缺少 `ScoreReadPort` 其余方法 | 补全类型化测试端口；非预期读取直接抛错 |
| DirectScoreReadAgentPort fixture 仍传入旧 client | 改为直接传入 `ScoreReadPort`；保留禁止 legacy gateway 和 invocation identity 的断言 |
| dispose 后快照仍显示 ready/running 或旧 recovery items | 服务与订阅释放后，将快照复位为已有的 initial snapshot |

原有 5 项测试失败均由上述旧 fixture 导致，未通过放宽生产校验或删测试消除。
dispose 的实际缺口是快照残留，不是已经证实可以继续执行 Run。

生命周期补测在修复前为 19 项中 13 通过、6 失败，失败点均为销毁后的快照断言；
修复后这 19 项全部通过，且包含于主回归的 185 项，不重复计数。

## 3. 生命周期边界

- dispose 继续中止活跃 Run、释放 Provider 和订阅，并清空 listener。
- 快照复位为现有 `configuring`、未配置 Provider、空 recovery、`canStartRun: false`。
- 保留原来的 `beginRun() === null` 断言，另外验证 input、approval、retry continuation 与 resume 不能续跑。
- 新增 pending start/refresh、Provider replacement 成功及失败完成、旧订阅回调的回归，验证销毁后不重新发布状态。
- runtime 原有显式 `start()` 重建服务的行为保留；补测旧 generation 和旧 lease 不能干扰重启后的 Run。
- 没有增加公开 `disposed` 状态，也没有把 dispose 变成永久停用或改变固定会话权限。
- `AgentPluginSession`/assistant 的生命周期未扩展；这里的 runtime 重启回归不代表 assistant dispose 后也可复用。

异步 generation 防护原已存在，本次只补充其回归证据；唯一运行时行为改动是快照复位。

## 4. 提交后验证

以下均在修复提交 `8af822958df825d7811ea57655129ad9df0f7eb3` 上重新执行，
开始时工作树无 tracked/untracked 改动：

| 验证 | 结果 |
| --- | --- |
| `npm --prefix apps/workbench run typecheck` | exit 0 |
| `node apps/workbench/node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json` | exit 0 |
| 27 文件 Agent / measure reference / Score adapter / workflow 主回归 | 185 passed，0 failed，0 skipped |
| 8 文件 capability contract / conversation progress / disposal / platform 邻接回归 | 56 passed，0 failed，0 skipped |

35 个文件互不重复。目录中直接导入 `src/agent/` 的测试文件都在这两份清单内。
每次运行前逐一检查文件存在，避免 Node 忽略不存在路径后仍产生绿色结果。
完整参数、文件清单、TAP 文件哈希和环境版本记录于 evidence JSON。
TAP 原始日志位于工作树下被忽略的 `target/agent-verification/`，不纳入 Git 提交。

从本工作树根目录复跑指定集合：

```powershell
$evidence = Get-Content -Raw docs/integration/2026-09-21-agent-evidence.json | ConvertFrom-Json
foreach ($run in $evidence.verifiedRuns) {
  $files = @($run.testFiles)
  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing test: $file" }
  }
  node --experimental-strip-types --test --test-reporter=tap @files
  if ($LASTEXITCODE -ne 0) { throw "Failed suite: $($run.name)" }
}
```

依赖来自上一阶段工作树的独立目录复制，两个 lockfile 哈希一致；
未联网安装、升级依赖、使用目录 junction 或借用 Native addon。
`pretypecheck` 的 `prepare-kernel.mjs` 只生成 Workbench 隔离的 TypeScript host build，
不能当作 Rust 或 Native 构建证据。

没有执行 Workbench 全量、Desktop/Tauri、Rust workspace/Clippy、Native addon 重建、UI/E2E、
四线组合或多平台资格验证。当前 Score 服务仍来自 Agent 携带的旧基础，不能套用 Score
`717cdc0` 的 97/97 或 572/572 历史结果。

## 5. 保留与格式处理

以下文件与 `fe54697` 完全一致，已用 `git diff --exit-code` 验证：

- `apps/workbench/test/agent-action-runtime.test.ts`。
- `apps/workbench/test/agent-run-core.test.ts`。
- `apps/workbench/test/agent-workflow-runtime.test.ts`。
- `apps/workbench/test/agent-prepared-mutation.test.ts`。
- `docs/agent-typed-port-orchestration-boundary-v1.md`。

公共 contracts 目录与三个 Score service 也未修改。
`docs/agent-plugin-ownership-and-assembly-plan-v1.md` 仅将第 3、4 行两个尾随空格
改为 Markdown 的反斜杠硬换行；保留文字、历史状态及其余内容，不重写设计决策。
G6 原有的相对共同基线 diff-check 阻挡由此消除。

## 6. 后续集成约束

本阶段关闭 G3 的 Agent 候选验证缺口及 G6 格式问题，不关闭组合验收。

- B2 重放到 `fe54697` 后，可评估追加本阶段修复增量；公共基础仍按准备清单去重。
- 此处 fixture 适配已经覆盖原 B5 的对应旧 fixture 问题，不从 `7d93aa8` 重复整文件搬入。
- `score-read-port.test.ts` 仅适配 Agent 消费端；后续必须与 Score `3d71f63 -> 8ece0f3 -> 717cdc0` 的完整测试合并，不能以本阶段旧基础覆盖加固。
- host adapter 的类型注解与 G1 修复存在交集；最终仍需平台 resolver 的正式接线和唯一身份来源，不能回退为此处尚未接入 resolver 的旧宿主实现。
- 保留完整 Agent 回归及两份边界文档，不能整体应用混合提交 `7d93aa8`。
- G4 Kernel 文档校正、G5 组合源码 Native 重建与来源证据仍未完成；G4 也可继续暂缓文档。
- 后续批次、四线组合和 main 晋升仍需按阶段汇报，不自动开始。

main 及四条交付分支的引用未移动，上一阶段准备/平台修复分支也未改动。
主目录仍有原来的 32 个未提交文件、空 index；内容清单 SHA-256 仍为
`a71349a256d3390fcdb869f173aac5cc820879eae3f58f2103bb6ec58d9fbcfa`。
本阶段完成后停止，等待用户确定下一阶段。
