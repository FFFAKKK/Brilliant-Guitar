# K1-1 地基替换技术设计

## 1. 设计结论

采用 **A1 / M1 / T1 / E1** 组合方案：

- 持久化层现在就建立最小的 `Part / Staff / Voice / Event` 通用骨架；
- Note 只保存 `WrittenPitch`，`SoundingPitch` 由 Part 的移调规则派生；
- `ScoreDocument.measureDefinitions[]` 是全谱小节顺序与拍号的唯一真相；
- 记谱时间保存 `NoteValue`，精确运算使用规范化 `Fraction`，不保存 tick；
- Core Kernel 只提供可语义无损保留的 `ExtensionBlock` 信封；
- 当前产品能力由 `ScoreFeatureProfile` 限制，不把“schema 可表达”误写成“产品已支持”；
- Core Kernel 与 Guitar Domain 分成两个独立实施块，第一块验收后才能开始第二块。

这不是完整插件平台，也不是完整总谱编辑器。它是第一版可长期维持的谱面事实模型。

## 2. 方案比较

| 方案 | 内容 | 当前成本 | 长期代价 | 结论 |
| --- | --- | ---: | ---: | --- |
| A（采用） | 最小通用骨架 + 严格首版 profile + 版本化扩展信封 | 中 | 低 | 在依赖尚未形成前替换地基，避免以后破坏性迁移 |
| B | 保留现有 guitar-first `timeline / slots / events / techniques`，以后再抽象 Part/Staff/Voice | 低 | 高 | 会继续固化重复时间真相、引用断裂状态和吉他专用边界 |
| C | 现在实现完整总谱对象、扩展注册表、插件加载、迁移框架和全记谱能力 | 高 | 中 | 把未验证需求提前做成基础设施，超出 K1-1 |

方案 A 比 B 多付出一次受控模型替换，但这是 UI、命令、文件 IO 尚未依赖当前 schema 时成本最低的一次替换。方案 A 又通过 profile 和两块式实施避免了方案 C 的过度建设。

## 3. 设计原则

1. 一个事实只持久化一次；顺序、位置、发声音高等可可靠派生的数据不重复保存。
2. Core Kernel 只描述跨乐器成立的记谱事实；吉他弦号、品位、调弦与技巧由 Guitar Domain 解释。
3. 结构合法、音乐语义合法、当前版本支持是三个不同判断。
4. 所有外部数据从 `unknown` 开始；普通坏数据返回诊断，不抛出未处理异常。
5. 未知扩展可以被旧版本安全打开、校验信封并语义无损写回。
6. 先固定稳定数据合同，再建设命令、UI、播放与物理文件格式。

## 4. 模块边界

```text
unknown JSON
    |
    v
Core Codec ---------------> DecodeResult<ScoreDocument>
    |                                  |
    v                                  v
Core Semantic Validator -> SemanticValidationResult
    |                                  |
    v                                  v
ScoreFeatureProfile ------> ScoreSupportResult
    |
    +--> Guitar Domain Validator (仅处理已知 guitar 扩展)

ScoreDocument --> Renderer / Playback / MIDI / File IO adapters（后续任务）
```

- **Core Domain**：数据类型、分数运算、记谱时值、书写音高与移调、稳定 ID。
- **Core Codec**：JSON 语法边界、严格结构解码、编码和未知扩展保留。
- **Core Semantic Validation**：跨乐器不变量、引用完整性、时值与小节一致性。
- **Feature Profile Validation**：判断当前产品版本能否编辑该合法谱面。
- **Guitar Domain**：官方吉他扩展的数据解释、弦品映射和吉他专属语义。
- **Adapters**：tick、毫秒、布局坐标、文件字节、渲染对象均在内核之外派生。

Core Kernel 不依赖 Guitar Domain；Guitar Domain 单向依赖 Core Kernel。

## 5. 核心持久化模型

以下接口及命名就是编码合同；实施前只把它们同步到稳定规范，不再另行改名或改变真相边界。

