# SPEC-005 吉他技巧

## 状态

- 状态: 已确认 Core Loop 技巧集合
- 映射需求: `REQ-003`, `REQ-011`
- 目标: 固定第一阶段吉他技巧分类、优先级、数据契约、互斥规则和测试要求。

## 适用范围

本 spec 只约束标准 6 弦吉他第一阶段技巧能力。贝斯、鼓、键盘和其它乐器技巧不属于本 spec。

## 优先级

- `Core Loop`: 第一条 MVP 纵向切片必须实现。
- `P0 Follow-up`: 第一阶段后续增强，不阻塞第一条 MVP 闭环。
- `P0 Extended`: 第一阶段后续候选，不阻塞第一条 MVP 闭环。
- `P1`: 第一阶段可选，建议第二批实现。
- `P2`: 后置实现。

实现第一条 MVP 纵向切片时，不得把 P0 Follow-up、P0 Extended、P1 或 P2 当成阻塞项。

## 技巧分类枚举

```ts
export type TechniqueCategory =
  | "legato"
  | "pitch_expression"
  | "sustain_mute_noise"
  | "attack_dynamics"
  | "harmonics"
  | "chord_rhythm"
```

## Core Loop 技巧清单

### legato

- `slide`

### pitch_expression

- `bend`
- `vibrato`

## P0 Follow-up 技巧清单

这些技巧仍属于第一阶段高优先级增强，但不阻塞第一条 MVP 纵向切片:

### legato

- `hammer_on`
- `pull_off`

### sustain_mute_noise

- `palm_mute`

## P0 Extended 技巧清单

这些技巧是高频扩展候选，但不阻塞第一条 MVP 纵向切片:

- `release`
- `let_ring`
- `dead_note`
- `ghost_note`
- `accent`
- `staccato`
- `pick_stroke_up`
- `pick_stroke_down`
- `natural_harmonic`
- `arpeggio`

## P1 技巧清单

- `pre_bend`
- `grace_note`
- `tremolo_picking`
- `artificial_harmonic`
- `legato_slide`

## P2 技巧清单

- `tapping`
- `pinch_harmonic`
- `tapped_harmonic`
- `whammy_bar_curve`
- `sweep_picking`
- `rasgueado`
- `classical_right_hand_fingering`
- `multi_step_bend_curve`

## 技巧注册器决策

技巧需要注册器。微内核只保存结构化 `TechniqueAnnotation`，具体技巧由 `TechniqueRegistry` 注册。

原因:

- 新增技巧不应该修改核心 `ScoreDocument` 结构。
- 渲染、播放、导出、导入和验证可以通过注册信息发现技巧能力。
- 未知技巧可以保留数据并降级显示，而不是导致文件打不开。
- 未来插件可以注册新技巧，但必须有命名空间、schema version 和 capability。

## 数据契约

