# Core VNext Refactor Assessment

## Verdict

Core VNext 需要一次 **范围较大的、行为保持型内核脊柱重构**，但现有证据不支持整套 Core 推倒重写，也不支持把所有新能力与重构合并成一次 big-bang 交付。

推荐顺序：

1. 冻结 Core V1 characterization traces；
2. 独立重构 command/transaction/Registry 内部接缝，保持公共行为深度相等；
3. 独立验收该重构；
4. 再分门禁增加 document/measure、Part/Staff/Voice、range/batch 和官方领域贡献能力。

## Evidence: Stable Core That Should Be Preserved

### One state owner already exists

- `src/core-kernel/commands/command-bus.ts:40-85`：`CommandBus` 只拥有一个 `KernelSessionState`，submit/undo/redo 统一委托 session runtime。
- `src/core-kernel/session/runtime.ts:104-146`：command transition、read/checkpoint state 与 committed events 在 adoption 前统一校验；失败返回原 state。
- `src/core-kernel/commands/runtime.ts:95-120`：一次 committed operation 只递增一次 documentVersion，并一次性更新 history depths 和 support result。

这部分已经形成适合扩展的单一事务脊柱，重写会增加双状态、事件次序和 dirty/checkpoint 回归风险。

### Failure and isolation boundaries already exist

- `src/core-kernel/commands/runtime.ts:156-226`：submit 总异常边界、candidate apply、semantic validation 与原子 commit 已存在。
- `src/core-kernel/commands/runtime.ts:233-303`：undo/redo 具备独立异常收口与 history invariant failure。
- `src/core-kernel/commands/command-bus.ts:156-179`：同步与异步 subscriber failure 已与 committed state 隔离。

### Public and internal boundaries are intentionally separated

- `test/core-kernel/public-api-boundary.test.ts` 精确锁定公共导出，并明确排除 `CoreMutation`、`HistoryEntry`、internal codecs、Registry builders 和 mutable document APIs。
- 内部重构因此可以在不破坏正式 API 的前提下进行；同时，精确导出测试可以及时发现意外扩面。

### Accepted baseline has no production drift

- 当前 HEAD `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c` 相对 Core V1 close baseline `d92a7586536ac8757c318ae6f75aabd8698f85ac` 在 `src/**`、`test/**`、`package.json` 与 `tsconfig.json` 没有差异。
- Core V1 accepted evidence为 8/8 K1-6 聚焦测试与 169/169 完整测试；本次只读复核的 `npm run typecheck` 通过。

这些证据说明当前主体不是待修复的失稳系统，重构目标应是打开经过批准的扩展接缝，而不是借机重新实现全部功能。

## Evidence: Closed Seams That Need Refactoring

### Command runtime is hard-wired to Core-only implementations

- `src/core-kernel/commands/runtime.ts:1-15` 直接绑定 `decodeCoreCommand`、`prepareCommandMutation`、`applyCoreMutation`、Core semantic validator 和 Core feature profile。
- `src/core-kernel/commands/runtime.ts:17-22` 的 private `HistoryEntry` 固定保存 `CoreCommandEnvelope` 与单个 `CoreMutation`。
- `src/core-kernel/commands/runtime.ts:156-225` 的 submit pipeline 没有可注入的冻结 command catalog、validator pipeline 或 module classifier pipeline。

继续直接向这些 switch 增加官方领域命令，会让 Core 反向知道领域类型，或迫使领域模块建立第二套 bus/history；两者都破坏既定微内核边界。

### Mutation preparation and application are closed switches

- `src/core-kernel/commands/mutations.ts:18-44` 的 effect union 只覆盖五种 Core mutation。
- `src/core-kernel/commands/mutations.ts:90-240` 将六个 command 的解析后语义处理写在一个闭合 switch。
- `src/core-kernel/commands/mutations.ts:243-335` 使用另一个闭合 switch 应用 mutation。