```ts
export interface ScoreDocument {
  readonly schemaVersion: "brilliant-score-1";
  readonly id: string;
  readonly metadata: ScoreMetadata;
  readonly measureDefinitions: readonly MeasureDefinition[];
  readonly parts: readonly Part[];
  readonly extensions: readonly ExtensionBlock[];
}

export interface ScoreMetadata {
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempo: { readonly bpm: number };
}

export interface MeasureDefinition {
  readonly id: string;
  readonly meter: Meter;
  readonly pickupDuration?: Fraction;
}

export interface Meter {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32 | 64;
}

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly StaffDefinition[];
  readonly measureContents: readonly PartMeasureContent[];
}

export interface InstrumentDescriptor {
  readonly name: string;
  readonly writtenToSounding: Transposition;
}

export interface Transposition {
  readonly diatonicSteps: number;
  readonly chromaticSemitones: number;
}

export interface StaffDefinition {
  readonly id: string;
  readonly lineCount: number;
  readonly defaultClef: Clef;
}

export interface PartMeasureContent {
  readonly measureId: string;
  readonly voices: readonly Voice[];
}

export interface Voice {
  readonly id: string;
  readonly defaultStaffId: string;
  readonly sequence: MusicSequence;
}

export interface MusicSequence {
  readonly start: Fraction;
  readonly events: readonly RhythmicEvent[];
}

export interface RhythmicEvent {
  readonly id: string;
  readonly duration: NoteValue;
  readonly staffId?: string;
  readonly content: RestContent | NotesContent;
}

export interface RestContent {
  readonly kind: "rest";
}

export interface NotesContent {
  readonly kind: "notes";
  readonly notes: readonly ScoreNote[];
}

export interface ScoreNote {
  readonly id: string;
  readonly writtenPitch: WrittenPitch;
}
```

### 5.1 唯一真相与引用方向

- `measureDefinitions[]` 的数组顺序是唯一的小节顺序；Part 不保存另一份小节序号或起始时间。
- 每个 `PartMeasureContent.measureId` 指向一个全局 `MeasureDefinition`。
- `StaffDefinition` 属于 Part；Voice 属于某个 Part 的某个小节内容。
- `Voice.defaultStaffId` 与事件可选的 `staffId` 只能指向同一 Part 内的 Staff。
- Event 在 sequence 数组中的顺序是声部内顺序；Event 不保存 `offset`、`startTick` 或 `absoluteTime`。
- Note 属于 `NotesContent`；Core Note 不保存弦号、品位、调弦或吉他技巧。
- 所有 measure、part、staff、voice、event、note ID 在同一文档内全局唯一，避免扩展引用产生歧义。

### 5.2 Measure 完整性

- 每个 Part 对每个全局 measure 必须恰好有一个 `PartMeasureContent`。
- 内容数组本身不形成第二套顺序；消费方必须按 `measureDefinitions[]` 解析。
- 每个 Measure 可容纳多个 Voice；首版 profile 只支持一个 Voice。
- Voice 的 sequence 可以从非零位置开始且可以不填满小节，这是长期 schema 的合法表达；首版 profile 要求从 `0/1` 开始并以显式 rest 填满整个小节。
- `pickupDuration` 是弱起小节的有效长度覆盖；首版 profile 不支持弱起，但语义验证可接受合法弱起。

## 6. 精确时间与记谱时值

```ts
export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

export interface NoteValue {
  readonly base: 1 | 2 | 4 | 8 | 16 | 32 | 64;
  readonly dots: 0 | 1 | 2 | 3;
  readonly timeModification?: {
    readonly actualNotes: number;
    readonly normalNotes: number;
  };
}
```

### 6.1 Fraction 契约

- 全音符为 `1/1`；四分、八分、十六分音符分别为 `1/4`、`1/8`、`1/16`。
- numerator 与 denominator 都必须是 JavaScript safe integer；denominator 必须大于 0。
- 零只能编码为 `0/1`；非零值使用最大公约数约分；符号只允许出现在 numerator。
- persisted fraction 必须已规范化，decoder 不静默修正非规范输入。
- duration 与 sequence start 不能为负；通用 Fraction 工具可表达负值以支持差值计算。
- 加、减、乘、比较与 NoteValue 换算在任何中间值或最终值超出 safe integer 时返回稳定失败结果，不舍入、不溢出、不退化为浮点近似。

### 6.2 NoteValue 换算

```text
baseDuration = 1 / base
dotMultiplier = 1 + 1/2 + ... + 1/(2^dots)
timeMultiplier = normalNotes / actualNotes
exactDuration = normalize(baseDuration * dotMultiplier * timeMultiplier)
```

例如八分音符三连音为 `1/8 * 2/3 = 1/12`。

事件开始位置由 `sequence.start + 前序事件精确时值之和` 派生。Measure 的常规时长由 `meter.numerator / meter.denominator` 派生，弱起则采用 `pickupDuration`。tick、PPQ、毫秒和布局坐标不进入持久化模型。

## 7. 音高与移调

```ts
export interface WrittenPitch {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  readonly alter: -2 | -1 | 0 | 1 | 2;
  readonly octave: number;
}

export interface SoundingPitch {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  readonly alter: number;
  readonly octave: number;
}
```

