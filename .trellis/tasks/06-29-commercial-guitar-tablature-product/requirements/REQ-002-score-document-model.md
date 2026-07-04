# REQ-002 谱面文档模型与音乐数据契约

## 决策状态

- 状态: 已确认 Core Kernel K1 谱面核心对象模型边界。
- 合并目标: 最终 PRD 的核心领域模型。
- 当前结论: `ScoreDocument` 是谱面唯一业务真相，K1 顶层结构收敛为 `metadata + scoreData`。
- 当前结论: `metadata` 分为文档元数据和音乐元数据；文档元数据描述作品和文件身份，音乐元数据描述 tempo、拍号、timebase、谱面类型和调弦等音乐基础事实。
- 当前结论: `scoreData` 分为 `timeline + events + techniques`；不再拆出独立 `ScoreStructure`，小节、节奏槽位和 tick 位置统一由 `ScoreTimeline` 表达。
- 当前结论: 休止符不设计独立 `RestData` 或 `rests` 集合；休止符只是特殊的谱面事件类型，与有声音符共享时间字段。
- 当前结论: 技巧按一到多个有声音符生效，使用有序 `targetNoteIds` 表达；Core Kernel K1 只定义通用 `TechniqueData` 与 `TechniqueDefinition` 注册框架，`test.slide`、`test.bend`、`test.vibrato` 只是第一批测试用技巧定义，不是写死在内核里的技巧枚举。
- 当前结论: 弦号、品号、六线谱演奏位置和吉他指法映射不属于 Core Kernel K1 主模型；其保存方式后续在官方吉他谱模块或第三方模块规划阶段单独设计。
- 当前结论: 原生文件扩展名采用 `.bgp`，物理形态为单文件开放包结构；Core Kernel K1 只定义语义 schema 和迁移入口，不实现物理文件 IO。
- 关键开放问题: 无。MVP 和弦能力已确认后置；K1 技巧系统已收敛为注册框架，`test.slide`、`test.bend`、`test.vibrato` 仅作为框架测试定义；`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强。

## 用户价值

用户需要长期保存作品、反复编辑、播放校对、导出和后续扩展处理。核心文档模型必须稳定、可验证、可迁移，不能只服务当前 UI，也不能把吉他六线谱表现细节写死进内核。

## 核心原则

- 单一事实来源: 五线谱、六线谱、播放、导出和外部模块都必须从 `ScoreDocument` 快照或 selector 派生。
- 最小核心: Core Kernel K1 只保存跨模块共享且不可外置的谱面事实，不保存 UI 会话、渲染坐标、播放状态或吉他弦品位置。
- 抽象音符: 有声音符以绝对音高、音乐时间和事件 ID 为基础；弦号/品号只是吉他模块对音符的外部表现和演奏位置映射。
- 显式时间: 音乐时间使用整数 tick 模型，避免浮点误差成为文件语义。
- 动态谱面基础: 音乐时间模型让谱面从静态字段集合变成可播放、可校对、可导出和可被插件一致理解的时间化音乐数据。
- 稳定 ID: 文档、小节、节奏槽位、事件、技巧和资源必须有稳定标识，便于撤销、插件、差异比较和测试回放。
- 可迁移: 每个文件必须记录 schema version，升级时必须进入迁移入口并产生迁移报告。
- 可验证: 保存前、打开后、命令回放后都能运行文档完整性检查。
- 可扩展但不提前承诺: Core Kernel K1 不定义模块私有数据持久化位置，不预设 `ScoreDocument.extensions`、`.bgp/extensions` 或 `moduleData`；未来多乐器、多声部、多拍号、复杂时值和模块私有数据必须在对应模块规划阶段单独设计，第一阶段验证器和验收只接受 K1 范围。

## K1 核心结构

```typescript
interface ScoreDocument {
  metadata: ScoreMetadata
  scoreData: ScoreData
}

interface ScoreMetadata {
  document: DocumentMetadata
  music: MusicMetadata
}

