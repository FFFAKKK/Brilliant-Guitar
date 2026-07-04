# SPEC-003 命令系统、事务与回放

## 状态

- 状态: 已确认对外采用语义命令，内部 patch/delta 只作为实现细节。
- 来源需求: `REQ-002-score-document-model.md`、`REQ-003-guitar-tab-editing.md`、`REQ-007-extension-system.md`、`REQ-008-editor-workflow-ux.md`。
- 适用范围: 第一阶段 Core Kernel 的唯一写入入口、事务、undo/redo、命令回放和插件写入边界。

## 目标

命令系统必须让所有谱面写入都可验证、可撤销、可重做、可回放、可授权，并且能被 UI、快捷键、导入器、内部模块和未来插件共享。

本项目对外只暴露语义命令。patch、JSON path、字段替换、数组 splice 等底层变更只能作为内核内部事务和历史实现细节，不能成为插件 API、UI API 或导入器 API。

## 核心决策

- 对外命令表达“用户或模块想做什么”，例如 `insertNote`、`setFret`、`addTechnique`。
- 内部 delta 表达“文档实际怎么变化”，例如字段替换、数组插入、删除或整段快照替换。
- 外部模块不得提交任意 patch。
- 内核可以把语义命令编译为内部 delta，用于事务、undo/redo、回放、调试和性能优化。
- undo/redo 的用户语义以语义命令为准，而不是以内部字段变化为准。
- MVP 采用细粒度历史模型: 每个成功的可撤销语义命令默认生成一个 `HistoryEntry`，`undo` 和 `redo` 一次只移动一个历史条目。
- MVP 不做复杂历史合并、宏命令合并、时间窗口合并或跨命令智能压缩。

## 命令生命周期

每个写命令必须按以下顺序执行:

1. 接收 `CommandEnvelope`。
2. 校验 command id 是否已注册。
3. 校验 payload schema。
4. 校验调用方 capability。
5. 校验 `DocumentAddress` 或 `DocumentRange` 是否存在且可编辑。
6. 校验命令前置条件。
7. 在隔离 draft 中生成并应用内部 delta。
8. 对结果运行硬一致性验证。
9. 成功则 commit；如果命令可撤销，追加一个细粒度 undo entry；清空 redo stack、更新 dirty state、发布事件。
10. 失败则 rollback，并返回结构化错误；文档必须保持不变。

## undo/redo 粒度

第一阶段先保证 MVP 基本功能稳定，不做复杂历史体验优化。

- 一个成功的可撤销语义命令对应一个 `HistoryEntry`。
- `undo` 一次只回退一个 `HistoryEntry`。
- `redo` 一次只重做一个 `HistoryEntry`。
- 失败命令不得生成 `HistoryEntry`。
- `insertNote`、`insertRest`、`setString`、`setFret`、`setDuration`、`addTechnique`、`removeTechnique`、`deleteRange` 都必须是独立历史条目。
- 显式批量语义命令可以作为一个原子历史条目，例如 `transposeRange`；前提是它本身是用户或模块提交的一个命令，而不是内核偷偷合并多个普通操作。
- 连续品号输入、连续方向键移动、连续技巧添加等智能合并策略后置，不属于 MVP。
- 后续如果引入合并，必须通过显式 `historyMergePolicy` 定义，并为每条合并规则提供测试。

## 数据结构草案

本节是后续实现的编码输入。每个结构都必须保留注释，说明用途和边界。

`TransactionResult.events` 使用 `SPEC-014-kernel-snapshot-events.md` 定义的 `KernelEvent`。命令系统只负责在事务 commit 后生成事件摘要，不得把内部 delta operation 当作公开事件 payload。

`KernelCapability` 和注册表规则由 `SPEC-015-kernel-registry-capability.md` 定义；`KernelError` 和 `KernelDiagnostic` 由 `SPEC-016-kernel-errors-diagnostics-reports.md` 定义。命令定义必须通过 `KernelRegistry` 注册，执行前必须通过 capability 检查。

