# SPEC-001 谱面核心对象模型

## 状态

- 状态: 已确认 Core Kernel K1 谱面核心对象模型边界。
- 来源需求: `REQ-002-score-document-model.md`、`REQ-011-mvp-first-stage-scope.md`。
- 稳定 spec: `.trellis/spec/core-kernel/backend/score-document-model.md`。
- 适用范围: Pure Core Kernel V1，4 小节标准 6 弦吉他 riff fixture。

## 核心原则

`ScoreDocument` 是唯一谱面业务真相。六线谱、五线谱、播放、导出、布局、hit testing 和未来插件数据都必须从 `ScoreDocument` snapshot 或 selector 派生，不得成为第二份谱面真相。

Core Kernel K1 保持抽象、简洁、可迁移:

- 顶层结构只采用 `metadata + scoreData`。
- `metadata` 分为 `document` 和 `music`。
- `scoreData` 分为 `timeline + events + techniques`。
- 音乐时间用整数 tick 表达。
- 有声音符以绝对音高为核心事实。
- 休止符只是特殊 `ScoreEvent`，不使用独立 `RestData`。
- 技巧通过注册定义解释，不写死成内核枚举。
- 吉他弦号、品号、指法位置、六线谱行号和 `GuitarTabData` 不属于 Core Kernel K1 主模型。

## MVP 模型范围

- 一个 `ScoreDocument`。
- `metadata.music.scoreType = "guitar-tab"`。
- `metadata.music.tuning` 必填，固定为低到高 6 个明确 `AbsolutePitch`。
- `ticksPerQuarter = 960`。
- 全局固定 tempo。
- 全局 4/4 meter。
- 一个抽象谱面事件流。
- 每个 `RhythmSlot` 只能关联一个 `ScoreEvent`。
- `ScoreEvent.kind` 只能是 `note` 或 `rest`。
- 允许时值: 四分 `960`、八分 `480`、十六分 `240`。
- 基础休止使用 `ScoreEvent.kind = "rest"`。
- K1 技巧能力是通用注册框架；`slide`、`bend`、`vibrato` 只是测试技巧定义。

## 核心数据结构

```ts
export interface ScoreDocument {
  metadata: ScoreMetadata
  scoreData: ScoreData
}

export interface ScoreMetadata {
  document: DocumentMetadata
  music: MusicMetadata
}

export interface ScoreData {
  timeline: ScoreTimeline
  events: ScoreEvent[]
  techniques: TechniqueData[]
}
```

## 文档元数据

`DocumentMetadata` 保存作品和文件身份，不参与音乐规则计算。

```ts
export interface DocumentMetadata {
  schemaVersion: string
  documentId: string
  title: string
  artist?: string
  composer?: string
  copyright?: string
  createdAt: string
  updatedAt: string
  createdWith: string
  lastSavedWith: string
}
```

## 音乐元数据

`MusicMetadata` 保存当前谱面的全局音乐事实。

```ts
export interface MusicMetadata {
  scoreType: "guitar-tab"
  timebase: MusicalTimebase
  tempo: Tempo
  meter: Meter
  tuning: AbsolutePitch[]
}

export interface MusicalTimebase {
  ticksPerQuarter: 960
}

export interface Tempo {
  bpm: number
}

export interface Meter {
  numerator: 4
  denominator: 4
}
```

规则:

- `scoreType = "guitar-tab"` 时，`tuning` 必须存在。
- `tuning` 必须正好包含 6 个 `AbsolutePitch`，顺序为低音弦到高音弦。
- 标准吉他调弦为 `E2 A2 D3 G3 B3 E4`。
- 不得把 `EADGBE` 作为核心数据保存。
- `tuning` 是音乐元数据，不表示内核保存弦号、品号或指法位置。

## 绝对音高

`AbsolutePitch` 是 Core Kernel K1 唯一持久化音高形式。MIDI number、频率和吉他弦品位置都只能从它或外部模块数据派生。

```ts
export type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B"
export type PitchAccidental = "flat" | "natural" | "sharp"

export interface AbsolutePitch {
  step: PitchStep
  accidental: PitchAccidental
  octave: number
}
```

规则:

- K1 octave 范围为 `0..8`。
- `A#3` 和 `Bb3` 必须能保留不同拼写；它们可以派生为同一个 MIDI number，但不得在核心数据里自动合并。
- 非法音高返回稳定 diagnostic: `pitch-step-invalid`、`pitch-accidental-invalid`、`pitch-octave-out-of-range` 或 `pitch-invalid`。

## 音乐时间模型

音乐时间属于谱面核心对象模型，不是播放引擎。

```ts
export type Tick = number
export type DurationTicks = number

export interface ScoreTimeline {
  measures: MeasureTimeSpan[]
}

export interface MeasureTimeSpan {
  id: string
  order: number
  startTick: Tick
  durationTicks: DurationTicks
  slots: RhythmSlot[]
}

export interface RhythmSlot {
  id: string
  startOffsetTicks: Tick
  durationTicks: DurationTicks
}
```

规则:

