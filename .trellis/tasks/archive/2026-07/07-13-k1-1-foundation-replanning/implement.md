# K1-1 地基替换实施计划

> 状态：用户已于 2026-07-13 审核通过。Core Block 使用独立 Trellis 子任务执行；Guitar Block 仍保留单独验收门。

## 1. 实施策略

采用测试驱动、两块交付：

1. **Block 1 — Core Kernel schema replacement**：稳定规范、精确分数、核心模型、codec、语义验证、feature profile、公共边界。
2. **人工验收门**：Core 全套验证通过后停止，向用户解释每个变更文件的作用。
3. **Block 2 — Guitar Domain foundation**：官方 guitar 扩展、调弦/弦品映射、吉他语义验证。
4. **最终验收门**：集成测试、稳定文档和任务状态一致后，才讨论 K1-2。

执行时建议把两个 Block 建成当前规划任务下的两个子任务/独立提交；不得并行实施，不得跨门混改。

## 2. 通用质量门

每个步骤遵循 RED → GREEN → REFACTOR：

1. 先增加一个能证明合同的失败测试；
2. 运行该测试并确认失败原因正是缺少目标能力；
3. 写最小生产实现；
4. 运行目标测试和相关回归；
5. 只在全绿后整理命名与重复；
6. 检查 `git diff`，不混入用户现有改动。

当前 `package.json` 的有效质量命令是 `npm run typecheck`、`npm run build` 与 `npm test`；项目没有 lint 脚本，计划不虚构 lint 门。定向测试先编译，再按步骤运行以下确切命令中的对应文件：

```powershell
npm run build
node --test dist/test/core-kernel/fraction.test.js
node --test dist/test/core-kernel/note-value.test.js
node --test dist/test/core-kernel/score-document-model.test.js
node --test dist/test/core-kernel/pitch-transposition.test.js
node --test dist/test/core-kernel/score-document-codec.test.js
node --test dist/test/core-kernel/score-semantics.test.js
node --test dist/test/core-kernel/unknown-extension-roundtrip.test.js
node --test dist/test/core-kernel/score-feature-profile.test.js
node --test dist/test/core-kernel/public-api-boundary.test.js
node --test dist/test/guitar-domain/guitar-extension-codec.test.js
node --test dist/test/guitar-domain/guitar-pitch-validation.test.js
node --test dist/test/guitar-domain/guitar-techniques.test.js
node --test dist/test/guitar-domain/guitar-core-loop.test.js
npm run typecheck
npm test
```

尚未创建的测试文件只在对应 RED 步骤创建后运行；不能因为命令当前找不到文件而跳过 RED 证据。

## 3. Block 1 — Core Kernel 地基替换

### Step 1：同步稳定规范，消除旧合同

**修改文件**

- `.trellis/spec/core-kernel/backend/score-document-model.md`
- `.trellis/spec/core-kernel/backend/quality-guidelines.md`
- `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`
- `.trellis/spec/core-kernel/backend/errors-reports.md`
- `.trellis/spec/core-kernel/backend/registry-capability.md`
- `.trellis/spec/core-kernel/index.md`
- `.trellis/spec/core-kernel/backend/index.md`
- `.trellis/tasks/07-07-pure-core-kernel-v1/prd.md`
- `.trellis/tasks/07-07-pure-core-kernel-v1/design.md`
- `.trellis/tasks/07-07-pure-core-kernel-v1/implement.md`
- 当前 K1-1 子任务中仍宣称 timeline/slot/tick 为有效合同的摘要文件

**动作**

- 将 `measureDefinitions + parts + extensions`、WrittenPitch、Fraction/NoteValue、三层验证和 ScoreFeatureProfile 写成唯一有效规范。
- 明确旧 `timeline / RhythmSlot / fixed PPQ / technique registry` 草案被替换，不保留并行有效描述。
- 文档中只链接稳定 spec，不复制第二套字段定义。

**验证**

- `rg -n "timeline|RhythmSlot|ticksPerQuarter|TechniqueRegistry" .trellis/spec/core-kernel .trellis/tasks/07-07-pure-core-kernel-v1`
- `rg -n "T[B]D|T[O]DO" .trellis/spec/core-kernel .trellis/tasks/07-07-pure-core-kernel-v1`
- 人工核对所有命中：历史说明可以保留，但不得再被表述为当前合同。
- 审核文档 diff；本步骤不得修改 `src/` 或 `test/`。

