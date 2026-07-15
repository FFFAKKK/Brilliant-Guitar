# K1-1 Core Foundation 正式验收报告

## 唯一结论

**通过。** 固定验收提交 `30894e2f395779f4fff970b458690765d45a393d` 满足 K1-1 已批准合同；合入原分支后的 fresh 测试为 49/49，且没有未处置的 P0、P1 或 P2。

`K1A-FIND-001`～`K1A-FIND-003` 已全部关闭。`codex/k1-1-p1-repair` 已于 2026-07-15 fast-forward 合入 `codex/k1-1-core-foundation`，后者可以作为 K1-1 正式分支基线。K1-1 核心谱面模型到此冻结，不再继续整理式重构。

本结论只开放 K1-2 Commands / Transactions / History 的独立规划；K1-2 的 PRD、设计和实施计划通过审核前，不授权编写 K1-2 生产代码。

## 规范同步判定

本轮不修改 `.trellis/spec/`。三个发现都源于活动规范已经明确的合同；P1 修复使实现与测试满足既有 sparse-array、closed diagnostic code 和 pure-kernel boundary 约束，没有产生新的规范决策。

## 基线与范围

- 最终审查目标：`30894e2f395779f4fff970b458690765d45a393d`。
- 相对 `master`：`0 behind / 7 ahead`。
- 原始提交：`d85973f` 文档合同、`7297826` Core 实现、`046f046` 测试与首次验收。
- P1 修复：`ed3605f` 稀疏结构数组、`0bc11e6` 依赖扫描器、`511e243` 稳定诊断闭集、`30894e2` 动态依赖绕过收口。
- 相对 `046f046` 的生产/测试差异严格限制为 4 个文件：1 个生产 codec、2 个既有测试文件和 1 个新增依赖边界测试文件。
- 唯一生产代码变化是 `src/core-kernel/codec/decode-score-document.ts`；ScoreDocument、时间、音高、Feature Profile、ExtensionBlock 和公共导出均未修改。
- 没有混入 Guitar Domain、K1-2、UI、渲染、音频、物理文件 IO、registry 或 plugin runtime。

## 新鲜运行证据

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 退出码 0 | 通过。 |
| `npm run build` | 退出码 0 | 通过；刷新被忽略的 `dist/`。 |
| `npm test`（获批后在沙箱外重跑） | 退出码 0 | 49 tests，49 pass，0 fail，约 488.9 ms。 |
| `git diff --check` | 退出码 0 | 通过；仅有 LF→CRLF 工作区转换提示。 |
| `git status --short` | 仅文档治理变更 | 没有未提交生产源码或测试。 |

沙箱中的 `spawn EPERM` 是 Node 测试子进程受限导致的环境失败；获批的新进程验证已通过，不将环境故障记为产品失败或测试成功。

## P1 关闭记录

### K1A-FIND-001 — 已关闭：结构型稀疏数组稳定诊断

**合同依据**

- `.trellis/spec/core-kernel/backend/errors-reports.md:53-55` 将 `code` 与 `path` 定义为稳定机器合同。
- 同文件 `:80` 明确规定通过 `unknown` API 提交 JavaScript sparse array 时返回 `decode.json-value`。
- 同文件 `:86` 要求 sparse arrays 的 decode code 与 path 形成稳定断言。

**代码与测试证据**

- `src/core-kernel/codec/decode-score-document.ts:132-156` 的 `decodeArray` 按索引读取 hole，但没有把结构型 hole 归类为 `decode.json-value`。
- `test/core-kernel/score-document-codec.test.ts:186-210` 只覆盖 ExtensionBlock payload 内部的稀疏数组；该路径由 JsonValue 校验返回 `decode.json-value`，没有覆盖 `parts`、`staffs` 等结构数组。

**可复现行为**

1. 从有效 fixture 克隆文档。
2. 设置 `document.parts = new Array(1)`。
3. 调用 `decodeScoreDocument(document)`。
4. 实际结果：`decode.type`，path 为 `["parts", 0]`。
5. 活动合同期望：`decode.json-value`，同一 path。

**关闭证据**

`ed3605f` 在统一 `decodeArray` 入口识别 hole；`parts[0]` 与嵌套 `events[0]` 均返回 `decode.json-value` 和精确索引 path，ExtensionBlock payload 的既有行为保持不变。

