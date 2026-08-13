# CVN-7 Core VNext Final Qualification Design

## 1. 设计目标

CVN-7 是一个只读消费已接受 Core 行为的 qualification layer。它增加测试、runner、证据和最终规范同步，不形成新的运行时层，不进入 application assembly，也不拥有谱面状态。

```text
accepted Core VNext source at approved baseline
  -> deterministic qualification fixtures
  -> functional and contract matrix
  -> isolated benchmark/stress workers
  -> evidence validators
  -> independent technical review
  -> Core VNext acceptance/archive
  -> post-Core planning handoff
```

任何 functional failure 都先停止后续性能结论。性能数据从失败行为产生时只保留为诊断，不形成资格通过证据。

## 2. Authority hierarchy

冲突时按以下顺序处理：

1. `feature-contract-matrix.md` 的实际 44 个 `CVN-FC` 行；
2. CVN-7 `prd.md` 对 fixture、采样、evidence 和 failure routing 的闭合；
3. accepted active Core specs；
4. 各归档 child 的 accepted PRD/design/review；
5. parent PRD/design/implement 与 durable roadmap；
6. post-Core roadmap 只负责 Core 关闭后的消费顺序。

CVN-7 发现上层 authority 内部冲突时先修父合同并重新规划复审，不由 runner 猜测。

## 3. Qualification components

未来实施新增以下测试侧组件：

### 3.1 Deterministic generator

`test/core-kernel/fixtures/cvn-7-qualification-score.ts`

职责：

- 接收 `{ fixtureKind: "representative" | "stress", generatorVersion: 1, seed: string }`；
- 仅用整数循环、固定字符串模板和 frozen 常量生成 `ScoreDocument` plain data；
- 返回 document、canonical entity counts、canonical address lists、first/last target addresses；
- 生成结束后执行独立 count/uniqueness/coverage assertions；
- 两次相同输入必须 `deepStrictEqual`；
- generator 不调用 runtime、clock、random、filesystem 或 environment。

ID 模板：

```text
score:   cvn7-{kind}-score
measure: cvn7-m-{measureIndex:04}
part:    cvn7-p-{partIndex:02}
staff:   cvn7-s-{partIndex:02}
voice:   cvn7-v-{partIndex:02}-{measureIndex:04}-{voiceIndex:01}
event:   cvn7-e-{partIndex:02}-{measureIndex:04}-{voiceIndex:01}-{eventIndex:01}
note:    cvn7-n-{partIndex:02}-{measureIndex:04}-{voiceIndex:01}-{eventIndex:01}
```

索引均从 0 开始并使用固定宽度。Notes Event 的 Note ID 与 Event ID 一一对应；Rest 没有 Note。每个 Voice 的八个 `1/8` Event 总时值精确为 4/4。

### 3.2 Synthetic official modules

`test/core-kernel/fixtures/cvn-7-qualification-modules.ts`

固定 identity：

| Role | moduleId | contributionId | commandId | effectKind | namespace |
|---|---|---|---|---|---|
| score | `fixture.cvn7.score.module` | `fixture.cvn7.score.contribution.v1` | `fixture.cvn7.score.apply` | `fixture.cvn7.score.replace` | `fixture.cvn7.score` |
| part | `fixture.cvn7.part.module` | `fixture.cvn7.part.contribution.v1` | `fixture.cvn7.part.apply` | `fixture.cvn7.part.replace` | `fixture.cvn7.part` |

规则：

- 输入 registration entry order 固定为 score 后 part，用于覆盖 compiler order-independence；编译后的 catalog 和 callback trace 必须遵循 accepted CVN-2 lexical canonical order，即 part 后 score；
- 两个 contribution 都使用 accepted 九字段 ABI；
- 每个 command 请求两个有序 forward effects：一个 WrittenPitch replacement，随后一个自有 ExtensionBlock replacement；
- score command 拥有 score block，目标为 canonical first Note；
- part command 拥有最后一个 Part 的 block，目标为该 Part canonical first Note；
- validator/classifier 只读取 detached compatible view；
- trace 使用纯字符串数组，仅在测试 fixture 内暴露 reset/read 方法；
- schema versions 固定 `[1]`，required-for-write 为 true；
- known-requirement inventory 顺序与 catalog canonical order 一致。
- fixture 只对 Core/SDK 使用 `import type`；运行时 definition factory 接收 worker 从所选 `buildRoot` 加载的 SDK API object，避免 baseline sample 静态绑定 candidate SDK。