```ts
/**
 * 技巧注解。
 *
 * 用途:
 * - 这是保存进 `ScoreDocument` 的技巧数据。
 * - 它只描述“哪个技巧作用到哪个目标，并携带什么参数”。
 * - 它不包含 UI 显示、SVG 绘制或播放实现。
 */
export interface TechniqueAnnotation {
  id: string
  /** 技巧类型，例如 `slide`、`bend`、`vibrato`。 */
  typeId: string
  /** 技巧命名空间。内置吉他技巧使用 `core.guitar`。 */
  namespace: string
  /** 技巧作用目标，例如单个 note 或一段 range。 */
  target: TechniqueTarget
  /** 技巧参数。具体结构由 TechniqueRegistry 中的参数 schema 定义。 */
  params: Record<string, unknown>
  /** 该技巧参数 schema 的版本，用于未来迁移。 */
  schemaVersion: string
  /** 提供该技巧的模块 ID，方便诊断、禁用和迁移。 */
  sourceModuleId?: string
}

/**
 * 技巧注册定义。
 *
 * 用途:
 * - 由内置技巧模块或未来插件注册。
 * - 描述技巧分类、优先级、目标类型、参数 schema、显示语义和播放语义。
 * - 注册定义不直接保存到每个音符，只作为运行时能力表和 schema 依据。
 * - 注册入口必须遵守 `SPEC-015-kernel-registry-capability.md`。
 */
export interface TechniqueDefinition {
  /** 稳定技巧类型 ID，例如 `slide`。 */
  typeId: string
  /** 命名空间，避免插件技巧和内置技巧重名。 */
  namespace: string
  /** 技巧分类，用于 UI 分组和文档组织。 */
  category: TechniqueCategory
  /** 技巧实现优先级。 */
  priority: "P0" | "P1" | "P2"
  /** 所属实现阶段。 */
  phase: "core_loop" | "phase1_extended" | "post_mvp"
  /** 技巧允许绑定的目标类型。 */
  allowedTargets: TechniqueTargetKind[]
  /** 技巧参数 schema，用于命令输入、保存前验证和迁移。 */
  parameterSchema: TechniqueParameterSchema
  /** 渲染模块可读取的显示语义，不包含具体 SVG/VexFlow 对象。 */
  displaySemantics: DisplaySemantics
  /** 播放模块可读取的播放语义，允许 MVP 简化处理。 */
  playbackSemantics: PlaybackSemantics
  /** 与其它技巧的互斥或组合规则。 */
  conflictRules?: TechniqueConflictRule[]
}

export type TechniqueTarget =
  | { kind: "note"; noteId: string }
  | { kind: "range"; startBeatId: string; endBeatId: string }

export type TechniqueTargetKind = TechniqueTarget["kind"]

/**
 * 技巧参数 schema。
 *
 * 用途:
 * - 描述某个技巧允许哪些参数。
 * - 命令系统、验证器和迁移器都通过它理解 `params`。
 */
export interface TechniqueParameterSchema {
  version: string
  fields: TechniqueParameterField[]
}

/**
 * 技巧参数字段。
 *
 * 用途:
 * - 描述单个参数的名称、类型和是否必填。
 * - 例如 bend 可声明 `semitones`，vibrato 可声明 `width` 或 `speed`。
 */
export interface TechniqueParameterField {
  name: string
  type: "number" | "string" | "boolean" | "enum"
  required: boolean
  allowedValues?: string[]
}

/**
 * 显示语义。
 *
 * 用途:
 * - 告诉渲染模块这个技巧应该如何被看待。
 * - 不包含 SVG、VexFlow 或具体绘图对象。
 */
export interface DisplaySemantics {
  notationKind: "line" | "symbol" | "text" | "modifier"
  defaultLabel?: string
}

/**
 * 播放语义。
 *
 * 用途:
 * - 告诉播放模块这个技巧是否影响音高、时值或音色。
 * - MVP 可以简化播放，但不得删除技巧数据。
 */
export interface PlaybackSemantics {
  affectsPitch: boolean
  affectsDuration: boolean
  affectsTone: boolean
  mvpPlaybackMode: "ignore" | "approximate" | "required"
}

/**
 * 技巧互斥规则。
 *
 * 用途:
 * - 描述一个技巧与其它技巧在同一目标上的组合限制。
 * - 例如 `pick_stroke_up` 与 `pick_stroke_down` 互斥。
 */
export interface TechniqueConflictRule {
  conflictsWith: { namespace: string; typeId: string }
  scope: "same_target" | "overlapping_range"
  severity: "error" | "warning"
}

/**
 * 技巧诊断。
 *
 * 用途:
 * - 技巧注册器验证技巧目标和参数时返回的结构化问题。
 * - UI、导入导出和测试可以使用统一格式展示或断言。
 */
export interface TechniqueDiagnostic {
  code: string
  severity: "error" | "warning"
  message: string
  target?: TechniqueTarget
}

/**
 * 技巧注册器。
 *
 * 用途:
 * - 管理所有当前可识别的技巧定义。
 * - 为命令系统、验证器、渲染、播放、导入导出提供统一查询入口。
 * - MVP 至少注册 `slide`、`bend`、`vibrato`。
 */
export interface TechniqueRegistry {
  /** 注册一个技巧定义，重复 namespace + typeId 必须报错。 */
  register(definition: TechniqueDefinition): void
  /** 查询一个技巧定义；未知技巧返回 undefined，但文档数据必须可保留。 */
  get(namespace: string, typeId: string): TechniqueDefinition | undefined
  /** 返回全部已注册技巧，用于技巧选择器和测试。 */
  list(): TechniqueDefinition[]
  /** 验证某个技巧注解的目标和参数是否符合注册定义。 */
  validate(annotation: TechniqueAnnotation): TechniqueDiagnostic[]
}
```

强制规则:

- TECH-001: 技巧不得只作为文本保存。
- TECH-002: 技巧必须绑定明确目标。
- TECH-003: Core Loop 技巧必须能保存、重新打开、显示、复制粘贴和撤销。
- TECH-004: Core Loop 技巧必须在 UI 中按分类展示。
- TECH-005: 技巧字段必须能被导入导出层降级说明引用。
- TECH-006: 播放层可以简化 Core Loop 技巧音色，但不得删除或改写技巧数据。
- TECH-007: P0 Follow-up、P0 Extended、P1、P2 不得作为第一条 MVP 纵向切片的阻塞项。
- TECH-008: `chord` target 后置到和弦能力进入范围后再加入，第一阶段不得出现在可保存 MVP 文档中。
- TECH-009: 新增技巧必须通过 `TechniqueRegistry.register` 注册，不得通过硬编码分支散落在 UI、渲染、播放和导出层。
- TECH-010: 未知技巧必须保留原始 `TechniqueAnnotation` 数据，并在显示、播放或导出时产生可读降级诊断。
- TECH-011: `namespace + typeId` 是技巧稳定身份，不得随 UI 语言变化。

## 基础互斥规则

- `dead_note` 不能同时拥有确定音高播放语义。
- `pick_stroke_up` 与 `pick_stroke_down` 在同一目标上互斥。
- `palm_mute` 与 `let_ring` 可在范围层面相邻，但同一 note 上默认互斥。
- `bend` 与未来 `release` 组合时，`release` 必须引用一个可释放的 bend 状态或前序 bend 语义。
- `natural_harmonic` 与 `dead_note` 在同一 note 上互斥。

## UI 要求

- 技巧选择入口必须按 `TechniqueCategory` 分组。
- 每个技巧必须有显示名称和英文术语。
- 第一阶段默认 UI 推荐中文主显示、英文术语辅助显示。
- P0 Follow-up、P0 Extended、P1、P2 技巧不得在第一条 MVP 主 UI 中表现为可用功能，除非已实现完整数据、显示和测试。

## 测试要求

- [ ] AC-SPEC-005-01: 每个 Core Loop 技巧都有最小 fixture。
- [ ] AC-SPEC-005-02: Core Loop 技巧保存后重新打开不丢失 `type`、`category`、`priority`、`phase`、`target`。
- [ ] AC-SPEC-005-03: Core Loop 技巧复制粘贴后目标更新正确，原技巧不被错误引用。
- [ ] AC-SPEC-005-04: 互斥技巧组合会产生验证错误。
- [ ] AC-SPEC-005-05: 技巧选择 UI 能按分类展示 Core Loop 技巧。
