# SPEC-001 谱面领域模型

## 状态

- 状态: 已确认 MVP 领域模型边界。
- 来源需求: `REQ-002-score-document-model.md`、`REQ-003-guitar-tab-editing.md`、`REQ-011-mvp-first-stage-scope.md`。
- 适用范围: 第一阶段 4 小节标准 6 弦吉他 riff。

## 目标

领域模型必须作为六线谱、五线谱、播放、保存和导出的单一事实来源。所有布局坐标、屏幕坐标、播放光标和导出页面坐标都必须从 `ScoreDocument` 快照派生，不得写回领域模型成为谱面事实。MVP 模型允许保留后续扩展点，但第一阶段验证器只接受已确认的最小节奏和乐器范围。

## MVP 模型范围

- 一个 `ScoreDocument`。
- 一个标准 6 弦吉他 `Track`。
- 默认调弦必须逐弦保存为明确科学音高: 低到高 `E2 A2 D3 G3 B3 E4`。
- 全局固定 tempo。
- 全局 4/4 time signature。
- 每个小节一个 `Voice`。
- 每个 beat 可以是休止或单音。
- 允许时值: 四分、八分、十六分。
- 允许等长基础休止。
- 支持 3 个 Core Loop 技巧的结构化字段: `slide`、`bend`、`vibrato`。

## 音乐时间模型

- 音乐时间必须使用整数 tick。
- `ticksPerQuarter = 960`。
- 4/4 小节长度为 `3840` tick。
- quarter duration: `960`。
- eighth duration: `480`。
- sixteenth duration: `240`。
- 第一阶段所有 `Beat` 的 `tickOffset + durationTicks` 不得超出所在小节长度。
- `NoteEvent.durationTicks` 和 `RestEvent.durationTicks` 必须与所属 `Beat.durationTicks` 一致。
- 音乐时间模型属于 `ScoreDocument` 谱面核心对象模型，不是播放引擎。
- Core Kernel 负责音乐逻辑时间、小节长度计算和 duration 硬验证。
- Playback Module 负责把音乐 tick 转换为真实毫秒调度、Web Audio 时间、节拍器声音和播放光标 tick。
- UI 时间线、布局横向位置、SVG/VexFlow 坐标、PDF/PNG 页面坐标都只能从音乐时间和布局模型派生，不得写回 `ScoreDocument` 成为谱面事实。
- MVP 不支持 tempo map、变拍号、附点、三连音、多声部对齐、swing/humanize、MIDI clock 或 DAW transport。

## 核心数据结构草案

本节是第一阶段微内核核心对象模型的编码输入。每个结构都必须有明确职责，不能只靠字段名猜用途。

```ts
/**
 * 科学音高记法。
 *
 * 用途:
 * - 用 `E2`、`A2`、`D3`、`G3`、`B3`、`E4` 这种明确音高保存调弦和音符音高。
 * - 避免把标准调弦写成含糊的 `EADGBE` 字符串。
 *
 * 规则:
 * - MVP 使用十二平均律科学音高记法。
 * - 允许自然音、升号和降号，例如 `E2`、`F#2`、`Bb3`。
 * - `midiNumber`、频率和移调结果由服务函数派生，不作为 MVP 必填存储字段。
 */
export type ScientificPitch = string

/**
 * 谱面工程文件的根对象。
 *
 * 用途:
 * - `.bgp` 内 `score.json` 的根数据。
 * - 是六线谱、五线谱、播放、保存、导出和插件读取的单一事实来源。
 * - 作为布局、渲染、播放、导出和 hit testing 的派生输入，而不是保存屏幕坐标或渲染状态。
 */
export interface ScoreDocument {
  /** 当前文档 schema 版本，用于打开旧文件时执行迁移。 */
  schemaVersion: string
  /** 文档稳定 ID，用于测试、差异比较和未来协作能力。 */
  id: string
  /** 标题、作者、创建版本等非音乐事件元数据。 */
  metadata: DocumentMetadata
  /** 实际乐曲内容，包括时间基准、全局设置和轨道。 */
  score: Score
  /** 插件或未来模块的私有数据，必须按命名空间隔离。 */
  extensions?: NamespacedExtensionData
}