### 3.3 Qualification contracts

`test/core-kernel/qualification/cvn-7-qualification-contracts.ts`

定义测试侧 data-only 类型：

- `QualificationEnvironmentV1`
- `QualificationBuildManifestV1`
- `QualificationCaseTraceV1`
- `QualificationFixtureReportV1`
- `QualificationBenchmarkSampleV1`
- `QualificationBenchmarkOperationV1`
- `QualificationStressReportV1`
- `QualificationSummaryV1`

这些类型不从 application root 导出，不进入 `src/**`，也不改变 Core 公共 API。

### 3.4 Worker

`test/core-kernel/qualification/cvn-7-worker.ts`

Worker 每次只执行一个 action：

```text
fixture-verify
functional-case
latency-sample
memory-sample
stress-submit
stress-replay
build-probe
```

输入通过一个 UTF-8 JSON request file 传入，输出一个 UTF-8 JSON result file。Request exact keys：

```ts
interface QualificationWorkerRequestV1 {
  readonly schemaVersion: 1;
  readonly action: QualificationWorkerAction;
  readonly buildRoot: string;
  readonly fixture: "representative" | "stress";
  readonly operation?: QualificationOperation;
  readonly phase: "warmup" | "measured" | "memory" | "functional";
  readonly sampleIndex?: number;
}
```

Coordinator 生成 request；worker 不接受自由拼接的 module path 或 shell fragment。`buildRoot` 必须是 coordinator 已解析并登记的 baseline/candidate dist root。输出只含稳定数据；异常转换为 `{ status: "failed", failureKind, phase }`，raw stack 进入本地临时诊断文件而非 tracked evidence。

Worker 使用 `createRequire` 从登记的 `buildRoot/dist/src/core-kernel/index.js` 和 `buildRoot/dist/src/core-kernel/module-sdk/index.js` 加载运行时。Qualification worker、generator 和 module fixture 对 production API 只保留 type-only imports；任何指向 candidate `src/**` 或 candidate `dist/src/**` 的静态 runtime import 由 boundary test 拒绝。

### 3.5 Coordinator

`test/core-kernel/qualification/cvn-7-runner.ts`

职责：

1. 验证 baseline/candidate commit 和 clean build manifest；
2. 验证 environment；
3. 执行 functional gate；
4. 执行 fixture count gate；
5. 按交替顺序启动 warm-up 与 measured workers；
6. 计算 median、nearest-rank P95、ratio；
7. 独立执行 memory workers；
8. 执行 stress submit/replay；
9. 生成 evidence JSON；
10. 调用 evidence validator；
11. 生成 qualification summary。

Official blocking evidence 只由一次 `--mode all` 运行产生。Coordinator 在创建任何临时输出或启动 worker 前验证 baseline、candidate、harness commit 和两个 worktree 都 clean。所有中间输出写入 worktree 外的 OS 临时目录 `%TEMP%/cvn7-qualification/<harnessCommit>/<runId>/`；只有全部 mode 完成且 validator 通过后，才把完整集合原子发布到 task-local `evidence/`。发布后不再启动 worker；`evidence/` 变化作为下一次 measurement commit 的精确 allowlist，不被伪装成 clean input。

固定 process-liveness timeout 不是 latency/resource qualification budget：functional/fixture worker 为 `1,800,000 ms`，每个 latency 或 memory sample worker 为 `600,000 ms`，stress submit worker 与 stress replay worker各为 `10,800,000 ms`。超时后 coordinator 给予 `5,000 ms` 终止宽限，再终止该 worker process tree；任一 timeout 使整次运行成为 `EVIDENCE_INVALID`，不产生任何 `NOT_QUALIFIED_*` 性能结论，也不发布 partial evidence。改变这些 liveness timeout 属于 evidence-method/schema 变更，必须重新规划复审；它们不为 stress latency 创建绝对预算。

### 3.6 Evidence validator

`test/core-kernel/qualification/cvn-7-evidence-validator.ts`

Validator 负责：

- exact-shape JSON decode；
- schema/version/task/commit 一致性；
- operation 集合 exact；
- sample count `20`、warm-up count `5`；
- sample index `0..19` 无重复无缺口；
- median/P95 重算相等；
- ratio 重算相等；
- environment-match 与 absolute-budget 判定一致；
- fixture counts exact；
- stress equality 与 RSS limits；
- build manifest sorted/unique/hash-valid；
- trace contract set 等于父矩阵 44 行；
- failed/invalid evidence 无 `qualified: true`。