interface ScoreData {
  timeline: ScoreTimeline
  events: ScoreEvent[]
  techniques: TechniqueData[]
}
```

### 文档元数据

`DocumentMetadata` 用于保存文件和作品身份，不参与音乐规则计算:

- `schemaVersion`
- `documentId`
- `title`
- `artist`
- `composer`
- `copyright`
- `createdAt`
- `updatedAt`
- `createdWith`
- `lastSavedWith`

### 音乐元数据

`MusicMetadata` 用于保存当前谱面全局音乐事实:

- `scoreType`: K1 默认值为 `guitar-tab`，用于标注当前谱面类型，便于未来引入其它乐器或谱面类型。
- `timebase.ticksPerQuarter`: K1 固定为 `960`。
- `tempo.bpm`: K1 只支持全局固定 tempo。
- `meter.numerator` / `meter.denominator`: K1 只支持 `4/4`。
- `tuning`: 当 `scoreType = "guitar-tab"` 时必填，必须保存为 6 个明确绝对音高，顺序为低音弦到高音弦；例如标准 6 弦吉他低到高为 `E2 A2 D3 G3 B3 E4`；不得把 `EADGBE` 作为核心数据。

说明: `tuning` 是音乐元数据，不代表 Core Kernel K1 保存弦号、品号或指法位置。弦品映射如何保存由后续吉他谱模块规划阶段单独决定。

### 时间轴

`ScoreTimeline` 同时表达谱面有哪些时间单位以及这些单位在 tick 时间轴上的位置，不再单独设计 `ScoreStructure`:

```typescript
interface ScoreTimeline {
  measures: MeasureTimeSpan[]
}

interface MeasureTimeSpan {
  id: string
  order: number
  startTick: Tick
  durationTicks: DurationTicks
  slots: RhythmSlot[]
}

interface RhythmSlot {
  id: string
  startOffsetTicks: Tick
  durationTicks: DurationTicks
}
```

边界:

- `timeline` 负责小节和节奏槽位的顺序与时间位置。
- `RhythmSlot` 表示可放置一个谱面事件的节奏槽位，不等同于音乐理论中的 beat；beat 只保留为用户界面或乐理解释词汇。
- `MeasureTimeSpan.startTick` 表示小节在整首谱中的绝对 tick。
- `RhythmSlot.startOffsetTicks` 表示 slot 相对所属小节起点的偏移，不是全曲绝对 tick。
- slot 的全曲绝对 tick 必须由 `measure.startTick + slot.startOffsetTicks` 派生，不得作为独立真相保存。
- 时间真相只保存在 `MeasureTimeSpan.startTick`、`RhythmSlot.startOffsetTicks` 和 `RhythmSlot.durationTicks`；`ScoreEvent` 不再重复保存起始 tick 或持续 tick。
- 同一小节内的 `RhythmSlot[]` 必须按 `startOffsetTicks` 递增排列，不得重叠，不得留空洞。
- 第一个 `RhythmSlot` 必须从小节起点开始，最后一个 `RhythmSlot` 必须刚好结束在小节终点。
- 每个 `RhythmSlot.durationTicks` 必须大于 `0`，且必须属于 K1 允许时值集合: `960`、`480`、`240`。
- K1 不支持复杂反复、跳转、Da Capo 或播放顺序重排。
- 如果未来逻辑结构和实际时间展开发生分离，再单独规划结构模型，不在 K1 里提前拆分。

### 谱面事件

休止符不作为独立集合存在，只是特殊事件类型:

```typescript
type ScoreEvent = SoundNoteEvent | RestNoteEvent

interface BaseScoreEvent {
  id: string
  slotId: string
}

interface SoundNoteEvent extends BaseScoreEvent {
  kind: "note"
  pitch: AbsolutePitch
}

interface RestNoteEvent extends BaseScoreEvent {
  kind: "rest"
}
```

规则:

- `note` 和 `rest` 都通过所属 `RhythmSlot` 占用音乐时间。
- `note` 必须有绝对音高。
- `rest` 没有 pitch，也不需要独立 `RestData`。
- K1 每个 `RhythmSlot` 只能包含一个 `ScoreEvent`。
- 同一 `RhythmSlot` 出现多个有声 note 必须返回 `unsupported-multiple-notes-in-slot`。

### 绝对音高

`AbsolutePitch` 是 Core Kernel K1 唯一持久化音高形式，MIDI number 只能作为派生数据:

```typescript
type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B"
type PitchAccidental = "flat" | "natural" | "sharp"