- 4/4 小节长度为 `3840` tick。
- `RhythmSlot` 表示可放置一个谱面事件的节奏槽位，不等同于音乐理论中的 beat。
- `ScoreTimeline` 同时表达小节/槽位结构和 tick 位置，不再拆出独立 `ScoreStructure`。
- `MeasureTimeSpan.startTick` 表示小节在整首谱中的绝对 tick。
- `RhythmSlot.startOffsetTicks` 表示 slot 相对所属小节起点的偏移，不是全曲绝对 tick。
- slot 的全曲绝对 tick 必须由 `measure.startTick + slot.startOffsetTicks` 派生，不得作为独立真相保存。
- 一个小节内所有 `RhythmSlot.durationTicks` 总和必须等于小节 `durationTicks`。
- `RhythmSlot.startOffsetTicks + RhythmSlot.durationTicks` 不得超出所属小节时值。
- 同一小节内的 `RhythmSlot[]` 必须按 `startOffsetTicks` 递增排列。
- 相邻 slot 必须连续，满足 `next.startOffsetTicks === current.startOffsetTicks + current.durationTicks`。
- slot 不得重叠，不得留空洞。
- 第一个 slot 必须从小节起点开始，最后一个 slot 必须刚好结束在小节终点。
- 每个 `RhythmSlot.durationTicks` 必须大于 `0`，且必须属于 K1 允许集合: `960`、`480`、`240`。
- `ScoreEvent` 不得重复保存 `startTick` 或 `durationTicks`；事件时间必须从所属 `RhythmSlot` 派生。
- Playback Module 负责把音乐 tick 转成真实毫秒调度、Web Audio 时间、节拍器声音和播放光标 tick。
- UI 时间线、布局横向位置、SVG/VexFlow 坐标、PDF/PNG 页面坐标都只能派生，不得写回 `ScoreDocument`。

## 谱面事件

```ts
export type ScoreEvent = SoundNoteEvent | RestNoteEvent

export interface BaseScoreEvent {
  id: string
  slotId: string
}

export interface SoundNoteEvent extends BaseScoreEvent {
  kind: "note"
  pitch: AbsolutePitch
}

export interface RestNoteEvent extends BaseScoreEvent {
  kind: "rest"
}
```

规则:

- `note` 和 `rest` 都通过所属 `RhythmSlot` 占用音乐时间。
- `note` 必须有 `AbsolutePitch`。
- `rest` 没有 pitch，也不需要独立 `RestData` 或 `rests` 集合。
- K1 每个 `RhythmSlot` 只能关联一个 `ScoreEvent`。
- 同一 `RhythmSlot` 上多个有声 note 必须返回 `unsupported-multiple-notes-in-slot`。

## 技巧数据

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export interface TechniqueData {
  id: string
  definitionId: string
  targetNoteIds: string[]
  params: JsonObject
}

export interface TechniqueDefinition {
  id: string
  targetRule: TechniqueTargetRule
  validateParams: TechniqueParamValidator
}

export interface TechniqueTargetRule {
  minNotes: number
  maxNotes: number
  ordered: boolean
  allowRest: false
}

export type TechniqueParamValidator = (
  params: JsonObject,
) => TechniqueParamValidationResult

export type TechniqueParamValidationResult =
  | { ok: true }
  | { ok: false; code: "technique-params-invalid"; details?: JsonObject }
```

规则:

- `TechniqueData.definitionId` 必须引用已注册 `TechniqueDefinition`。
- `targetNoteIds` 是有序数组。
- 技巧只能作用于有声音符，不能作用于 `rest`。
- 技巧定义负责目标数量、目标顺序和参数校验。
- `params` 必须是 JSON 可序列化结构，不得使用 `unknown` 逃避校验。
- K1 用 `slide`、`bend`、`vibrato` 作为测试技巧定义，证明注册、验证、保存、重开、撤销/重做和 fixture round-trip 可用；它们不是 Core Kernel 硬编码枚举。

## 强制验证

验证器至少报告:

- `tuning-missing`
- `tuning-string-count-invalid`
- `tuning-pitch-invalid`
- `pitch-step-invalid`
- `pitch-accidental-invalid`
- `pitch-octave-out-of-range`
- `unsupported-time-signature`
- `unsupported-tempo-map`
- `unsupported-duration`
- `rhythm-slot-order-invalid`
- `rhythm-slot-overlap`
- `rhythm-slot-gap`
- `measure-duration-underflow`
- `measure-duration-overflow`
- `unsupported-multiple-notes-in-slot`
- `broken-reference`
- `technique-definition-missing`
- `technique-target-count-invalid`
- `technique-params-invalid`

## 第一阶段不做

- 不在 Core Kernel K1 中定义 `Track`、`Voice`、`GuitarTabData`、`stringNumber`、`fret` 或弦品映射作为核心谱面字段。
- 不做 7/8 弦吉他验证通过。
- 不做贝斯、鼓、键盘或多乐器总谱。
- 不做多轨编辑验收。
- 不做同轨多声部。
- 不做变拍号。
- 不做小节级 tempo 变化。
- 不做附点。
- 不做三连音、五连音、七连音或嵌套连音。
- 不做跨小节延音线作为验收门槛。
- 不做同一 slot 多音、和弦名自动识别、和弦图库或和弦图编辑器。
- 不做扫弦、琶音节奏细节或复杂和声分析。

## 测试要求

- 最小 fixture: 4 小节、4/4、标准 6 弦调弦、固定 tempo、单声部事件流。
- fixture 必须包含四分、八分、十六分和基础休止。
- 验证器测试必须覆盖 slot 未排序、slot 重叠、slot 留空洞、slot duration 为 `0`、slot duration 为负数和 unsupported duration。
- fixture 不包含同 slot 多音或和弦；验证器测试必须覆盖同 slot 多音返回 `unsupported-multiple-notes-in-slot`。
- fixture 必须注册并使用 `slide`、`bend`、`vibrato` 三个测试技巧定义。
- round-trip 测试必须证明 ID、节奏、绝对音高、技巧和元数据不丢失。
- 测试不得依赖 React、Tauri、VexFlow、Web Audio、PDF/PNG 库、文件系统或吉他弦品映射。
