# SPEC-001 谱面核心对象模型

> 产品级接口投影。字段级唯一契约是
> `.trellis/spec/core-kernel/backend/score-document-model.md`；发生差异时以后者及
> `07-13-k1-1-foundation-replanning/design.md` 为准。

## 1. Scope / Trigger

本规范适用于创建、解码、编码和验证 `brilliant-score-1` 文档的所有 Core K1-1 入口。它不适用于物理文件 IO、命令/history、播放、布局、导出、registry/capability 或 GuitarExtension 语义。

任何新增持久化谱面字段、改变 owner/引用关系、改变 Fraction/NoteValue 规则或改变诊断兼容面，都必须先更新稳定规范与本产品投影。

## 2. Signatures

```typescript
interface ScoreDocument {
  readonly schemaVersion: "brilliant-score-1"
  readonly id: string
  readonly metadata: ScoreMetadata
  readonly measureDefinitions: readonly MeasureDefinition[]
  readonly parts: readonly Part[]
  readonly extensions: readonly ExtensionBlock[]
}

interface Part {
  readonly id: string
  readonly instrument: InstrumentDescriptor
  readonly staves: readonly StaffDefinition[]
  readonly measureContents: readonly PartMeasureContent[]
}

interface PartMeasureContent {
  readonly measureId: string
  readonly voices: readonly Voice[]
}

interface Voice {
  readonly id: string
  readonly defaultStaffId: string
  readonly sequence: {
    readonly start: Fraction
    readonly events: readonly RhythmicEvent[]
  }
}

interface RhythmicEvent {
  readonly id: string
  readonly duration: NoteValue
  readonly staffId?: string
  readonly content: RestContent | NotesContent
}

interface Fraction {
  readonly numerator: number
  readonly denominator: number
}

interface NoteValue {
  readonly base: 1 | 2 | 4 | 8 | 16 | 32 | 64
  readonly dots: 0 | 1 | 2 | 3
  readonly timeModification?: {
    readonly actualNotes: number
    readonly normalNotes: number
  }
}

interface ScoreNote {
  readonly id: string
  readonly writtenPitch: WrittenPitch
}

interface ExtensionBlock {
  readonly namespace: string
  readonly schemaVersion: number
  readonly owner:
    | { readonly kind: "score" }
    | { readonly kind: "part"; readonly partId: string }
  readonly payload: JsonObject
}

type DecodeResult =
  | { readonly ok: true; readonly value: ScoreDocument }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | { readonly status: "unsupported"; readonly diagnostics: readonly UnsupportedDiagnostic[] }
  | { readonly status: "invalid"; readonly diagnostics: readonly SemanticDiagnostic[] }
```

完整类型签名、字段约束和导出名称由稳定 Core 规范与 `src/core-kernel/` 公共入口控制，本文件不复制全部实现细节。

## 3. Contracts

- `measureDefinitions[]` 是全谱唯一小节顺序与拍号事实。
- 每个 Part 必须对每个全谱 measureId 恰有一个 `PartMeasureContent`。
- Staff 归属 Part；Voice/Event 的 staff 引用不得跨 Part。
- Event 数组顺序决定事件起点；offset、tick、毫秒和布局坐标不得持久化。
- Fraction 必须是安全整数、正分母、gcd 约分且符号规范；运算不得转为浮点兜底。
- WrittenPitch 是持久化事实；SoundingPitch 由 WrittenPitch 与 Part transposition 派生。
- ExtensionBlock 对未知 payload 保持 JSON 语义保真；Core 不解释 Guitar 或第三方 namespace。
- 所有 decode/validation API 都不修改输入，普通畸形输入以结果对象失败。
- Schema 表达力与 `ScoreFeatureProfile` 支持面严格分离；Profile 使用 `ScoreSupportResult.status` 区分 supported、unsupported 和 invalid。

## 4. Validation & Error Matrix

| Stage | Rejects | Stable family | Must not do |
|---|---|---|---|
| Decode | malformed JSON/unknown shape, wrong type, extra/missing field, union mismatch, future schema | `decode.*` | throw untyped errors or silently drop fields |
| Semantic | duplicate/empty IDs, broken references, measure coverage, non-canonical Fraction, invalid pitch/time/extension envelope | `semantic.*` | report product unsupported or repair input |
| Feature profile | legal multi-Part/Staff/Voice, chord, dot, time modification, pickup or unsupported meter | `status: "unsupported"` + `unsupported.*` | use generic `ok: false` or call legal data corrupt |
| Guitar Domain later | tuning, string/fret and guitar-technique payload semantics | `guitar.*` | place guitar rules in Core K1-1 |

诊断格式必须包含稳定 `code`、`core.${code}` messageKey、结构化路径、可选 JsonObject details，并保持确定顺序。

## 5. Good / Base / Bad Cases

- Good：单 Part、单 Staff、每小节单 Voice 的合法 `brilliant-score-1` 文档完成 decode、semantic，并从当前 profile 得到 `status: "supported"`。
- Good：未知 Part-owned 扩展含嵌套对象/数组时，encode 后再次 decode 保持 JSON 语义相等。
- Base：合法和弦通过 semantic validation，并收到 `status: "unsupported"` 与 `unsupported.chord`。
- Base：标准吉他用 Part transposition 派生实际音高；Core 文档不含具体调弦或弦品位置。
- Bad：Part 漏掉全谱某小节内容，返回 `semantic.measure-coverage-missing`。
- Bad：Event 出现持久化 `startTick`，严格解码返回 `decode.extra-field`。
- Bad：未知 extension owner 指向不存在 Part，返回 `semantic.extension-owner-missing`。

## 6. Tests Required

- Fraction/NoteValue 规范化、精确运算、附点、连音比例与安全整数溢出。
- 文档构造、语义 JSON round-trip、严格额外字段和未来 schema 拒绝。
- ID/引用/小节覆盖/序列边界/移调/ExtensionBlock 语义验证。
- 单 Part supported fixture 与多 Part、双 Staff、和弦、附点、连音、弱起等 semantic-valid unsupported fixtures。
- 深层未知扩展 payload 往返与公共导出边界。
- 每个新增稳定诊断 code 的正向和反向行为测试。

## 7. Wrong vs Correct

```typescript
// Wrong: persist one adapter's clock as score truth.
event.startTick = 960

// Correct: derive position from the ordered voice sequence.
const start = sequence.start + sum(previousEvents.map(toExactDuration))

// Wrong: Core interprets guitar-private payload.
core.validateFret(extension.payload.fret)

// Correct: Core preserves the envelope; Guitar Domain validates known payload.
core.validateExtensionEnvelope(extension)
guitarDomain.decodeAndValidate(extension)
```