**检查点**：稳定规范审核通过后才进入代码。

### Step 2：用测试固定 Fraction 契约

**新增文件**

- `test/core-kernel/fraction.test.ts`
- `src/core-kernel/domain/fraction.ts`

**先写失败测试**

- `0/x` 只接受规范形式 `0/1`；
- 约分、负号位置、比较、加减乘；
- denominator 为 0、非 safe integer、非规范 persisted fraction；
- 中间乘法与最终结果溢出返回稳定失败；
- `1/8 * 2/3 = 1/12`。

**最小接口**

```ts
export type FractionResult =
  | { readonly ok: true; readonly value: Fraction }
  | { readonly ok: false; readonly code: FractionErrorCode };

export function createFraction(numerator: number, denominator: number): FractionResult;
export function addFractions(left: Fraction, right: Fraction): FractionResult;
export function multiplyFractions(left: Fraction, right: Fraction): FractionResult;
export function compareFractions(left: Fraction, right: Fraction): FractionResult;
```

**验证**

- 定向运行 `fraction.test.ts`；确认 RED 失败后实现；
- 运行 `npm run typecheck` 和 `npm test`。

**提交边界**：只包含 Fraction 及其测试。

### Step 3：用测试固定 NoteValue 与派生位置

**新增/修改文件**

- `src/core-kernel/domain/musical-time.ts`
- `test/core-kernel/note-value.test.ts`

**先写失败测试**

- base 1/2/4/8/16/32/64；
- 0–3 个附点；
- actual/normal time modification；
- 事件开始位置只由 sequence start 与前序时值派生；
- Measure duration 从 meter 或 pickupDuration 派生；
- 不产生浮点近似或 tick 字段。

**最小接口**

```ts
export function noteValueToFraction(value: NoteValue): FractionResult;
export function measureDuration(definition: MeasureDefinition): FractionResult;
export function deriveEventStarts(sequence: MusicSequence): DerivedEventStartsResult;
```

**验证与提交边界**：定向测试、`npm run typecheck`、`npm test`；只提交时间语义。

### Step 4：替换 ScoreDocument 结构与音高合同

**新增/修改文件**

- `src/core-kernel/domain/pitch.ts`
- `src/core-kernel/domain/extensions.ts`
- `src/core-kernel/domain/score-document.ts`
- `test/core-kernel/score-document-model.test.ts`
- `test/core-kernel/pitch-transposition.test.ts`
- `test/core-kernel/fixtures/core-score-fixtures.ts`

**删除或迁移**

- `src/core-kernel/fixtures/*` 中只服务测试的 fixture 移至 `test/`；
- 旧 `Timeline / RhythmSlot / event.slotId / startTick / durationTicks / scoreType / core tuning` 类型不再作为有效模型存在。

**先写失败测试**

- 最小合法一个 Part/Staff/Voice 文档能静态构造；
- 双 Staff 钢琴、多 Part、和弦能够由通用 schema 表达；
- Written E3 + guitar transposition 派生 Sounding E2；
- enharmonic spelling 不因派生而丢失；
- 生产模型不存在弦号、品位、tick 与第二份 sounding pitch。

**验证与提交边界**：运行目标测试、`npm run typecheck`、`npm test`；模型和纯音高派生单独提交，不同时写 decoder/validator。

### Step 5：建立严格且不抛异常的 Codec

**新增/修改文件**

- `src/core-kernel/codec/decode-score-document.ts`
- `src/core-kernel/codec/score-json.ts`
- `src/core-kernel/domain/score-json.ts`（迁移后删除或变为无逻辑转发，禁止保留两套 codec）
- `test/core-kernel/score-document-codec.test.ts`
- `test/core-kernel/fixtures/json-fixtures.ts`

**先写失败测试**

- 无效 JSON、`{}`、null、错误数组/标量、错误 union kind、未知普通 Core 字段；
- future schemaVersion；
- 深层合法未知 ExtensionBlock payload；
- `decode(encode(document))` 语义等价；
- 任意普通畸形输入返回 `DecodeResult`，不抛出未处理异常。