interface AbsolutePitch {
  step: PitchStep
  accidental: PitchAccidental
  octave: number
}
```

规则:

- K1 octave 范围为 `0..8`。
- `A#3` 和 `Bb3` 必须能保留不同拼写；它们可以派生为同一个 MIDI number，但不得在核心数据里被自动合并。
- 非法音高必须返回稳定 diagnostic，例如 `pitch-step-invalid`、`pitch-accidental-invalid`、`pitch-octave-out-of-range` 或 `pitch-invalid`。
- 调弦也必须使用同一套 `AbsolutePitch`，并在 `guitar-tab` 谱面中固定为 6 个音高。

### 技巧数据

技巧不塞进音符对象里，独立保存在 `TechniqueData[]`。`TechniqueData` 是唯一写入 `ScoreDocument` 和 `.bgp` `score.json` 的技巧数据；`TechniqueDefinition`、`TechniqueTargetRule` 和 `TechniqueParamValidator` 只存在于运行时注册表，不属于可持久化谱面数据:

```typescript
interface TechniqueData {
  id: string
  definitionId: string
  targetNoteIds: string[]
  params: JsonObject
}

// Runtime registry contribution only: never persisted in ScoreDocument or .bgp.
interface TechniqueDefinition {
  id: string
  targetRule: {
    minNotes: number
    maxNotes: number
    ordered: boolean
    allowRest: false
  }
  validateParams: TechniqueParamValidator
}

type TechniqueParamValidator = (
  params: JsonObject,
) => TechniqueParamValidationResult

type TechniqueParamValidationResult =
  | { ok: true }
  | { ok: false; code: "technique-params-invalid"; details?: JsonObject }

type K1TestTechniqueDefinitionId =
  | "test.bend"
  | "test.vibrato"
  | "test.slide"

interface K1TestBendParams {
  semitones: 1 | 2
}

interface K1TestVibratoParams {
  width: "narrow" | "wide"
}

interface K1TestSlideParams {
  slideKind: "shift" | "legato"
}
```

规则:

- 技巧只能作用于有声音符，不能作用于 rest。
- `targetNoteIds` 是有序数组。
- `definitionId` 必须引用已注册的 `TechniqueDefinition`。
- `TechniqueData` 必须保持纯数据，只能包含 ID、目标音符引用和 JSON 可序列化 `params`。
- `TechniqueData` 不得包含 validator、callback、closure、class、显示 handler、播放 handler、渲染 handler 或模块代码。
- `TechniqueDefinition` 通过运行时 registry 解析，不得写入 `.bgp` 包数据、`score.json`、持久化 fixture 或 migration 输出。
- 打开或验证持久化谱面时，如果 `TechniqueData.definitionId` 无法解析到已注册定义，验证器必须返回 `technique-definition-missing`。
- 技巧定义负责声明目标音符数量、是否有序、参数校验规则和显示/播放/导出所需的语义边界。
- `test.slide`、`test.bend`、`test.vibrato` 是 K1 测试用技巧定义，用于证明技巧注册、参数校验、保存、重开、撤销/重做和 fixture round-trip 可用；它们不是内核硬编码枚举。
- 技巧参数必须是 JSON 可序列化的结构化数据，不得只是显示标签，也不得使用 `unknown` 逃避校验。
- K1 测试技巧使用稳定英文 registry id 和参数，不得使用中文作为可编码字段、参数值、definition id 或错误码。
- `test.bend` 只能作用于 1 个有声音符，只接受 `params = { semitones: 1 }` 或 `params = { semitones: 2 }`。
- `test.vibrato` 只能作用于 1 个有声音符，只接受 `params = { width: "narrow" }` 或 `params = { width: "wide" }`。
- `test.slide` 只能作用于 2 个有序有声音符，两个目标 note id 不得相同，第二个目标 note 在音乐时间上必须晚于第一个目标 note，只接受 `params = { slideKind: "shift" }` 或 `params = { slideKind: "legato" }`。

