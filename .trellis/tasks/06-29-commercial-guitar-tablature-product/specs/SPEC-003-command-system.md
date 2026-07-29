# SPEC-003 命令系统、事务、历史与回放

> **状态：K1-2 ACCEPTED / CORE V1 CLOSED；GD-0 USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING。** K1-2 Core-only 行为保持冻结；GD-0 候选不构成生产实现授权。

## 1. Scope / Trigger

任何 ScoreDocument 写入、事务、history、undo/redo 或 replay 必须遵守本规范。旧 SPEC-003 草案已归档，不得作为兼容 API 实现。

## 2. Signatures

稳定目标语言为：

```typescript
type ScoreEntityTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string }

type SequenceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-event"; readonly eventId: string }
```

插入使用 `voiceId + SequenceAnchor`；after-event 必须唯一属于目标 Voice。完整 ScorePoint/ScoreRange、跨 Voice/Measure 范围属于 K1-3。

## 3. Contracts

- 所有 Core 写入通过 `CommandBus.submit(unknown)` 严格解码的语义命令；公开 API 不接受 patch、JSON path、splice、任意脚本或整文档替换。
- envelope 固定四字段：`commandVersion: 1`、`commandId`、强类型 target、严格 payload；额外字段与畸形 union 必须拒绝。
- 数组 payload 先读取 own `length` 数据描述符与实际 own keys；若 own-key 数不等于 `length + 1`，必须在遍历声明索引前快速拒绝。
- K1-2 静态目录只包含六个 built-in：set metadata、set WrittenPitch、set NoteValue、insert notes event、insert rest event、remove event；不提供动态注册。
- 新 Event/Note ID 全部由调用者提供，不使用时间、随机数、tick、slot 或数组位置生成。
- handler 只产生内部强类型 forward/inverse mutation；公开、持久化和 replay 均不暴露 mutation。
- 先在隔离 candidate 应用 mutation，再运行 semantic validation，成功后原子 commit。
- semantic invalid 硬失败并保留原始 `semantic.*` diagnostics；semantic valid/profile unsupported 允许提交并返回完整 unsupported 分类。
- 默认 `K1_SCORE_FEATURE_PROFILE` 及嵌套 constraints、meters/meter 项、NoteValue 允许值数组在运行时深度冻结；外部篡改不得改变实时或 replay 分类。
- 设置为现值是 no-op：版本、history、redo 均不变化。
- documentVersion 从 0 开始；commit、undo、redo 各递增一次，失败/no-op 不递增；溢出原子拒绝。
- 一个 committed command 对应一个内部 HistoryEntry；不保存时间戳、随机 ID 或整文档快照。
- undo/redo 在隔离 candidate 应用 inverse/forward 并重新做 semantic/profile 验证；完整 mutation/validation/classification 路径必须有总异常边界，意外失败保持原状态并返回 `history.invariant-violation`。新 committed command 清 redo，失败/no-op 不清。
- replay 只重放命令 envelope，使用实时 submit 同一流程；不重放 mutation 或完整操作日志。
- Core 命令只修改通用谱面事实；调弦、弦品和吉他技巧由 Guitar Domain 命令解释并受控更新其 Part-owned extension。
- 未知 ExtensionBlock 和所有非目标子树必须在成功、失败、undo、redo、replay 中原样保留。
- K1-2 不拥有 dirty state、snapshot、selector、post-commit event、Registry/Capability 或 general report。

## 4. Validation & Error Matrix

| Failure | Required behavior |
|---|---|
| malformed command payload | fail before mutation with stable operation error |
| missing/mismatched entity target | fail before mutation; preserve all state |
| missing/wrong-owner anchor | fail before mutation; preserve all state |
| resulting Core semantic failure | rollback and preserve concrete `semantic.*` diagnostics |
| resulting profile unsupported | commit and return complete `unsupported.*` classification |
| version overflow/internal mutation error | stable privacy-safe failure; preserve all state |
| empty undo/redo or history invariant failure | stable history failure; preserve all state |

## 5. Good / Base / Bad Cases

- Good：按 voice/event/note ID 插入或修改通用事件，并可精确 undo/redo/replay。
- Base：插入双 Note Event 合法提交并返回 `unsupported.chord`，且不破坏 schema。
- Bad：命令直接写 `startTick`、替换任意 JSON path 或丢弃未知 ExtensionBlock。

## 6. Tests Required

K1-2 必须覆盖严格 envelope/payload 拒绝、巨大稀疏数组快速拒绝、实体与 anchor 解析、六命令 committed/no-op/rejected、事务回滚、版本溢出、history 粒度、多步 undo/redo、undo/redo 意外异常收口、redo invalidation、默认 Profile 深度冻结、篡改后 replay 分类稳定、caller alias 隔离、未知扩展保留、公开边界和失败零副作用。最终门禁为 `npm run typecheck`、`npm run build`、`npm test`、`git diff --check`。

## 7. Wrong vs Correct

```typescript
// Wrong
submit({ op: "replace", path: "/scoreData/timeline/0" })

// Correct direction
submit({ commandId: "core.note.set-written-pitch", target: { kind: "note", noteId }, payload })
```

## 8. GD-0 Additive Domain Transaction Contract

GD-0 不改写上述 K1-2 Core-only 合同，而是为后续 integrated construction 固定以下兼容扩展：

- Core 与启动期已安装的官方领域命令继续共用 `CommandBus.submit(unknown)` 与 gateway submit；不增加 Guitar 专用写入口。
- 六个现有 Core command ID、结果、no-op、version、history、undo/redo 与 `replayCoreCommands()` 保持不变。
- integrated construction 通过不可变 catalog 严格路由 namespaced domain command，并使用同一个 document/version/history/replay/dirty/event owner。
- 一个语义命令可准备一个私有非空 effect set；所有 Core/extension effects 在同一 isolated candidate 中应用并形成一个 history entry。effect、inverse、history internals、patch 和 whole-document replacement 均不公开。
- live submit 与 integrated replay 使用相同 catalog、decode、target/ownership、effect、validation、classification 和 failure pipeline。
- 失败或 no-op 保持完整状态不变；semantic invalid 拒绝，profile unsupported 可提交并返回 Core + module 完整分类。
- generic Core pitch command 不推断弦品；若已安装领域验证发现现有 placement 将不一致，则整笔 Core 命令拒绝，调用方须使用领域命令替换或清除 placement。
- known official extension 对每个 `ExtensionBlock.schemaVersion` 只做有限精确匹配；required contribution missing/incompatible 时 session 为 lossless read-only 且 validation incomplete。若 unavailable 与 incompatible facts 混合，submit/undo/redo/首个 replay write 统一返回 incompatible code，并携带未过滤的完整 canonical facts。
- 同一 contribution 同时面对 compatible 与 incompatible/future block 时，validator/classifier 每阶段至多调用一次且只接收 canonical owner 顺序的 compatible block-scoped view；不兼容 block 到 decoder/validator/classifier/command/effect/fact handler 均为零调用，payload 保真。
- 最小公共面固定为 `CommandBus.createIntegrated`/`IntegratedCommandBusCreationResult`、`KernelRegistry` 实例 `createGateway` overload、integrated bus/gateway result、`IntegratedKernelReadState` 的 write/validation availability，以及 `replayKernelCommands`/三状态 `ReplayKernelCommandsResult`；gateway 保留 K1-4 `summary`、全部 typed `select` 与 `subscribe`，Core-only 入口保持原样。

权威合同见 `.trellis/spec/core-kernel/backend/domain-transaction-integration.md`。GD-0 不授权当前生产代码修改。