**实现约束**

- 禁止 `JSON.parse(text) as ScoreDocument`；
- decode helper 必须只接收 `unknown`；
- 未知扩展 payload 深复制，不通过 JSON stringify clone 实现生产逻辑；
- 诊断 code/path 顺序稳定。

**验证与提交边界**：codec 目标测试、`npm run typecheck`、`npm test`；独立提交。

### Step 6：分离 Core 语义验证

**新增/修改文件**

- `src/core-kernel/validation/diagnostics.ts`
- `src/core-kernel/validation/validate-score-semantics.ts`
- `src/core-kernel/validation/validate-score-document.ts`（拆分完成后删除或仅保留兼容门面；首版未发布时优先删除）
- `test/core-kernel/score-semantics.test.ts`
- `test/core-kernel/unknown-extension-roundtrip.test.ts`

**先写失败测试**

- 全局 ID 重复；
- 缺失/重复/未知 measure content；
- 跨 Part staff 引用和断裂引用；
- 空 notes、零/负 duration、sequence 越界；
- 非规范 Fraction、无效 meter/tempo/pitch/transposition；
- Extension owner 断裂、同 owner/namespace 重复、非法 JsonValue；
- 未知 extension round-trip 不丢数据。

**实现约束**

- validator 不做 profile 判断；
- validator 不修改输入；
- 错误路径使用结构化 segment，不把英文消息当机器合同；
- 同一输入诊断顺序稳定。

**验证与提交边界**：目标测试、`npm run typecheck`、`npm test`；语义验证单独提交。

### Step 7：增加 ScoreFeatureProfile

**新增文件**

- `src/core-kernel/profiles/score-feature-profile.ts`
- `src/core-kernel/profiles/k1-score-feature-profile.ts`
- `src/core-kernel/validation/validate-score-feature-profile.ts`
- `test/core-kernel/score-feature-profile.test.ts`

**先写失败测试**

- 首版吉他 fixture supported；
- 双 Staff 钢琴、多 Part、和弦、附点、time modification、弱起分别 semantic-valid 但 unsupported；
- profile validator 不把断裂引用重新分类为 unsupported，而是要求调用者先通过 semantic validation；
- sequence 非零开始或未填满小节在首版 profile 中 unsupported。

**验证与提交边界**：目标测试、`npm run typecheck`、`npm test`；profile 模型与验证独立提交。

### Step 8：收紧生产公共 API 和测试边界

**修改文件**

- `src/core-kernel/index.ts`
- `test/core-kernel/public-api-boundary.test.ts`
- 旧 fixture/technique test helper 文件按实际扫描结果移动或删除

**先写失败测试**

- 生产入口只导出 domain、codec、validator、profile 的正式 API；
- 不导出 fixture、clone helper、测试 technique 定义；
- `src/core-kernel/**` 不依赖 React、Tauri、VexFlow、Web Audio、Node 文件 IO 或 Guitar Domain。

**验证**

- 定向 public API/boundary 测试；
- `rg` 检查违禁依赖与旧符号；
- `npm run typecheck`、`npm run build`、`npm test`。

### Step 9：Core Block 总验收并停止

**执行**

- 从干净测试进程运行完整质量门；
- 核对 `git diff --check` 和 `git status --short`；
- 对照 design.md 的 Core 不变量逐条取证；
- 生成简短变更说明：每个新增/修改文件的职责、测试证据、已知未实现范围；
- 不开始 Guitar Domain，等待用户审核。

**Core Block 退出条件**

- `npm run typecheck`、`npm run build`、`npm test` 全绿；
- 旧 tick/slot/timeline 合同不再是有效生产路径；
- malformed JSON 不抛异常；
- semantic-valid/unsupported 分离有测试证据；
- 未知扩展 round-trip 与公共边界测试通过。

## 4. Block 2 — Guitar Domain 地基

> 仅在 Block 1 通过用户验收后创建/启动独立子任务。

### Step 10：固定 GuitarExtension V1 合同

**新增文件**