## 4. Fixture shape

### 4.1 Score structure

每个 fixture：

- metadata 固定 title、author、tempo 120；
- measure definitions 按 numeric index 顺序；
- parts 按 numeric index 顺序；
- 每 Part 的 measureContents 与 measureDefinitions 一一同序；
- Staff lineCount 5、G clef line 2；
- Voice 0/1 都使用同一 Part Staff；
- Voice start 为 `0/1`；
- event durations 为 `{ base: 8, dots: 0 }`；
- Notes written pitch 初始统一 C4；
- score/Part extension payload 固定 `{ marker, generatorVersion: 1 }`；
- unknown opaque extension 另加一个 score-owned namespace `fixture.cvn7.unknown`，用于 lossless preservation；它不进入 known inventory。

### 4.2 Count formulas

Representative：

```text
Measure = 200
Part = 8
Staff = 8
PartMeasureContent = 200 * 8 = 1,600
Voice = 200 * 8 * 2 = 3,200
Event = 200 * 8 * 2 * 8 = 25,600
Note = Event / 2 = 12,800
known ExtensionBlock = 1 score + 8 part = 9
unknown ExtensionBlock = 1
```

Stress：

```text
Measure = 400
Part = 16
Staff = 16
PartMeasureContent = 400 * 16 = 6,400
Voice = 400 * 16 * 2 = 12,800
Event = 400 * 16 * 2 * 8 = 102,400
Note = Event / 2 = 51,200
```

### 4.3 History workload

- Representative long history：对 canonical first Note 在 C4/D4 间交替 2,000 次；每次输入相对当前值 changed。
- Stress：对 canonical Note list 按 `commandIndex % noteCount` 选目标；目标值按每个 Note 的访问轮次在 C4/D4 间交替，确保 10,000 次全部 committed。
- Envelopes 在提交前生成并 freeze；replay 使用相同 detached list。
- 提交 status sequence 必须全为 `committed`；replay status sequence 与 live deep equal。

## 5. Functional qualification design

### 5.1 Existing accepted regression

CVN-7 不编辑既有测试以制造通过。它运行整个 accepted suite，并用 trace manifest 引用 exact case title。

### 5.2 New cross-stage cases

新增资格测试只证明跨阶段组合与最终计数：

- `cvn-7-public-baseline.test.ts`：28 commands、51 runtime exports、SDK 8/34、ABI 9、schema exact；
- `cvn-7-contract-trace.test.ts`：44 FC rows exact trace；
- `cvn-7-end-to-end.test.ts`：factory→integrated assembly→mixed batch→read→undo→redo→replay→migration；
- `cvn-7-fixture-counts.test.ts`：representative/stress exact counts 与 deterministic generator；
- `cvn-7-representative-history.test.ts`：2,000 committed entries、read/history/checkpoint/dirty/event；
- `cvn-7-qualification-boundary.test.ts`：production zero-drift、forbidden dependencies、evidence codec、scope exclusions。

Scale latency/stress runner 不命名为 `*.test.ts`，避免普通 `npm test` 隐式执行重型 benchmark。功能和 fixture 结构 tests 进入 full suite；benchmark/stress 由显式 script 执行。

## 6. Exact benchmark operations

| ID | Timed region | Setup outside timer | Required postcondition |
|---|---|---|---|
| `submit-single` | one `bus.submit` | representative integrated bus | committed, version 1 |
| `undo-single` | one `bus.undo` | one committed submit | committed, initial encoded doc |
| `redo-single` | one `bus.redo` | submit then undo | committed, changed encoded doc |
| `read-cached` | second `bus.read` | first read creates cache | same frozen snapshot identity |
| `snapshot-first` | first `bus.read` | fresh bus only | full frozen detached snapshot |
| `batch-100` | one outer batch submit | 100 frozen changed child envelopes | one version/history/event |
| `replay-100` | `replayKernelCommands` for 100 envelopes | fresh compatible assembly | final doc/status equality |
| `construct-integrated` | factory decode/result check + integrated bus construction | raw input, compiled catalog/inventory | created ready bus, availability complete |

No timed region includes fixture generation, TypeScript compilation, catalog compilation, evidence serialization, process spawn or module import.

## 7. Baseline/candidate isolation

### 7.1 Frozen baseline