```ts
/**
 * 命令 ID。
 *
 * 用途:
 * - 作为命令面板、快捷键、插件贡献点和回放日志的稳定标识。
 * - 不随 UI 语言变化。
 *
 * 规则:
 * - 内置命令使用 `core.` 前缀，例如 `core.insertNote`。
 * - 内部模块命令使用模块命名空间，例如 `core.guitar-techniques.addTechnique`。
 */
export type CommandId = string

/**
 * 命令调用来源。
 *
 * 用途:
 * - 帮助内核做 capability 检查、诊断定位和回放排查。
 * - 不参与音乐语义计算。
 */
export interface CommandSource {
  /** 来源类型。MVP 只需要 UI、内部模块、导入器和测试回放。 */
  kind: "ui" | "internal-module" | "importer" | "replay"
  /** 来源模块 ID。UI 可使用 `core.workbench`。 */
  moduleId: string
}

/**
 * 命令信封。
 *
 * 用途:
 * - 所有模块提交给 Core Kernel 的统一写入入口。
 * - 包含命令 ID、payload、调用来源和可选事务信息。
 *
 * 边界:
 * - `payload` 必须是语义参数，不得是 JSON Patch、字段路径或任意对象替换脚本。
 */
export interface CommandEnvelope<TPayload = unknown> {
  id: CommandId
  payload: TPayload
  source: CommandSource
  requestId: string
  transactionId?: string
}

/**
 * 命令定义。
 *
 * 用途:
 * - 注册一个可执行的语义命令。
 * - 为命令面板、快捷键、插件 API、测试和权限检查提供稳定元数据。
 */
export interface CommandDefinition<TPayload = unknown> {
  id: CommandId
  titleKey: string
  descriptionKey?: string
  payloadSchemaVersion: string
  payloadSchema: unknown
  requiredCapabilities: KernelCapability[]
  undoable: boolean
  execute: CommandHandler<TPayload>
}

/**
 * 命令处理函数。
 *
 * 用途:
 * - 把一个语义命令转换为内核可验证的文档变更。
 * - 只能运行在 Core Kernel 控制的事务上下文中。
 */
export type CommandHandler<TPayload = unknown> = (
  context: CommandContext,
  payload: TPayload
) => CommandExecution

/**
 * 命令执行上下文。
 *
 * 用途:
 * - 给 command handler 提供受控读写能力。
 * - 防止 handler 直接泄露可变 `ScoreDocument` 给外部模块。
 */
export interface CommandContext {
  readonly documentId: string
  readonly schemaVersion: string
  readonly source: CommandSource
  read: KernelReadApi
  draft: KernelDraftApi
  validateTarget: (target: DocumentAddress | DocumentRange) => CommandDiagnostic[]
}

/**
 * 命令执行结果。
 *
 * 用途:
 * - 表示 command handler 是否成功生成内部 delta。
 * - 成功不等于最终 commit；commit 前还必须通过硬一致性验证。
 */
export type CommandExecution =
  | { ok: true; delta: InternalDocumentDelta; diagnostics?: CommandDiagnostic[] }
  | { ok: false; error: CommandError; diagnostics?: CommandDiagnostic[] }

/**
 * 内部文档 delta。
 *
 * 用途:
 * - 记录语义命令在文档上的实际变更。
 * - 用于 commit、rollback、undo/redo 和调试。
 *
 * 边界:
 * - 只能由 Core Kernel 生成和消费。
 * - 不得作为 UI、插件、导入器或外部脚本的公开写入 API。
 */
export interface InternalDocumentDelta {
  id: string
  commandId: CommandId
  documentVersionBefore: number
  documentVersionAfter: number
  operations: InternalDeltaOperation[]
  inverseOperations: InternalDeltaOperation[]
}

/**
 * 内部 delta 操作。
 *
 * 用途:
 * - 表达内核内部字段级或结构级变化。
 * - MVP 可以优先使用较粗粒度的 replace 操作保证正确性，后续再优化为更细粒度操作。
 */
export type InternalDeltaOperation =
  | { op: "replaceDocument"; before: ScoreDocument; after: ScoreDocument }
  | { op: "setField"; path: InternalDocumentPath; before: unknown; after: unknown }
  | { op: "insertItem"; path: InternalDocumentPath; index: number; item: unknown }
  | { op: "removeItem"; path: InternalDocumentPath; index: number; item: unknown }

/**
 * 内部文档路径。
 *
 * 用途:
 * - 只给 `InternalDocumentDelta` 定位内部字段。
 * - 不是稳定插件 API，也不是 `.bgp` 外部契约。
 */
export type InternalDocumentPath = string

/**
 * 事务结果。
 *
 * 用途:
 * - `CommandBus.submit` 的统一返回值。
 * - 调用方只能通过该结果获得成功、失败、诊断和事件摘要。
 */
export type TransactionResult =
  | {
      ok: true
      commandId: CommandId
      transactionId: string
      documentVersion: number
      diagnostics: CommandDiagnostic[]
      events: KernelEvent[]
    }
  | {
      ok: false
      commandId: CommandId
      transactionId?: string
      error: CommandError
      diagnostics: CommandDiagnostic[]
    }

/**
 * undo/redo 历史条目。
 *
 * 用途:
 * - 保存一次可撤销用户意图的语义命令和内部 delta。
 * - MVP 中一个成功可撤销语义命令默认对应一个历史条目。
 * - 支持回放测试和历史诊断。
 */
export interface HistoryEntry {
  id: string
  command: CommandEnvelope
  forwardDelta: InternalDocumentDelta
  inverseDelta: InternalDocumentDelta
  createdAt: string
  labelKey: string
}

/**
 * 命令错误。
 *
 * 用途:
 * - 让 UI、测试和插件获得稳定错误码。
 * - 错误文本由 i18n 层根据 `code` 和 `messageKey` 显示。
 */
export interface CommandError {
  code: CommandErrorCode
  messageKey: string
  location?: DocumentAddress | DocumentRange
  details?: Record<string, unknown>
}

export type CommandErrorCode =
  | "command-unknown"
  | "command-payload-invalid"
  | "command-capability-denied"
  | "command-target-not-found"
  | "command-precondition-failed"
  | "command-unsupported"
  | "command-validation-failed"
  | "transaction-rollback"
  | "history-empty"

/**
 * 命令诊断。
 *
 * 用途:
 * - 记录非致命警告、unsupported 说明或可定位错误。
 * - 和通用 DocumentDiagnostic 可以互相映射。
 */
export interface CommandDiagnostic {
  severity: "info" | "warning" | "error"
  code: string
  messageKey: string
  location?: DocumentAddress | DocumentRange
}

/**
 * 命令总线。
 *
 * 用途:
 * - Core Kernel 对外唯一写入入口。
 * - 负责注册、权限、事务、历史、事件和回放边界。
 */
export interface CommandBus {
  register<TPayload>(definition: CommandDefinition<TPayload>): void
  submit<TPayload>(command: CommandEnvelope<TPayload>): TransactionResult
  undo(source: CommandSource): TransactionResult
  redo(source: CommandSource): TransactionResult
}
```