### K1A-FIND-002 — 已关闭：forbidden dependency 自动化边界

**合同依据**

- `.trellis/spec/core-kernel/backend/quality-guidelines.md:17` 将 `public-export/forbidden-dependency boundaries` 列为 K1-1 必需测试。
- `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md:12-21` 明确列出 Core 纯边界和允许职责。
- 本验收严重度模型把“测试无法证明核心不变量”定义为 P1。

**代码与测试证据**

- 当前 11 个生产文件的 import 全量静态核对只发现 Core 内部相对依赖；当前实现没有违禁依赖。
- `test/core-kernel/smoke.test.ts:6-19` 只断言 `PURE_CORE_KERNEL_V1_SCOPE` 自声明的字符串常量。
- `test/core-kernel/public-api-boundary.test.ts:6-41` 只断言公开 export 名单。
- 两个测试都不会因为生产文件新增 React、Tauri、渲染、音频、文件 IO、Guitar Domain 或插件运行时 import 而必然失败。

**关闭证据**

`0bc11e6` 使用 TypeScript AST 扫描全部 Core 生产 import；`30894e2` 进一步对非字面量 `import()` / `require()` fail closed，并覆盖 `ImportTypeNode`。外部模块、Node builtin、越界路径、动态/computed 引用和 inline 外部 import type 都能触发 violation，Core 内部相对 import type 仍被允许。

### K1A-FIND-003 — 已关闭：闭集诊断完整稳定行为断言

**合同依据**

- `.trellis/spec/core-kernel/backend/errors-reports.md:53-70` 将 decode、semantic、unsupported code 定义为稳定闭集。
- 同文件 `:84-90` 要求 malformed、reference、coverage、time、pitch/transposition、extension 等失败返回稳定 code/path。
- `.trellis/spec/core-kernel/backend/quality-guidelines.md:12-17` 把 strict decode、semantic references/time/extensions 与边界测试列为 K1-1 必需项。

**覆盖核对**

按 `test/core-kernel/**/*.test.ts` 中对完整 diagnostic code 字符串的显式断言统计：

- Decode：定义 10 个，显式断言 6 个；缺少 `decode.encode-failed`、`decode.non-finite-number`、`decode.required-field`、`decode.type`。
- Semantic：定义 31 个，显式断言 16 个；缺少 `semantic.fraction-sign-invalid`、`semantic.id-empty`、`semantic.measure-duration-invalid`、`semantic.measure-reference-missing`、`semantic.meter-denominator-invalid`、`semantic.meter-numerator-invalid`、`semantic.note-value-invalid`、`semantic.pickup-exceeds-measure`、`semantic.sequence-start-out-of-bounds`、`semantic.sounding-pitch-invalid`、`semantic.staff-line-count-invalid`、`semantic.staff-required`、`semantic.time-arithmetic-overflow`、`semantic.voice-required`、`semantic.written-pitch-invalid`。
- Unsupported：定义 11 个，显式断言 11 个。

只读运行探针确认部分未覆盖 code 当前能够产生，例如 `decode.required-field`、`semantic.id-empty`、`semantic.pickup-exceeds-measure`、`semantic.staff-line-count-invalid` 和 `semantic.fraction-sign-invalid`；但临时探针不是可回归的测试证据，也不能证明剩余闭集合同。

**关闭证据**

`511e243` 补齐完整 diagnostic 对象和确定性断言：Decode 10/10、Semantic 31/31、Unsupported 11/11，缺失均为 0。

## 最终合同结论

- `ScoreDocument`、Fraction/NoteValue、Written/Sounding Pitch、三态 Feature Profile、ExtensionBlock round-trip 和公开 export 主体与批准设计一致。
- 未发现 tick/slot 持久化回流、Guitar payload 解释、fixture 生产导出、Guitar Domain 或 K1-2 提前实现。
- 未发现 P0 数据真相破坏、静默丢失、普通输入崩溃或验证完全绕过。
- Requirements：12 项满足、1 项过程记录、0 项部分满足。
- Acceptance Criteria：12/12 满足。
- 未发现新的 P0/P1/P2。

## 下一 Gate

1. 单独提交验收报告、合同矩阵和产品执行状态。
2. 正式关闭 K1-1 Core Foundation 与人工验收任务。
3. 新建 K1-2 Commands / Transactions / History 规划任务。
4. K1-2 规划通过用户审核前，不开始生产代码。