- Baseline commit：`38afdc3fd508dc67f7aa446fd323837a5d550b70`。
- Baseline worktree：`.worktrees/cvn-7-accepted-baseline`，detached。
- Candidate worktree：`.worktrees/cvn-7-core-vnext-final-qualification`。
- 两侧使用各自的 clean `dist/`，不得共享 build output。
- 两侧 `package-lock.json` SHA-256 必须相等。
- Qualification harness 由 candidate 构建一次；worker 的 `buildRoot` 决定加载 baseline 或 candidate application build。
- Baseline samples加载 baseline root 与 SDK；candidate samples加载 candidate root 与 SDK。Harness module cache key包含绝对 resolved build entry，且每个 sample 位于 fresh process，因此不存在跨 build runtime cache 复用。

### 7.2 Evidence publication and commit identity

- Stage 1..5 的 qualification contracts、fixtures、tests、runner 与 validator 全部提交后，冻结 `candidateCommit` 和 `harnessCommit`；official run 期间这两个 commit 不再变化。
- Stage 6..8 是 `--mode all` 内的命名子门，不各自发布 tracked evidence。Stage 9 执行唯一 official `--mode all` invocation，并在结尾一次发布全部 JSON。
- 发布后的 tracked `evidence/**` 被单独提交为 measurement commit。该提交只封装结果，不改变 evidence header 中已冻结的 candidate/harness build input，也不触发第二次 measurement。
- Stage 10 authority sync 只能引用该 measurement commit 的 evidence hashes；Stage 11 在 measurement 与 authority-sync commits 后从 clean worktree 做最终验证。
- 若 official run invalid，外部临时目录保留本地诊断，task-local final evidence 不变。若必须重跑，先记录 invalid reason，恢复到同一 frozen harness commit 的 clean 状态，再整次运行；不得从分阶段输出拼装结论。

### 7.3 Source repair invalidation

若 repair 改变 `src/**`：

1. repair task 独立接受归档；
2. parent 记录新的 unified baseline；
3. CVN-7 task 更新 `qualification_base_commit`；
4. 删除旧 final evidence 的 qualified 状态并移入 `evidence/superseded/`；
5. 重新构建两侧并重跑全部 blocking gates；
6. 再申请独立技术复审。

## 8. Evidence schema

所有 evidence JSON 公共头：

```ts
interface QualificationEvidenceHeaderV1 {
  readonly schemaVersion: 1;
  readonly taskId: "cvn-7-core-vnext-final-qualification";
  readonly qualificationBaseCommit: string;
  readonly candidateCommit: string;
  readonly harnessCommit: string;
  readonly generatedAtUtc: string;
}

interface QualificationFixtureProvenanceV1 {
  readonly generatorVersion: 1;
  readonly fixtureKind: "representative" | "stress";
  readonly seed: string;
}
```

`generatedAtUtc` 只用于 provenance，不参与排序、结果或 hash。`fixtureProvenance` 只存在于实际构造 representative/stress fixture 的 functional、benchmark、memory 和 stress artifacts；environment、build manifest、contract trace 与 qualification summary 不伪造 generator/seed。所有结果数组按预定义 enum order；所有地址按 Core canonical order；所有文件按 `/` 分隔的 relative path 排序。

Benchmark operation record：

```ts
interface QualificationBenchmarkOperationV1 {
  readonly operation: QualificationOperation;
  readonly warmupCount: 5;
  readonly measuredCount: 20;
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly pairs: readonly QualificationBenchmarkPairV1[];
  readonly baselineMedianMs: number;
  readonly baselineP95Ms: number;
  readonly candidateMedianMs: number;
  readonly candidateP95Ms: number;
  readonly medianRatio: number;
  readonly p95Ratio: number;
  readonly portableRatioPassed: boolean;
  readonly absoluteBudgetMs: number;
  readonly absoluteBudgetApplied: boolean;
  readonly absoluteBudgetPassed: boolean | null;
}

interface QualificationBenchmarkPairV1 {
  readonly pairIndex: number; // exact dense range 0..19
  readonly invocationOrder:
    | "baseline-then-candidate"
    | "candidate-then-baseline";
  readonly baselineDurationMs: number;
  readonly candidateDurationMs: number;
}
```

`pairIndex` 偶数使用 `baseline-then-candidate`，奇数使用 `candidate-then-baseline`。Validator 从 20 个 pair records 重建两侧 invocation-order samples，再用独立 sorted copies 计算 aggregates；分离的无顺序 sample arrays 被拒绝。

## 9. Qualification decision