加入 measure、Part/Staff/Voice、range、batch 与 module-owned extension effect 前，应先把“命令定义产生私有 effect set”和“内核原子应用/生成 inverse”分离，否则每次扩展都会放大同一文件和同一 union 的耦合。

### Registry assembly is Core-contribution-specific

- `src/core-kernel/registry/runtime.ts:1-24` 直接导入 Core command definitions、Core decoder、CommandBus 与 Core compiled entries。
- `src/core-kernel/registry/runtime.ts:549-613` 只接受能够在 `CORE_COMMAND_DEFINITIONS` 中找到的 command contribution。
- `src/core-kernel/registry/runtime.ts:695-754` 只分派 `command | selector` 两种 Core contribution kind。
- `src/core-kernel/registry/runtime.ts` 当前约 940 行，同时承担 gateway、manifest normalization、contribution validation、summary 与 construction。

官方模块 contribution 可以继续采用 startup-frozen 模型，但 assembly validation、immutable catalog 与 gateway dispatch 应拆分为内部职责，避免在单一 runtime 文件继续堆叠。

## Recommended Refactor Boundary

### Refactor now

- 内部 accepted-command abstraction 与 frozen execution catalog；
- command-specific decoder/prepare handler 与通用 transaction coordinator 分离；
- 非空、有序、强类型 private effect set；
- 由内核从隔离候选当前值生成并反序保存的 inverse effect set；
- module-neutral private history entry，同时保持 Core-only public history/result shape；
- Core semantic validator + frozen official module validator pipeline；
- Core/module support classifier pipeline；
- live submit 与 replay 共享同一 catalog/pipeline；
- Registry manifest normalization、compiled assembly validation、immutable catalog、gateway dispatch 的内部拆分；
- 默认 Core-only factory 继续装配现有六个命令，作为兼容适配器。

### Preserve by default

- `ScoreDocument` persisted schema、exact time、pitch 与 opaque `ExtensionBlock`；
- score JSON codec 的公共行为；
- Core semantic diagnostic codes/order；
- address/range、snapshot/selectors、checkpoint/dirty；
- committed/session event 的 Core-only public shape 和顺序；
- K1-5 public Issue/Report 与 current-schema migration result；
- `CommandBus.create()`、`replayCoreCommands()` 和 Core-only Registry/Gateway 的现有签名与结果。

## Delivery Strategy

### Gate 1 — Characterization

- 固定六命令的 submit/no-op/reject/undo/redo/replay、version/history depths、event trace、dirty/checkpoint 和 unknown extension 深度相等 fixtures。
- 固定 public export list、forbidden dependencies、error privacy 与 hostile-input baseline。

### Gate 2 — Behavior-preserving spine refactor

- 用现有六命令适配新的内部 execution catalog 和 effect-set pipeline。
- 每一步保持测试为绿；重构门禁没有新 public command、新 domain behavior 或动态 lifecycle。
- 旧内部 switch/adapter 只在新路径完全通过 characterization 后移除。

### Gate 3 — Independent acceptance

- 对比重构前后 fixture 文档、result、version、history、replay 和 event trace 深度相等。
- 完整执行 typecheck、build、full tests、public API、forbidden dependency、`git diff --check` 与独立人工审计。

### Later capability gates

- document factory + measure lifecycle；
- Part/Staff/Voice lifecycle；
- range transformations + explicit atomic batch；
- official module SDK/contribution assembly and domain validation/profile/migration integration。

## Why Not a Big-Bang Rewrite

- 当前没有可复现的系统性缺陷或错误状态所有权需要替换。
- 同时改动模型、事务、history、Registry、结构命令和领域接缝，会让回归无法归因。
- 已有 169 项测试主要锁定 V1 行为；先进行零行为重构可以把它们作为有效的 characterization suite 使用。
- 分门禁交付并不意味着小修小补；内核脊柱重构仍可覆盖多个内部文件，但它必须只有一个目的：在保持 V1 行为的同时建立稳定扩展接缝。