/**
 * 文档元数据。
 *
 * 用途:
 * - 保存用户可见的作品信息。
 * - 不参与音高、节奏、播放和排版真相计算。
 */
export interface DocumentMetadata {
  title: string
  author?: string
  createdAt: string
  updatedAt: string
  createdWith: string
  lastSavedWith: string
}

/**
 * 全局速度。
 *
 * 用途:
 * - 控制播放事件生成和谱面显示的基础 tempo。
 * - MVP 只支持一个固定 tempo，不支持 tempo map。
 */
export interface Tempo {
  /** 每分钟四分音符数。 */
  bpm: number
}

/**
 * 拍号。
 *
 * 用途:
 * - 定义小节长度和时值验证规则。
 * - MVP 只接受 4/4，但结构保留未来变拍号能力。
 */
export interface TimeSignature {
  numerator: number
  denominator: number
}

/**
 * 音乐逻辑 tick。
 *
 * 用途:
 * - 表达谱面内部的时间位置，例如 beat 在小节内的起点。
 * - 保证编辑、验证、播放事件生成、布局和导出共享同一套时间单位。
 * - 不表示真实毫秒、Web Audio `currentTime` 或 UI 动画时间。
 */
export type Tick = number

/**
 * 音乐逻辑持续时间。
 *
 * 用途:
 * - 表达 note、rest、beat 和 measure 的持续 tick。
 * - MVP 只接受四分、八分、十六分及等长休止对应的 tick 值。
 */
export type DurationTicks = number

/**
 * 谱面音乐时间基准。
 *
 * 用途:
 * - 定义从音乐时值到整数 tick 的换算基础。
 * - MVP 固定 `ticksPerQuarter = 960`，为未来附点、三连音和更细分节奏保留精度。
 */
export interface MusicalTimebase {
  ticksPerQuarter: 960
}

/**
 * 乐曲级结构。
 *
 * 用途:
 * - 管理全局时间基准、tempo、拍号和轨道集合。
 * - MVP 只允许一个标准 6 弦吉他轨道，但结构保留未来多轨扩展点。
 */
export interface Score {
  /** 整数 tick 时间基准，MVP 固定为 960。 */
  timebase: MusicalTimebase
  /** MVP 固定 tempo；tempo map 后置。 */
  globalTempo: Tempo
  /** MVP 固定 4/4；变拍号后置。 */
  globalTimeSignature: TimeSignature
  /** MVP 只允许一个 track；多轨编辑后置。 */
  tracks: Track[]
}

/**
 * 轨道。
 *
 * 用途:
 * - 表示一个乐器声部。
 * - MVP 只允许一个 `guitar` track。
 */
export interface Track {
  id: string
  /** 乐器、弦数、调弦、capo 和品位范围。 */
  instrument: TrackInstrument
  /** 该轨道的小节序列。 */
  measures: Measure[]
}

/**
 * 轨道乐器信息。
 *
 * 用途:
 * - 让六线谱弦/品可以推导出五线谱音高。
 * - 保存影响验证、播放和导出的核心乐器语义。
 */
export interface TrackInstrument {
  /** MVP 固定为 `guitar`；贝斯、鼓、键盘后置。 */
  family: "guitar"
  /** MVP 固定为 6，未来可扩展到 7/8 弦。 */
  stringCount: number
  /** 逐弦调弦。MVP 标准调弦低到高为 E2 A2 D3 G3 B3 E4。 */
  tuning: InstrumentTuning
  /** 品位范围，用于校验非法品号。 */
  fretRange: { min: number; max: number }
  /** 变调夹品位；MVP 可为 0 或省略。 */
  capo?: number
}

/**
 * 乐器调弦。
 *
 * 用途:
 * - 明确每根弦的空弦音高。
 * - 禁止用 `EADGBE` 这种无法表达八度的字符串作为核心数据。
 */
