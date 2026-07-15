# Pure Core Kernel V1 实现规划

## Goal

把现有 `Pure Core Kernel V1` 总规划收敛成一个可执行、可验收、可分块推进的内核实现任务。

本任务是 Pure Core Kernel V1 路线图父任务。K1-1 原方案已被 `07-13-k1-1-foundation-replanning` 取代；独立子任务 `07-13-k1-1-core-foundation` 已在 `30894e2` 完成实现、P1 修复与正式验收。K1-2 现在允许进入独立规划，但其设计与实施计划审核通过前不得启动编码；后续 Block 同样需要各自审核。

## Source Documents

本任务严格继承以下文档，不重新发明范围:

- 父任务 PRD: `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md`
- 父任务设计: `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`
- 父任务实现计划: `.trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md`
- 稳定内核规范入口: `.trellis/spec/core-kernel/index.md`
- 详细内核规范入口: `.trellis/spec/core-kernel/backend/index.md`
- 具体规范: `pure-kernel-boundary.md`、`score-document-model.md`、`command-transaction.md`、`snapshot-events.md`、`registry-capability.md`、`errors-reports.md`、`quality-guidelines.md`

## Confirmed Scope

- 目标里程碑是 `Pure Core Kernel V1`。
- 当前实现范围只能是纯 TypeScript Core Kernel。
- 当前禁止提前实现 React、Tauri、VexFlow、SVG DOM、Web Audio、PDF/PNG 真实导出、Guitar Pro 导入、真实 `.bgp` 物理文件 IO、zip IO、文件系统 API、真实 Extension Host 或第三方插件运行时。
- Core Kernel V1 固定为 9 类机制: 文档模型、命令边界、事务历史、地址范围、硬验证、文件语义、快照事件、注册能力、错误报告。
- 音乐时间模型属于文档模型，不是第十类机制。
- `ScoreDocument` 是唯一谱面事实来源。
- 所有写入必须走语义命令；内部 delta/patch 只能是实现细节。
- 所有读取必须走只读 snapshot 或 selector。
- 事件只能是 commit 后事实，不是写入通道。
- 注册表与 capability、错误/diagnostic/report 都是 Core Kernel V1 的正式机制。

## Big Feature Plan

### K1-0: 内核边界与测试环境

作用: 建立纯 TypeScript 内核运行边界，防止后续实现把 UI、桌面壳、渲染、音频或文件 IO 依赖带进内核。

小功能:

- 纯 TypeScript build/typecheck/test 入口: 保证内核可在无浏览器、无桌面壳环境下验证。
- 禁止依赖清单测试: 继续验证 `react-ui`、`tauri-shell`、`vexflow-rendering`、`web-audio-playback`、`physical-bgp-io`、`plugin-runtime` 等不进入内核。
- 内核公共出口整理: 后续所有公开类型和 API 从 `src/core-kernel/index.ts` 统一导出。

### K1-1: 谱面核心对象模型、schema 与硬验证

作用: 建立内核唯一谱面事实 `ScoreDocument`，这是所有后续命令、快照、事件、迁移和文件语义的地基。

已批准的小功能:

- `ScoreDocument = schemaVersion + id + metadata + measureDefinitions + parts + extensions`。
- 最小通用 `Part / Staff / Voice / Event` 骨架；全局 measureDefinitions 是小节顺序与拍号唯一真相。
- `Fraction + NoteValue` 精确时间；事件位置派生，不持久化 tick/PPQ/offset。
- Note 只持久化 WrittenPitch，SoundingPitch 由 Part transposition 派生。
- 版本化 score/part ExtensionBlock；Core 语义保留未知 JsonValue，但不解释 Guitar Domain。
- 严格 `unknown -> decode -> semantic validation -> ScoreFeatureProfile` 三层边界。
- 第一产品 profile 限制单 Part/Staff/Voice、4/4、四/八/十六分、单音/rest；合法多谱表、多 Part、和弦、附点、time modification 返回 unsupported。
- fixture 与 test helpers 只存在于 `test/`，不得从生产 API 导出。
- 本阶段不实现命令、registry/capability、通用 report、迁移注册表、GuitarExtension 或物理 `.bgp` IO。

### K1-2: 语义命令、事务、历史、undo/redo 与回放

作用: 建立唯一写入入口，保证每次谱面修改可验证、可撤销、可重做、可回放，不让 UI 或未来插件绕过内核改文档。

小功能:

- `CommandEnvelope` / `CommandDefinition` / `CommandBus`: 定义语义命令接口。
- 命令注册和 payload 校验: 拒绝未知命令和非法 payload。
- capability 检查入口: 命令执行前必须检查权限。
- `CommandTarget`: 将写入目标限制为谱面语义地址、点、范围或明确 payload。
- 内部 delta: 可用于 commit、rollback、undo/redo 和回放，但不得暴露给公开 API。
- 事务提交: 成功后递增版本、更新 dirty state、产生事件。
- 事务回滚: 失败、unsupported 或验证失败时文档、历史和事件保持不变。
- 细粒度历史: 每个成功可撤销语义命令生成一个 `HistoryEntry`。
- `undo` / `redo`: 一次只移动一个历史条目，不做智能合并。
- 命令回放: 同一初始状态和命令序列必须得到同一文档状态。
- MVP 命令集合: 至少规划 `core.createScore`、`core.setDocumentMetadata`、`core.ensureMeasures`、`core.insertNote`、`core.insertRest`、`core.setNotePitch`、`core.setDuration`、`core.addTechnique`、`core.removeTechnique`、`core.deleteRange`、`core.undo`、`core.redo`。

### K1-3: 地址/范围、只读快照、selector 与事件协议

作用: 建立外部模块读取和响应变化的唯一协议，保证布局、播放、导出、持久化和未来插件只能围绕只读谱面快照工作。

小功能:

- `EntityId` / `ScoreAddress` / `ScorePoint` / `ScoreRange`: 定义谱面语义定位模型。
- `KernelReadApi`: 提供只读内核读取入口。
- `DocumentSnapshot`: 带 `documentId`、`schemaVersion`、`documentVersion`、`snapshotId` 和创建时间。
- 快照只读保护: 外部修改 snapshot 不得改变内核状态。
- built-in selectors: 覆盖 metadata、full score、serializable score、measure range、entity lookup、diagnostics、history state、dirty state、registry summary。
- `KernelEvent` envelope: 定义事件 ID、顺序、来源、版本和 payload 边界。
- `KernelEventBus`: 支持订阅和内部发布。
- post-commit events: 成功命令、undo/redo、文档加载、诊断、历史、脏状态、注册表、迁移后发布事实事件。
- 事件隔离: handler 异常不能回滚已提交事务。
- 禁止重入: 事件分发期间不能同步提交新命令。

### K1-4: 注册表、capability 与启动期内部模块注册

作用: 建立内核扩展点和权限边界，让内置模块和未来插件最终收敛到同一套注册协议，但 V1 不执行第三方插件代码。

小功能:

- `KernelRegistry`: 注册命令、selector、hard validator、technique definition、migration、抽象 import/export descriptor、template descriptor。
- contribution descriptor: 记录稳定 id、kind、source module、api version、required capabilities、status、titleKey。
- `KernelModuleIdentity`: 独立建模 `origin`、`runtime`、`trustLevel`、`apiVersion` 和 capabilities。
- capability 检查: 注册权限和执行权限分离。
- `KernelStartupModuleManifest`: V1 唯一启动期模块来源，只接受随应用发布的 `builtin/internal-module`。
- `CoreModuleRegistration`: 内置模块按统一协议注册贡献点和 handler。
- registry summary: 只读摘要，不泄露 handler、可变对象、React、VexFlow、Web Audio、Tauri 或 `ScoreDocument`。
- Registry 不再以 K1-1 的测试技巧为前置条件；具体吉他技巧由后续 Guitar Domain 解释，K1-4 必须在新模型上单独重审。
- unsupported 插件边界: 明确运行时 hotplug、第三方 manifest 读取、第三方 TypeScript 执行、Lua/native 执行都不进入 V1。

### K1-5: 错误、diagnostic、report 与迁移入口

作用: 统一内核失败表达、验证定位、导入导出报告壳和 schema 迁移入口，让测试、UI、本地化和未来模块都能稳定理解失败原因。

小功能:

- `KernelError`: 稳定 `code`、`severity`、`messageKey`、结构化 `details`。
- `KernelDiagnostic`: 可定位到 document、address、range、module、contribution、file 或 operation。
- validation diagnostics: 保留具体 code，例如 `rhythm-slot-gap`、`technique-definition-missing`、`pitch-octave-out-of-range`。
- report shell: 定义 `KernelReport`、`KernelReportIssue`、`ValidationReport`、`MigrationReport`、`ImportReport`、`ExportReport`、`RecoveryReport`。
- 隐私边界: report/error 默认不包含用户谱面正文、访问令牌、本机隐私绝对路径、第三方密钥或插件源码。
- 迁移入口: 定义 schema version、兼容矩阵、迁移器注册入口和 `MigrationReport`，不做物理 `.bgp` zip IO。
- module exception 转换: 模块异常转成 `module-error` diagnostic 或 report issue。

### K1-6: 内核集成验收与质量门禁

作用: 把 K1-1 到 K1-5 串成一个可回归的 Core Kernel V1，不把局部实现误认为完成。

小功能:

