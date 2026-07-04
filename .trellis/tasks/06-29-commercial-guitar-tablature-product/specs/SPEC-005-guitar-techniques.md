# SPEC-005 吉他技巧注册框架

## 状态

- 状态: 已确认 Core Kernel K1 技巧框架边界。
- 映射需求: `REQ-002`、`REQ-003`、`REQ-011`、`SPEC-015`。
- 目标: 定义技巧如何作为结构化、可注册、可验证的数据进入 Core Kernel，而不是固定某几个硬编码技巧。

## 适用范围

本 spec 当前只约束 Pure Core Kernel V1 的技巧数据契约和测试技巧定义。UI 输入、SVG/VexFlow 显示、真实播放效果、导出排版和完整吉他技巧库属于后续外部模块实现。

## 设计原则

- Core Kernel K1 只保存通用 `TechniqueData`。
- 具体技巧必须通过 `TechniqueDefinition` 注册。
- `test.slide`、`test.bend`、`test.vibrato` 是 K1 测试技巧定义，用于证明技巧框架可用，不是内核硬编码枚举。
- 技巧目标只允许指向一个或多个有声音符。
- 技巧不得指向 `rest`。
- 技巧参数必须是 JSON 可序列化结构，并由注册定义校验。
- 新增技巧不得散落硬编码到 UI、渲染、播放或导出层。

## 技巧分类

分类用于产品规划、UI 分组和文档组织，不是 Core Kernel K1 持久化技巧枚举。

```ts
export type TechniqueCategory =
  | "legato"
  | "pitch_expression"
  | "sustain_mute_noise"
  | "attack_dynamics"
  | "harmonics"
  | "chord_rhythm"
```

## K1 测试技巧定义

K1 测试至少注册 3 个技巧定义:

- `test.slide`: `legato`，有序 2 个目标 note。
- `test.bend`: `pitch_expression`，1 个目标 note。
- `test.vibrato`: `pitch_expression`，1 个目标 note。

这些定义必须能验证:

- registry 注册。
- target note 存在。
- target 不能是 rest。
- target 数量符合定义。
- `params` 通过定义校验。
- 保存、重开、迁移入口、撤销/重做和 fixture round-trip 不丢失数据。

## 后续技巧候选

以下候选不阻塞 Pure Core Kernel V1:

- P0 Follow-up: `hammer_on`、`pull_off`、`palm_mute`。
- P0 Extended: `release`、`let_ring`、`dead_note`、`ghost_note`、`accent`、`staccato`、`pick_stroke_up`、`pick_stroke_down`、`natural_harmonic`、`arpeggio`。
- P1: `pre_bend`、`grace_note`、`tremolo_picking`、`artificial_harmonic`、`legato_slide`。
- P2: `tapping`、`pinch_harmonic`、`tapped_harmonic`、`whammy_bar_curve`、`sweep_picking`、`rasgueado`、`classical_right_hand_fingering`、`multi_step_bend_curve`。

## 数据契约

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
  category: TechniqueCategory
  targetRule: TechniqueTargetRule
  parameterSchemaVersion: string
  validateParams: TechniqueParamValidator
  displayKey?: string
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

export type K1TestTechniqueDefinitionId =
  | "test.bend"
  | "test.vibrato"
  | "test.slide"

export interface K1TestBendParams {
  semitones: 1 | 2
}

export interface K1TestVibratoParams {
  width: "narrow" | "wide"
}