## MVP 语义命令集合

第一阶段必须至少定义以下语义命令:

- `core.createScore`: 创建标准 6 弦吉他谱。
- `core.setDocumentMetadata`: 设置标题、作者等元数据。
- `core.ensureMeasures`: 创建或补齐第一条 4 小节 riff 所需小节。
- `core.insertNote`: 在目标 beat 和弦上插入单音。
- `core.insertRest`: 在目标 beat 插入等长休止。
- `core.setString`: 修改音符弦号，并按调弦重新验证音高。
- `core.setFret`: 修改音符品号，并按调弦重新推导和保存 `pitch`。
- `core.setDuration`: 修改音符或休止时值。
- `core.addTechnique`: 添加结构化技巧注解。
- `core.removeTechnique`: 删除结构化技巧注解。
- `core.deleteRange`: 删除目标音符、休止或范围。
- `core.pasteRange`: 粘贴已验证谱面片段。
- `core.transposeRange`: 批量移调合法范围内的音符。
- `core.undo`: 撤销上一条可撤销语义命令。
- `core.redo`: 重做上一条已撤销语义命令。

第一阶段不得定义或暴露以下公开命令:

- `patchDocument`
- `replaceJsonPath`
- `setField`
- `spliceArray`
- `runScript`
- `evalCommand`
- 任意以 JSON Patch、字段路径或脚本为主体的写入命令。

## 强制规则