export interface InstrumentTuning {
  /** 调弦内部 ID，例如 `standard-guitar-e2-a2-d3-g3-b3-e4`。 */
  id: string
  /** 人类可读名称，例如 `Standard Guitar Tuning`。 */
  name: string
  /** 调弦数组顺序。MVP 固定为从最低音弦到最高音弦。 */
  order: "low_to_high"
  /** 每根弦的空弦音高和六线谱弦号。 */
  strings: TunedString[]
}

/**
 * 单根弦的调弦信息。
 *
 * 用途:
 * - 把六线谱中的弦号映射到明确空弦音高。
 * - 标准吉他中 6 弦是最低音 E2，1 弦是最高音 E4。
 */
export interface TunedString {
  /** 六线谱弦号。标准吉他: 6=最低音弦，1=最高音弦。 */
  stringNumber: number
  /** 空弦音高，例如 `E2`、`A2`、`D3`。 */
  openPitch: ScientificPitch
}

/**
 * 标准 6 弦吉他调弦常量。
 *
 * 用途:
 * - 新建 MVP 谱面的默认值。
 * - 测试 fixture 和验证器必须使用这组明确音高。
 */
export const STANDARD_GUITAR_TUNING: InstrumentTuning = {
  id: "standard-guitar-e2-a2-d3-g3-b3-e4",
  name: "Standard Guitar Tuning",
  order: "low_to_high",
  strings: [
    { stringNumber: 6, openPitch: "E2" },
    { stringNumber: 5, openPitch: "A2" },
    { stringNumber: 4, openPitch: "D3" },
    { stringNumber: 3, openPitch: "G3" },
    { stringNumber: 2, openPitch: "B3" },
    { stringNumber: 1, openPitch: "E4" }
  ]
}

/**
 * 小节。
 *
 * 用途:
 * - 保存小节内的声部和时值边界。
 * - MVP 每个小节只允许一个 voice。
 */
export interface Measure {
  id: string
  index: number
  durationTicks: DurationTicks
  voices: Voice[]
}

/**
 * 声部。
 *
 * 用途:
 * - 为未来多声部保留结构。
 * - MVP 每个小节只能有一个 voice。
 */
export interface Voice {
  id: string
  beats: Beat[]
}

/**
 * 节奏槽位。
 *
 * 用途:
 * - 表示一个确定 tick 位置和时值的 note 或 rest。
 * - MVP 每个 beat 只能包含一个 `NoteEvent` 或一个 `RestEvent`。
 */
export interface Beat {
  id: string
  tickOffset: Tick
  durationTicks: DurationTicks
  event: NoteEvent | RestEvent
}

/**
 * 音符事件。
 *
 * 用途:
 * - 同时保存吉他指法语义和音乐音高语义。
 * - 六线谱使用 `stringNumber` + `fret`。
 * - 五线谱、播放和导出使用 `pitch`。
 */
export interface NoteEvent {
  id: string
  /** 六线谱弦号，标准吉他 6=最低音弦，1=最高音弦。 */
  stringNumber: number
  /** 品号，0 表示空弦。 */
  fret: number
  /** 由调弦和品号推导并保存的明确音高，例如 `C4`。 */
  pitch: ScientificPitch
  /** 音符持续 tick，必须与所属 beat 一致。 */
  durationTicks: DurationTicks
  /** 结构化技巧注解。具体技巧定义由 TechniqueRegistry 注册。 */
  techniques: TechniqueAnnotation[]
}

/**
 * 休止事件。
 *
 * 用途:
 * - 表示该 beat 没有发声音符。
 * - 与 `NoteEvent` 互斥。
 */
export interface RestEvent {
  id: string
  durationTicks: DurationTicks
}

/**
 * 技巧注解。
 *
 * 用途:
 * - 让技巧作为结构化数据保存，而不是 UI 文本。
 * - 内核只保存类型、命名空间、目标和参数。
 * - 具体技巧的参数 schema、显示、播放和互斥规则由技巧注册器提供。
 */
export interface TechniqueAnnotation {
  id: string
  /** 技巧类型，例如 `slide`、`bend`、`vibrato`。 */
  typeId: string
  /** 技巧来源命名空间，内置吉他技巧使用 `core.guitar`。 */
  namespace: string
  /** 技巧作用目标，可以是 note 或未来的 range。 */
  target: DocumentAddress | DocumentRange
  /** 技巧参数，例如 bend 幅度、slide 方向、vibrato 强度。 */
  params: Record<string, unknown>
  /** 该技巧参数结构版本，用于未来迁移。 */
  schemaVersion: string
  /** 提供该技巧的模块 ID，内置技巧可为 `core.guitar-techniques`。 */
  sourceModuleId?: string
}