- Note 只保存 `WrittenPitch`，从而保留升降号拼写语义。
- `InstrumentDescriptor.writtenToSounding` 保存确定性的移调关系；非移调乐器为 `0/0`。
- 标准吉他采用 `diatonicSteps = -7`、`chromaticSemitones = -12`；书写 E3 派生为发声 E2。
- 派生必须同时满足字母级数与半音级数；无法形成一致拼写时返回稳定诊断，而不是猜测 enharmonic spelling。
- 吉他调弦保存实际 `SoundingPitch`。弦号/品位推导出的发声音高必须与 Core Note 派生出的发声音高一致。
- Core 不保存第二份 `soundingPitch`，也不把吉他八度记谱硬编码到 Note。

## 8. ExtensionBlock 与 Guitar Domain

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ExtensionOwner =
  | { readonly kind: "score" }
  | { readonly kind: "part"; readonly partId: string };

export interface ExtensionBlock {
  readonly namespace: string;
  readonly schemaVersion: number;
  readonly owner: ExtensionOwner;
  readonly payload: { readonly [key: string]: JsonValue };
}
```

K1 仅允许 score/part owner。同一 owner 下 namespace 唯一；namespace 必须符合稳定命名规则，schemaVersion 必须是正 safe integer，payload 必须是 JSON object。Core 对未知 payload 深度保留，但只验证信封与 owner 引用。

首个官方吉他扩展使用固定 namespace `org.brilliantguitar.guitar`：

```ts
export interface GuitarExtensionV1 {
  readonly tuning: readonly SoundingPitch[];
  readonly placements: readonly GuitarNotePlacement[];
  readonly techniques: readonly GuitarTechniqueData[];
}

export interface GuitarNotePlacement {
  readonly noteId: string;
  readonly stringNumber: number;
  readonly fret: number;
}
```

Guitar Domain 负责：

- tuning 数量、顺序和发声音高合法性；
- noteId 必须位于扩展 owner 对应的 Part；
- 每个当前 profile 中的吉他音符恰好有一个 placement；
- string/fret 范围与唯一性；
- `tuning + fret`、Part 移调与 WrittenPitch 三者发声音高一致；
- bend、slide、vibrato 等已实现技巧的 payload 结构和引用。

Core 不提供 technique registry、extension registry、插件发现、权限 capability 或运行时加载。当前测试技巧定义不会成为生产 API。

### 8.1 未知扩展保留级别

- 保证：decode 后再 encode，未知 payload 的 JSON 数据类型、键值、数组顺序与数值意义不变。
- 不保证：原始空格、换行、对象属性原始顺序、数字文本写法、压缩包字节或文件字节完全一致。
- 原始字节保留是未来 `.bgp` 持久化层的责任，不属于纯语义内核。

## 9. 三层输入与验证

### 9.1 Decode

```ts
type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
```

职责：捕获 JSON 语法错误；验证对象/数组/标量类型、必填字段、discriminated union、版本和严格 Core 字段；深度复制并保留合法扩展 payload。Core 类型之外的未知普通字段不被静默吞掉。普通畸形输入不得逃逸异常。

### 9.2 Semantic validation

职责：验证 ID 唯一性、引用完整性、Part 的 measure 全覆盖、Staff 归属、Fraction 规范化、Meter/Tempo/Pitch 范围、Voice 时值不越界、移调可计算、Extension owner/namespace 合法等跨字段不变量。

### 9.3 Supported-feature validation

职责：接受一个已经结构与语义合法的 `ScoreDocument` 和显式 `ScoreFeatureProfile`，返回当前产品不能编辑的特征。它不把合法的多 Part、多 Staff、多 Voice、和弦、附点、连音或弱起报告成损坏。

```ts
export interface ScoreFeatureProfile {
  readonly id: string;
  readonly partCount: CardinalityConstraint;
  readonly staffCountPerPart: CardinalityConstraint;
  readonly voiceCountPerMeasure: CardinalityConstraint;
  readonly meters: readonly Meter[];
  readonly allowPickup: boolean;
  readonly requireSequenceStartAtZero: boolean;
  readonly requireCompleteMeasure: boolean;
  readonly noteValueBases: readonly NoteValue["base"][];
  readonly noteValueDots: readonly NoteValue["dots"][];
  readonly allowTimeModification: boolean;
  readonly maximumNotesPerEvent: number;
}

export interface CardinalityConstraint {
  readonly minimum: number;
  readonly maximum: number;
}

export type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | {
      readonly status: "unsupported";
      readonly diagnostics: readonly UnsupportedDiagnostic[];
    }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    };