- CMD-001: 所有文档写入必须经过 `CommandBus.submit`、`CommandBus.undo` 或 `CommandBus.redo`。
- CMD-002: UI、快捷键、导入器、内部模块和未来插件不得直接修改 `ScoreDocument`。
- CMD-003: 对外 API 只能暴露语义命令，不能暴露任意 patch 命令。
- CMD-004: 内部 delta 必须由内核生成，不能由外部模块提交。
- CMD-005: 每个命令必须声明稳定 command id、payload schema、capability 和 undoable。
- CMD-006: 每个命令执行前必须校验目标地址或范围。
- CMD-007: 每个命令执行后必须运行硬一致性验证；验证失败必须 rollback。
- CMD-008: 失败事务不得改变文档、dirty state、undo stack 或 redo stack。
- CMD-009: 成功的可撤销命令必须追加 `HistoryEntry`。
- CMD-010: 成功的新写入命令必须清空 redo stack。
- CMD-011: `undo` 和 `redo` 不得绕过硬一致性验证。
- CMD-012: 命令回放必须能从空白初始状态复现同一 `ScoreDocument`。
- CMD-013: 命令 label、错误消息和诊断消息必须通过 i18n key 表达，不能把中文或英文文本硬编码到命令核心。
- CMD-014: 命令注册表不得接受重复 command id。
- CMD-015: 未注册命令必须返回 `command-unknown`，不得静默忽略。
- CMD-016: MVP 中每个成功的可撤销语义命令必须生成一个独立 `HistoryEntry`。
- CMD-017: MVP 中 `undo` 一次只能回退一个 `HistoryEntry`，`redo` 一次只能重做一个 `HistoryEntry`。
- CMD-018: 失败命令、被拒绝命令和 unsupported 命令不得生成历史条目。
- CMD-019: MVP 不得隐式合并连续命令；任何合并策略都必须后置到显式 `historyMergePolicy`。
- CMD-020: 显式批量语义命令可以是一个原子历史条目，但必须保持事务、验证、undo/redo 和回放一致。
- CMD-021: UI 坐标、布局坐标、SVG/VexFlow 坐标和播放光标不得作为公开写命令目标；它们必须在外部编辑/布局模块先解析为 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或合法语义 payload。

## MVP 不做

- 不开放第三方任意脚本命令。
- 不开放外部 JSON Patch 写入 API。
- 不做宏录制和宏编辑器。
- 不做复杂历史合并、时间窗口合并或跨命令智能压缩。
- 不做跨文档批量命令。
- 不做协同编辑 command log 同步。
- 不做用户可编辑内部 delta。
- 不做轨道添加、删除、重命名、排序、mute/solo 命令。
- 不做同 slot 多音、和弦图、和弦名或扫弦/琶音命令。

## 测试要求

- [ ] AC-003-01: 任意 UI 写入路径都能追踪到一个稳定语义 command id。
- [ ] AC-003-02: 对同一初始文档回放 `insertNote -> setFret -> addTechnique -> undo -> redo` 后，结果稳定一致。
- [ ] AC-003-03: `setFret` 会同步更新 `pitch`，且弦号、品号、调弦和音高验证一致。
- [ ] AC-003-04: 非法品号命令返回错误并保持文档不变。
- [ ] AC-003-05: 未注册命令返回 `command-unknown`。
- [ ] AC-003-06: 外部模块提交 patch 类命令时返回 `command-unsupported` 或 `command-unknown`。
- [ ] AC-003-07: 失败事务不改变 undo stack 和 redo stack。
- [ ] AC-003-08: 连续撤销 20 次编辑后，谱面回到准确历史状态。
- [ ] AC-003-09: 内部模块执行 `transposeRange` 后，undo 能恢复执行前状态。
- [ ] AC-003-10: 命令回放测试能在无 UI、无 Tauri、无 VexFlow 环境下运行。
- [ ] AC-003-11: 连续执行 `insertNote -> setFret -> addTechnique` 后，undo 三次必须逐步撤销技巧、品号修改和插入音符。
- [ ] AC-003-12: 连续执行多个成功写命令时，undo stack 条目数量必须等于成功的可撤销语义命令数量。
- [ ] AC-003-13: 非法命令、unsupported 命令和验证失败命令不得增加 undo stack 条目。