## MVP 必须满足

- REQ-002-F01: 文档模型必须支持一个 `guitar-tab` 类型谱面，但 Core Kernel K1 不定义 `Track` 主实体，不保存弦号/品号或六线谱演奏位置。
- REQ-002-F02: `ScoreDocument` 必须采用 `metadata + scoreData` 顶层结构。
- REQ-002-F03: `metadata.document` 必须能保存标题、作者、版权、创建时间、修改时间、schema version 和应用版本。
- REQ-002-F04: `metadata.music` 必须能保存 `scoreType`、`ticksPerQuarter = 960`、全局固定 tempo、4/4 拍号和明确音高形式的默认调弦。
- REQ-002-F05: `scoreData.timeline` 必须表达 4/4 小节、`RhythmSlot` 节奏槽位、小节绝对 tick、slot 小节内 offset 和持续 tick。
- REQ-002-F06: 第一实现阶段时值只要求四分、八分、十六分音符和等长休止。
- REQ-002-F07: 第一实现阶段每个 `RhythmSlot` 只能包含一个 `ScoreEvent`，其 `kind` 只能是 `note` 或 `rest`。
- REQ-002-F08: `SoundNoteEvent` 必须保存绝对音高和所属 `slotId`；起始时间与持续时间由所属 `RhythmSlot` 提供，不得保存 `stringNumber`、`fret` 或 guitar-tab 专属位置字段。
- REQ-002-F09: `RestNoteEvent` 必须能表达基础休止，但不得引入独立 `RestData` 或 `rests` 集合。
- REQ-002-F10: `TechniqueData` 必须以 `definitionId + targetNoteIds + params` 表达技巧；K1 必须提供技巧定义注册和校验框架，`test.slide`、`test.bend`、`test.vibrato` 只作为第一批测试定义。
- REQ-002-F11: 文档必须有验证器，至少能发现小节时值不满或超出、无效 timebase、unsupported 拍号、unsupported tempo map、无效时值、非法音高、非法调弦、断裂引用、同 slot 多 note 和技巧目标非法。
- REQ-002-F12: 第一实现阶段必须支持六线谱视图和基础五线谱视图从同一核心事件模型派生；六线谱弦品位置由外部吉他谱模块负责。
- REQ-002-F13: 保存为 `.bgp` 文件时，文档模型必须能写入 `manifest.json` 和核心谱面数据，并记录 schema version、应用版本和兼容范围。

## 第一阶段不做

- 不在 Core Kernel K1 中实现 `Track`、多轨列表、轨道增删改排序、mute/solo 或轨道管理命令。
- 不在 Core Kernel K1 中保存弦号、品号、指法位置、六线谱行号或 `guitarTabData`。
- 不做 7/8 弦吉他创建、编辑或验证通过。
- 不做贝斯、鼓、键盘和完整乐队编曲。
- 不做同轨多声部验收。
- 不做变拍号。
- 不做小节级 tempo 变化。
- 不做附点节奏。
- 不做三连音、五连音、七连音或嵌套连音。
- 不做跨小节延音线作为第一阶段验收门槛。
- 不做同一 slot 多音、和弦名自动识别、和弦图库或和弦图编辑器。
- 不做扫弦、琶音节奏细节或复杂和声分析。
- 不做歌词、自由文本框、罗马数字分析或简谱视图数据。
- 不做 AI 生成或转写 provenance。

## 数据契约

- 文档时间使用整数 tick。
- 内部常量: `ticksPerQuarter = 960`。
- 4/4 小节长度为 `3840` tick。
- 第一阶段允许时值:
  - quarter: `960`
  - eighth: `480`
  - sixteenth: `240`