- `.trellis/spec/guitar-domain/guitar-extension.md`
- `src/guitar-domain/guitar-extension.ts`
- `test/guitar-domain/guitar-extension-codec.test.ts`
- `test/guitar-domain/fixtures/guitar-score-fixtures.ts`

**先写失败测试**

- 固定 namespace/schemaVersion/part owner；
- 标准六弦调弦按实际发声音高保存；
- placements/techniques 使用稳定 ID 引用，不复制 Core Note；
- 未知 guitar extension version 由 Core 保留、由当前 Guitar Domain 报 unsupported。

**提交边界**：只定义数据合同和官方已知 payload decoder，不实现验证规则。

### Step 11：实现吉他弦品与音高验证

**新增文件**

- `src/guitar-domain/validate-guitar-extension.ts`
- `src/guitar-domain/derive-fretted-pitch.ts`
- `test/guitar-domain/guitar-pitch-validation.test.ts`

**先写失败测试**

- 标准调弦空六弦 E2 与 Written E3 的派生结果一致；
- fret 半音递增正确；
- string/fret 越界、重复 placement、缺 placement；
- 跨 Part noteId、未知 noteId；
- 弦品派生音高与 Core sounding pitch 不一致。

**提交边界**：只包含调弦、弦品、placement 验证。

### Step 12：迁移首版吉他技巧数据

**新增/修改文件**

- `src/guitar-domain/guitar-techniques.ts`
- `src/guitar-domain/validate-guitar-techniques.ts`
- `test/guitar-domain/guitar-techniques.test.ts`

**先写失败测试**

- 仅实现当前产品已确认需要的 bend、slide、vibrato 最小 payload；
- 技巧引用只能指向 owner Part 中的 note/event；
- 错误参数与断裂引用产生稳定 `guitar.*` 诊断；
- 不建立 registry、plugin loader 或权限 capability。

**提交边界**：技巧与前一步弦品验证分开。

### Step 13：Guitar 集成验收

**修改文件**

- `src/guitar-domain/index.ts`
- `test/guitar-domain/guitar-core-loop.test.ts`
- 相关稳定 spec 与任务摘要

**验证场景**

1. 构造首版合法 ScoreDocument；
2. Core decode 通过；
3. Core semantic validation 通过；
4. K1 ScoreFeatureProfile 通过；
5. GuitarExtension validation 通过；
6. encode/decode round-trip 后再次全部通过。

随后运行 `npm run typecheck`、`npm run build`、`npm test`、`git diff --check`，向用户提交文件职责与验证证据；仍不得自动进入 K1-2。

## 5. 回滚策略

- Block 1 和 Block 2 必须是独立 Trellis 子任务与独立提交序列。
- Block 1 内每个提交只包含一种合同变化；失败时可回滚到上一个全绿步骤。
- Block 2 只新增对 Core 的单向依赖；回滚 Guitar Domain 不得要求恢复旧 Core tick/slot 模型。
- 当前 K1-1 尚未发布，不为旧草案建立迁移器；若执行前发现已有真实用户文件依赖旧 schema，必须立即停止并重新规划迁移，不得静默丢数据。
- 不使用 `git reset --hard` 或覆盖用户未提交改动；执行前记录现有 dirty worktree 基线。

## 6. 最终验收清单

- [ ] 稳定 spec 是唯一有效合同，旧草案明确退役。
- [ ] Core Kernel 没有 Guitar、UI、播放、文件 IO 或插件运行时依赖。
- [ ] ScoreDocument 只有一套小节顺序、事件顺序和音高真相。
- [ ] Fraction/NoteValue 在规范化、三连音和溢出边界上有测试。
- [ ] malformed JSON、断裂引用和 future version 安全返回稳定结果。
- [ ] semantic-valid 与 current-profile-supported 被分别验证。
- [ ] 未知 ExtensionBlock 语义 round-trip 不丢失。
- [ ] Guitar E3 → E2 与 tuning/fret 一致性有端到端测试。
- [ ] fixture/test helper 不从生产入口导出。
- [ ] Core 与 Guitar 各自拥有独立验收、提交和回滚点。
- [ ] 所有质量门从新进程运行通过，并保留命令与结果摘要。
- [ ] 用户审核通过后才启动实施；Guitar Block 再次单独过门。