Runner 子门可以使用下列非最终状态，但它们始终携带 `qualified: false`：

```text
REFERENCE_GATE_PASSED_PENDING_STRESS
BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW
```

Final summary 只允许：

```text
QUALIFIED
NOT_QUALIFIED_FUNCTIONAL
NOT_QUALIFIED_DETERMINISM
NOT_QUALIFIED_RESOURCE
NOT_QUALIFIED_PORTABLE_PERFORMANCE
NOT_QUALIFIED_REFERENCE_PERFORMANCE
EVIDENCE_INVALID
REFERENCE_ENVIRONMENT_PENDING
```

`REFERENCE_ENVIRONMENT_PENDING` 表示本地/CI 环境与 exact reference environment 不一致，其余阻断门均通过；Core VNext final acceptance 仍等待 reference run。它不是 qualified 状态。

`QUALIFIED` 只能在 functional、portable、exact reference、stress、resource、determinism、build/trace validators 全部通过，并且 independent technical review P0/P1/P2=`0/0/0` 已被记录后生成。Stage 8 reference pass 只能产生 `REFERENCE_GATE_PASSED_PENDING_STRESS`；Stage 9 全部 blocking evidence pass 只能产生 `BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW`。

## 10. File ownership

### 10.1 Planning candidate allowlist

- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/**`
- Core VNext parent `task.json`、`implement.md`、`feature-contract-matrix.md`、`documentation-sync-matrix.md`、durable roadmap；
- `.trellis/spec/core-kernel/backend/index.md` 的 planning-status 投影；
- 产品父任务中一处 current delivery status 投影（若编码保持原文件格式）；
- post-Core task files 为 read-only authority，规划差异保持零。

### 10.2 Future implementation allowlist

新增文件：

```text
test/core-kernel/fixtures/cvn-7-qualification-score.ts
test/core-kernel/fixtures/cvn-7-qualification-modules.ts
test/core-kernel/qualification/cvn-7-qualification-contracts.ts
test/core-kernel/qualification/cvn-7-contract-trace.ts
test/core-kernel/qualification/cvn-7-worker.ts
test/core-kernel/qualification/cvn-7-runner.ts
test/core-kernel/qualification/cvn-7-evidence-validator.ts
test/core-kernel/cvn-7-public-baseline.test.ts
test/core-kernel/cvn-7-contract-trace.test.ts
test/core-kernel/cvn-7-end-to-end.test.ts
test/core-kernel/cvn-7-fixture-counts.test.ts
test/core-kernel/cvn-7-representative-history.test.ts
test/core-kernel/cvn-7-qualification-boundary.test.ts
.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-010-product-quality.md
```

允许修改：

```text
package.json                         # 仅新增 qualification scripts
.trellis/spec/core-kernel/backend/** # 仅最终 accepted status/evidence 同步
.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/**
.trellis/tasks/08-11-post-core-official-plugin-product-roadmap/** # 仅 CVN-7 归档后的 activation-state handoff
.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/**
```

保护路径：

```text
src/**
package-lock.json
tsconfig.json
openspec/**
所有既有 test/**/*.ts
所有归档 task（CVN-7 自身未来归档移动除外）
```

新增文件超出 allowlist 或需要编辑保护路径时，先返回规划复审。

## 11. Failure routing and rollback

- Harness/test/evidence defect：只回滚 CVN-7 qualification commit，accepted Core 不变。
- Functional defect：创建 owner-specific repair task；CVN-7 保留 failing evidence reference，不在当前提交修改生产源码。
- Performance defect：保留原始 samples 和环境；先证明 bottleneck owner，再创建 bounded performance repair task。
- Environment mismatch：保留 environment evidence，安排 exact reference run，预算不变。
- Evidence codec/trace mismatch：标记 `EVIDENCE_INVALID`；修 runner/manifest、重新冻结 candidate/harness inputs 并恢复 clean 后，完整重跑唯一 `--mode all`。禁止局部重跑、复用或拼装旧 per-mode/partial output。
- 任一 budget/fixture/sample-method 变更：父合同复审、用户批准、新 schemaVersion 或 generatorVersion，并完整重跑。

## 12. Product boundary

CVN-7 结束的是 generic Core VNext，不是完整打谱产品。其完成后只解锁 post-Core 第一个规划动作：Official Guitar Domain V1。Layout、Renderer、Playback、Persistence、Export、Workbench、Application Assembly 和公共插件平台继续由 post-Core roadmap 的独立 child 拥有。