- 4 小节通用 score fixture 全链路验证；GuitarExtension fixture 仅在独立领域任务完成后接入。
- schema round-trip 验证。
- 命令提交、rollback、undo、redo、replay 验证。
- snapshot/selector 只读验证。
- event 顺序和异常隔离验证。
- registry/capability 负例验证。
- error/report 隐私边界验证。
- unsupported 边界验证: 当前 ScoreFeatureProfile 对合法多 Part/Staff/Voice、和弦、附点、time modification、弱起和非 4/4 明确报告；Guitar 弦数/技巧由领域 profile 负责；真实 PDF/PNG/Guitar Pro/physical `.bgp` IO 不得进入 Core。

## Requirements

### Functional Requirements

- K1-REQ-001: Core Kernel V1 must remain pure TypeScript and must not depend on UI, desktop shell, rendering, audio, physical file IO, network, or third-party plugin runtimes.
- K1-REQ-002: Core Kernel V1 must keep `ScoreDocument` as the only score truth using `measureDefinitions + parts + extensions`.
- K1-REQ-003: K1-1 must define the minimal general `Part / Staff / Voice / Event` skeleton while keeping guitar tuning, string/fret, and guitar techniques outside generic Note.
- K1-REQ-004: Musical time must persist canonical exact Fraction/NoteValue; tick, PPQ, milliseconds, and layout time are derived adapter data.
- K1-REQ-005: WrittenPitch is persisted; SoundingPitch is derived from explicit Part transposition without losing enharmonic spelling.
- K1-REQ-006: K1 must provide hard validation for supported and unsupported MVP boundaries.
- K1-REQ-007: All score writes must go through registered semantic commands, not public patch/JSON path/field replacement APIs.
- K1-REQ-008: Successful undoable semantic commands must create exactly one `HistoryEntry` by default; failed commands must not affect history.
- K1-REQ-009: Reads must use immutable snapshots or selectors; public APIs must not expose mutable `ScoreDocument`.
- K1-REQ-010: Kernel events must be post-commit facts and must not carry mutable documents or internal deltas.
- K1-REQ-011: Registry/capability remains later staged work and must be redesigned against completed K1-1 rather than imported into K1-1 early.
- K1-REQ-012: Error, diagnostic, report, and migration results must use stable codes, `messageKey`, structured details, and privacy-safe payloads.

### Planning Requirements

- K1-PLAN-001: Implementation must proceed one large kernel feature at a time.
- K1-PLAN-002: Before each large feature begins, its purpose, subfeatures, tests, touched files, and rollback point must be stated.
- K1-PLAN-003: After each round, every added or modified file must be explained with its purpose.
- K1-PLAN-004: The implementation must follow existing planning documents and stable specs; new design ideas require explicit planning review.
- K1-PLAN-005: The first implementation chunk should be reviewed and approved before `task.py start`.

## Out of Scope

- React/Tauri desktop shell.
- Editor UI and keyboard interaction implementation.
- VexFlow/SVG rendering and hit testing.
- Web Audio playback, metronome sound, playback cursor runtime.
- Real `.bgp` zip/file-system IO.
- PDF/PNG actual export.
- Guitar Pro import/export.
- Real Extension Host, third-party plugin install, plugin marketplace, runtime hotplug, Lua/native/compiled plugin execution.
- Guitar string/fret interpretation and Guitar Domain implementation; Core only preserves the generic extension envelope.
- Product editing support for multi-Part, multi-Staff, multi-Voice, chords, pickup, dotted rhythms and tuplets; K1-1 schema may express them but the first ScoreFeatureProfile reports unsupported.
- 7/8-string guitar rules, tempo maps, changing time signatures, lyrics, Roman numeral analysis, simplified notation, playability analysis, teaching suggestions, style checks, difficulty scoring.

## Acceptance Criteria

- [ ] AC-K1-001: `prd.md`、`design.md`、`implement.md` are complete and reviewed before implementation.
- [ ] AC-K1-002: The implementation plan is split into ordered large kernel features, each with explicit purpose, subfeatures, validation, and rollback point.
- [ ] AC-K1-003: The first implementation chunk is scoped to a single large kernel feature, recommended as `K1-1: 谱面核心对象模型、schema 与硬验证`.
- [ ] AC-K1-004: The plan names all forbidden dependencies and forbidden premature product features.
- [ ] AC-K1-005: The plan includes validation commands: `npm run typecheck` and `npm test`.
- [ ] AC-K1-006: The plan preserves the 9-mechanism Core Kernel V1 boundary and does not introduce a tenth mechanism.
- [ ] AC-K1-007: K1-1 tests cover the Core loop, strict decode, semantic invariants, exact time, unknown extension round-trip, and semantic-valid-but-profile-unsupported boundaries.
- [ ] AC-K1-008: The plan requires each future implementation round to report added/modified files and their purpose.

## Resolved Decision

- OD-K1-001 resolved on 2026-07-13: implement the replanned K1-1 Core foundation first through child task `07-13-k1-1-core-foundation`; stop for review before Guitar Domain or K1-2.