/**
 * 文档地址。
 *
 * 用途:
 * - 让命令、技巧、验证器和插件用同一套语言指向文档位置。
 * - 替代 UI 组件状态，避免技巧目标只绑定到临时 DOM 或 React 状态。
 */
export interface DocumentAddress {
  trackId: string
  measureId?: string
  voiceId?: string
  beatId?: string
  noteId?: string
}

/**
 * 文档范围。
 *
 * 用途:
 * - 表示跨 beat 或跨小节的目标范围。
 * - 为未来范围型技巧、批量编辑和复制粘贴保留稳定目标模型。
 */
export interface DocumentRange {
  start: DocumentAddress
  end: DocumentAddress
}

/**
 * 命名空间扩展数据。
 *
 * 用途:
 * - 保存插件或未来模块的私有数据。
 * - 缺失对应插件时，核心谱面仍必须可打开，并保留这些数据。
 */
export interface NamespacedExtensionData {
  [namespace: string]: {
    schemaVersion: string
    data: unknown
  }
}
```

## 强制规则

- 领域模型不得依赖 React、SVG、VexFlow、Web Audio 或 Tauri。
- 六线谱和五线谱必须共享同一音乐事件数据。
- 每个文档、轨道、小节、beat、note 和资源必须有稳定 ID。
- 第一阶段验证器只接受 `stringCount = 6`。
- 调弦必须逐弦保存为明确 `ScientificPitch`，不得把 `EADGBE` 作为核心数据。
- 标准 6 弦吉他默认调弦必须是低到高 `E2 A2 D3 G3 B3 E4`，并显式保存每根弦的 `stringNumber`。
- 第一阶段验证器只接受 4/4。
- 第一阶段验证器只接受一个 track 和一个 voice。
- 第一阶段验证器只接受四分、八分、十六分及等长休止。
- 第一阶段每个 beat 只能包含一个 `NoteEvent` 或一个 `RestEvent`，两者互斥。
- 同一 beat 上多个 `NoteEvent` 必须返回 `unsupported-multiple-notes-in-beat`。
- 弦号、品号、调弦和派生音高必须一致。
- 保存前、打开后和命令回放后必须运行文档验证器。

## 第一阶段不做

- 不做 7/8 弦吉他验证通过。
- 不做贝斯、鼓、键盘或多乐器总谱。
- 不做多轨编辑验收。
- 不做同轨多声部。
- 不做变拍号。
- 不做小节级 tempo 变化。
- 不做附点。
- 不做三连音、五连音、七连音或嵌套连音。
- 不做跨小节延音线作为验收门槛。
- 不做同一 beat 多音、和弦名自动识别、和弦图库或和弦图编辑器。
- 不做扫弦、琶音节奏细节或复杂和声分析。

## 验证器错误

验证器至少需要能报告:

- `unsupported-string-count`
- `unsupported-time-signature`
- `unsupported-tempo-map`
- `unsupported-voice-count`
- `unsupported-duration`
- `measure-duration-underflow`
- `measure-duration-overflow`
- `invalid-string`
- `invalid-fret`
- `invalid-tuning`
- `unsupported-multiple-notes-in-beat`
- `broken-reference`

## 测试要求

- 最小 fixture: 4 小节、4/4、标准 6 弦、固定 tempo、单 voice。
- fixture 必须包含四分、八分、十六分和基础休止。
- fixture 不包含同 beat 多音或和弦；验证器测试必须覆盖同 beat 多音返回 `unsupported-multiple-notes-in-beat`。
- fixture 必须包含 3 个 Core Loop 技巧样例: `slide`、`bend`、`vibrato`。
- 验证器测试必须覆盖每个错误码。
- round-trip 测试必须证明保存和重开后 ID、节奏、弦/品、技巧和元数据不丢失。