- 第一阶段允许休止时值同上。
- `ScoreTimeline` 中每个小节的 slot 总时值必须等于小节 `durationTicks`。
- `RhythmSlot.startOffsetTicks + RhythmSlot.durationTicks` 不得超出所属小节时值。
- 同一小节内 `RhythmSlot` 必须按 `startOffsetTicks` 严格递增，且相邻 slot 必须满足 `next.startOffsetTicks === current.startOffsetTicks + current.durationTicks`。
- 如果 slot 未排序，验证器必须返回 `rhythm-slot-order-invalid`。
- 如果 slot 发生重叠，验证器必须返回 `rhythm-slot-overlap`。
- 如果 slot 之间存在 gap，或第一个 slot 没有从小节起点开始，验证器必须返回 `rhythm-slot-gap`。
- 如果 slot duration 为 `0`、负数或不属于 `960 / 480 / 240`，验证器必须返回 `unsupported-duration`。
- `ScoreEvent` 不得保存独立 `startTick` 或 `durationTicks`；事件时间必须从所属 `RhythmSlot` 派生。
- `ScoreEvent.slotId` 必须引用存在的 `RhythmSlot`。
- K1 每个 `RhythmSlot` 只能关联一个 `ScoreEvent`。
- 当 `scoreType = "guitar-tab"` 时，`metadata.music.tuning` 必须存在且正好包含 6 个合法 `AbsolutePitch`。
- 技巧 `targetNoteIds` 必须引用存在的有声 `note` 事件，不能引用 `rest`。
- 技巧 `definitionId` 必须引用已注册技巧定义，且 `params` 必须通过对应定义校验。
- 插件私有字段不得破坏核心文档打开、显示和播放可识别部分。
- Core Kernel 只保存音乐逻辑时间；真实毫秒调度、Web Audio 时钟、节拍器声音、播放光标高频 tick、UI 时间线和渲染坐标都由外部模块从 snapshot 派生。

## 验收标准

- [ ] AC-002-01: 给定一个 K1 `ScoreDocument`，模型能保存 `metadata.document`、`metadata.music` 和 `scoreData`，且 `scoreType` 为 `guitar-tab`。
- [ ] AC-002-02: 给定 `EADGBE` 这类模糊调弦文本，验证器拒绝或迁移为明确音高列表，不得作为核心数据保存。
- [ ] AC-002-03: 给定 4/4 小节时值不完整或超出的文件，验证器能报告稳定 code、位置和原因。
- [ ] AC-002-03B: 给定未排序、重叠、留空洞或非法 duration 的 `RhythmSlot[]`，验证器能报告稳定 code、位置和原因。
- [ ] AC-002-04: 给定三连音、附点、变拍号、多 voice 或 tempo map 输入，第一阶段验证器返回明确 unsupported 错误。
- [ ] AC-002-05: 给定同一 `RhythmSlot` 上多个有声 note，第一阶段验证器返回明确的 `unsupported-multiple-notes-in-slot`，且不会保存为有效 K1 谱面。
- [ ] AC-002-06: 给定 `rest` 事件，核心模型能按同一套 `ScoreEvent` 时间规则保存和验证，不需要独立 `RestData`。
- [ ] AC-002-07: 给定已注册的 `test.slide`、`test.bend`、`test.vibrato` 测试技巧定义，模型能保存结构化参数和有序 `targetNoteIds`，并拒绝未注册定义、无效参数、指向 rest 或不存在 note 的技巧目标。
- [ ] AC-002-08: 给定只包含 K1 核心数据、缺失吉他谱模块私有数据的文件，核心谱面仍可打开、验证、播放可识别音高和节奏；但核心不得承诺还原用户原始弦号/品号，也不得要求 K1 已定义模块私有数据存储位置。
- [ ] AC-002-09: 给定 `scoreType = "guitar-tab"` 且缺失调弦、调弦不是 6 个音高或包含非法音高的文件，验证器返回稳定 diagnostic。

## 开放问题

- 无。MVP 和弦能力已确认后置；K1 技巧系统已确认采用注册框架；`test.slide`、`test.bend`、`test.vibrato` 只是框架测试定义，`hammer-on`、`pull-off`、`palm mute` 保持为 P0 后续增强。