export interface K1TestSlideParams {
  slideKind: "shift" | "legato"
}
```

规则:

- `definitionId` 是技巧稳定身份，不随 UI 语言变化。
- `TechniqueDefinition` 必须通过 `KernelRegistry` 注册，注册入口遵守 `SPEC-015-kernel-registry-capability.md`。
- 重复 `definitionId` 必须被拒绝。
- 未注册 `definitionId` 必须产生 `technique-definition-missing`。
- `targetNoteIds.length` 不符合定义必须产生 `technique-target-count-invalid`。
- `params` 不符合定义必须产生 `technique-params-invalid`。
- K1 测试技巧的 definition id、参数字段、参数值、错误码和序列化字段必须使用英文稳定标识；中文名称只允许存在于 i18n 或 UI 显示层。
- 未知技巧数据的保留策略由 schema/迁移和 report 规划继续约束；K1 不因为未知技巧执行外部代码。

## K1 测试定义建议

```ts
export const testSlideDefinition: TechniqueDefinition = {
  id: "test.slide",
  category: "legato",
  targetRule: { minNotes: 2, maxNotes: 2, ordered: true, allowRest: false },
  parameterSchemaVersion: "1",
  validateParams: validateSlideParams,
  displayKey: "technique.slide",
}

export const testBendDefinition: TechniqueDefinition = {
  id: "test.bend",
  category: "pitch_expression",
  targetRule: { minNotes: 1, maxNotes: 1, ordered: false, allowRest: false },
  parameterSchemaVersion: "1",
  validateParams: validateBendParams,
  displayKey: "technique.bend",
}

export const testVibratoDefinition: TechniqueDefinition = {
  id: "test.vibrato",
  category: "pitch_expression",
  targetRule: { minNotes: 1, maxNotes: 1, ordered: false, allowRest: false },
  parameterSchemaVersion: "1",
  validateParams: validateVibratoParams,
  displayKey: "technique.vibrato",
}
```

最小参数契约保持很薄，但必须可测试，不能永远校验通过:

- `test.slide`: 只接受 `{ "slideKind": "shift" }` 或 `{ "slideKind": "legato" }`；必须有 2 个不同目标 note，且第二个目标 note 在音乐时间上晚于第一个。
- `test.bend`: 只接受 `{ "semitones": 1 }` 或 `{ "semitones": 2 }`。
- `test.vibrato`: 只接受 `{ "width": "narrow" }` 或 `{ "width": "wide" }`。

## 强制规则

- TECH-001: 技巧不得只作为文本保存。
- TECH-002: 技巧必须绑定明确目标。
- TECH-003: 技巧目标只能是有声 note。
- TECH-004: 技巧定义必须通过 registry 注册。
- TECH-005: `test.slide`、`test.bend`、`test.vibrato` 只能作为 K1 测试定义进入内核，不能成为封闭技巧枚举。
- TECH-006: 技巧字段必须能被后续渲染、播放、导入导出层读取并降级说明。
- TECH-007: 后续技巧候选不得作为 Pure Core Kernel V1 阻塞项。
- TECH-008: `chord` target 后置到和弦能力进入范围后再加入，K1 不支持。
- TECH-009: 新增技巧必须通过 `KernelRegistry.register` 注册，不得通过硬编码分支散落在 UI、渲染、播放和导出层。
- TECH-010: 注册能力和执行能力分离；能注册技巧定义不等于能修改谱面。

## 测试要求

- [ ] AC-SPEC-005-01: K1 可以注册 `test.slide`、`test.bend`、`test.vibrato` 三个测试技巧定义。
- [ ] AC-SPEC-005-02: `TechniqueData.definitionId` 未注册时产生稳定 diagnostic。
- [ ] AC-SPEC-005-03: 技巧目标指向 rest 或不存在 note 时产生稳定 diagnostic。
- [ ] AC-SPEC-005-04: 技巧目标数量不符合定义时产生稳定 diagnostic。
- [ ] AC-SPEC-005-05: 技巧 params 不符合定义时产生稳定 diagnostic。
- [ ] AC-SPEC-005-05B: `test.bend`、`test.vibrato` 和 `test.slide` 的非法参数值会返回 `technique-params-invalid`，合法参数值能通过校验。
- [ ] AC-SPEC-005-05C: `test.slide` 的两个目标 note id 相同或时间顺序错误时产生稳定 diagnostic。
- [ ] AC-SPEC-005-06: fixture round-trip 后技巧 `id`、`definitionId`、`targetNoteIds` 和 `params` 不丢失。
- [ ] AC-SPEC-005-07: undo/redo 能按命令粒度撤销和恢复技巧数据。