```

首版 profile 固定为：一个 Part、一个 Staff、每小节一个 Voice、4/4、sequence 从 `0/1` 开始且填满小节、四分/八分/十六分、无附点、无 time modification、单音或 rest、无弱起。

Profile 字段负责表达支持策略；返回结果负责表达判断状态。`unsupported` 只携带 `unsupported.*`，`invalid` 只携带 `semantic.*`，调用者不得从通用 `ok: false` 推断两者。

### 9.4 诊断合同

每条诊断至少包含稳定 `code`、`messageKey`、结构化 `path` 与可选 `details`。人类文本不是机器合同。诊断必须区分 `decode.*`、`semantic.*`、`unsupported.*` 和 `guitar.*` 命名空间，结果顺序稳定，不能依赖异常文本。

## 10. JSON Round-trip 与版本

- 第一份正式 schema version 为 `brilliant-score-1`。
- 当前 K1-1 尚未发布且没有被 UI、命令或物理文件格式依赖，因此直接替换，不为旧草案建立兼容层或迁移器。
- `decode(encode(document))` 必须在规范化语义上等价；已知和未知扩展都参与 round-trip 测试。
- 未来版本不得静默接受更高 schemaVersion；应安全返回 unsupported/future-version 结果，并由未来持久化层决定只读或迁移策略。
- 物理 `.bgp` 容器、zip 条目和原始字节保留属于后续文件 IO 任务。

## 11. 不变量清单

1. 文档至少有一个 measure 和一个 Part；首版 profile 恰好一个 Part。
2. 全部实体 ID 文档内唯一，所有引用可解析且符合所有权。
3. 每个 Part 对全局 measure 恰好覆盖一次。
4. Event duration 必须大于零；sequence start 非负；事件累计不得超过有效 measure 时长。
5. 首版 profile 要求每个 Voice 恰好填满 measure，空白必须显式使用 rest。
6. NotesContent 至少一个 Note；首版 profile 恰好一个 Note。
7. WrittenPitch、Transposition 和派生 SoundingPitch 必须在明确范围内且运算确定。
8. 每个 ExtensionBlock 的 owner 有效；同 owner/namespace 不重复；payload 是合法 JsonValue。
9. 未知扩展经过语义 round-trip 不丢失。
10. fixture、clone helper 和测试技巧定义不得从生产入口导出。

## 12. 测试设计

### Core 必测资产

- 首版合法单 Part 吉他记谱 fixture；
- 合法双 Staff 钢琴 fixture，语义通过但首版 profile 返回 unsupported；
- 合法多 Part fixture，语义通过但首版 profile 返回 unsupported；
- 和弦、附点、time modification 与弱起的合法 fixture，分别验证 schema 与 profile 边界；
- JSON 语法错误、缺字段、错误 union kind、非规范 Fraction、safe integer 溢出；
- 重复 ID、断裂 measure/staff/note 引用、重复/遗漏 PartMeasureContent、Voice 越界；
- 未知 ExtensionBlock 的嵌套 object/array/null/number round-trip；
- 生产入口边界测试，证明不再导出 fixtures/test helpers。

### Guitar 必测资产

- 标准调弦中 Written E3 通过移调与空六弦得到 Sounding E2；
- 错误 string/fret、重复 placement、跨 Part noteId 与弦品/音高不一致；
- GuitarExtension 已知版本正确解析，未知版本由 Core 保留但当前 Guitar Domain 返回 unsupported；
- Guitar fixture 与通用 ScoreDocument round-trip 后语义不变。

## 13. 执行与回滚边界

### Block 1：Core Kernel 地基替换

仅实现通用 domain、Fraction/NoteValue、pitch/transposition、codec、semantic validator、feature profile 和公共 API 清理。全部 Core 测试与边界测试通过后停止，提交用户验收。该块不引入任何吉他字段。

### Block 2：Guitar Domain 地基

仅在 Block 1 获得验收后开始。实现官方 GuitarExtension、调弦、弦品映射与吉他验证。它作为独立任务/提交存在，可以在不回滚 Core schema 的情况下单独回滚。

任何一块不得夹带 K1-2 命令、UI、播放、渲染或物理文件 IO。

## 14. 稳定规范同步

实施前先把本设计中批准的合同同步到 `.trellis/spec/core-kernel/`，该目录随后成为编码的唯一有效合同。至少需要更新：

- `backend/score-document-model.md`：替换旧 timeline/slot/tick 模型；
- `backend/quality-guidelines.md`：改为三层验证、稳定诊断与 unknown 输入边界；
- `backend/pure-kernel-boundary.md`：写清 Core/Guitar/adapter 单向依赖；
- `backend/errors-reports.md`：收敛为本设计的稳定诊断合同；
- `backend/registry-capability.md`：明确 registry/capability 不属于 K1-1；
- `index.md` 与 `backend/index.md`：更新有效规范导航；
- K1 父任务与 K1-1 子任务摘要：标明旧草案被本次批准设计取代，避免双重真相。

同步必须在写第一行实现代码前完成，并接受一次文档差异审核。
