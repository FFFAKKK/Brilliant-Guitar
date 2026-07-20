# K1-5 Errors Diagnostics Reports Migration

> **Status: IMPLEMENTATION CANDIDATE COMPLETE / INDEPENDENT ACCEPTANCE PENDING.** 实施候选基线为 `171790743450b3a3c0fa1720c847302308c27937`；2026-07-20 完整门禁通过 159/159 tests。该提交不是 accepted baseline，K1-6 继续阻塞。

## Goal

在已验收的 K1-1 至 K1-4 合同之上，为 Pure Core Kernel V1 规划统一、确定性、隐私安全的 operation error、diagnostic/report 外壳与纯内存 schema migration 入口，使 UI、测试和后续 import/export/persistence 模块可以消费稳定结构，而不把物理文件 IO、具体格式实现或可观测性平台混入 Core。

## Verified Baseline

- K1-1 的 decode/semantic/profile diagnostics 是冻结兼容面：稳定 closed code、`messageKey`、确定性顺序、结构化 `path` 和隐私安全 `details`。
- K1-2 的 `CommandFailure` 与 `CommandBusCreationFailure`、K1-3 的 read/checkpoint/event failure、K1-4 的 startup/access failure 均由各自阶段拥有；K1-5 可以提供显式映射，但不得重命名、改写或破坏这些结果合同。
- K1-4 已在 `94766a0930c05e5339c44f667deaf02116af1c0c` 通过独立验收并归档，125/125 tests 通过；K1-5 规划门已解锁。
- K1-4 的 `moduleId` 只用于 registry lookup、capability check、安全失败 details 与 summary source metadata。K1-5 若需要 operation/report 归因，必须使用独立记录，不得把 module attribution 写入 command envelope、history、undo/redo、replay 或 K1-3 events。
- 当前权威 K1-5 输入为活动 Core spec、已归档 K1-1 至 K1-4 任务与本独立任务；父计划和产品 REQ/SPEC 中的 K1-5 内容目前仅作为待复核草案，不能直接扩大实施范围。

## Approved Scope

以下方向已经完成仓库证据审查和用户逐项批准：

- 内部面向对象 operation error hierarchy，使用 closed code、派生 severity、`messageKey`、有限结构化 details，以及可选 location/source attribution；class 不作为公共传输合同。
- 保持 K1-1 `Diagnostic` 不变，以 `KernelIssue` 作为统一无损适配结果，不新增同义 `KernelDiagnostic`。
- 共享 `KernelReport` / `KernelIssue` 外壳、validation adapter 与实际 `MigrationReport`；不提前公开 import/export/recovery 专属报告类型。
- 保留具体 validation diagnostic code、path 和 details，不允许折叠成泛化的 `validation-failed` 字符串。
- 纯内存 schema compatibility/migration 入口：current version pass-through、future version safe failure、旧版本迁移链/注册形态与 `MigrationReport`；不做物理 `.bgp` zip IO。
- 外部 handler/模块异常的安全转换边界；不得泄漏原始 exception、stack、source、token、secret、本机私有绝对路径或用户谱面正文。

## Repository Findings

- `src/core-kernel/validation/validate-score-semantics.ts` 已公开 `ValidationReport { ok, diagnostics }`。K1-5 不能再定义一个同名但含义不同的通用 report；必须保留、重命名新外壳，或明确采用兼容扩展方案。
- K1-1 `Diagnostic` 已由 `code/messageKey/path/details` 构成，没有 `severity`、target 或 source。直接增加必填字段会破坏冻结合同；统一 issue 模型应通过无损适配，而不是修改原 diagnostic。
- K1-2、K1-3、K1-4 已分别公开多个 closed failure union，它们包含各子系统所需的精确字段。源码中尚不存在通用 `KernelError` 消费者，因此 K1-5 不应强迫既有 API 改签名。
- 当前 public boundary test 明确禁止 `KernelError`、`KernelReport` 与 `MigrationContribution` 外泄，这是 K1-4 的阶段性负向断言；K1-5 只能按最终批准的最小公共面有选择地解除。
- 当前只存在 `brilliant-score-1`；codec 对任何其他 schema version 都安全返回 `decode.unsupported-schema-version`。仓库没有旧 schema fixture、迁移器或真实 import/export/recovery 模块。
- K1-3 subscriber exception 已被隔离，但没有错误观察通道；K1-4 adapter 也只返回自身安全 failure。若 K1-5 要捕获这些异常，必须先证明新的消费入口、顺序和生命周期，不得静默改变已验收的 commit/event 行为。
- 已有未知 `ExtensionBlock` 在 codec、command、undo/redo、replay 和 snapshot 路径具有深层保留测试；migration 必须延续这一兼容要求。

## Frozen Boundaries

- 不修改 K1-1 `ScoreDocument`、codec、semantic/profile validation 的既有含义或 diagnostic code。
- 不修改 K1-2 command/history、K1-3 snapshot/selector/event、K1-4 registry/capability 的 failure ownership 或成功结果。
- 不实现真实 Guitar Pro/MusicXML/MIDI importer、PDF/PNG exporter、`.bgp` zip、文件路径、原子保存、自动保存、崩溃恢复或最近文件列表。
- 不实现 UI/i18n 字典、日志平台、遥测、远程错误上报、诊断包打包/上传、crash dump 或隐私设置 UI。
- 不实现第三方插件发现、安装、动态加载、sandbox、worker/process runtime 或任意动态 registry mutation。
- 不启动 K1-6，也不把 Guitar Domain、模板、technique、hard-validator 扩展或 Persistence Service 纳入本任务。
- Core 不读取 wall clock、不生成随机 ID；K1-5 report 公共合同不包含 report/operation ID 或创建时间。

## Requirements

- **K1-5-REQ-001 — Additive compatibility:** 所有既有 diagnostic/failure/result 签名、code、字段含义与成功路径保持不变；K1-5 只增加显式 adapters 和新入口。
- **K1-5-REQ-002 — Internal OO hierarchy:** 内部错误体系必须由一个封闭基础类和少量按 family 派生的具体类承载共享行为；不得为每个 code 创建子类，也不得从 public index 导出 class hierarchy。
- **K1-5-REQ-003 — Stable issue record:** `KernelIssue` 必须是版本化、closed、深度不可变的纯数据记录，包含原始稳定 code、自动 `messageKey`、自动 severity、可选 location/source 与白名单 details。
- **K1-5-REQ-004 — Lossless adapters:** K1-1 diagnostic、K1-2 CommandBus creation/replay 与 command/history、K1-3 read/checkpoint/event 和 K1-4 registry failure 必须由各自强类型 adapter 映射；adapter 不接受公开 patch 或任意自由形状 failure。
- **K1-5-REQ-005 — Nested diagnostics:** 带具体 diagnostics 的 failure 必须先输出外层 operation issue，再按原确定顺序输出所有具体 issues；不得丢失、排序、去重或泛化 code/path/details。
- **K1-5-REQ-006 — Location/source separation:** issue location 与 source 使用不同 closed union。location 仅允许 DiagnosticPath、ScoreAddress、ScoreRange；source 仅允许受控 Core subsystem 或已验证 module/contribution attribution，且永不参与授权。
- **K1-5-REQ-007 — Privacy by construction:** 新 details 只允许 adapter 白名单字段。unknown exception 内容、stack、cause、源码、token、secret、私有绝对路径、URL 和谱面正文不得进入 error/issue/report；转换不得触发未知 getter 或 Proxy `get` trap。
- **K1-5-REQ-008 — Deterministic reports:** `KernelReport` 只包含 `reportVersion: 1`、kind、自动 status、自动 summary 与 issues；不包含 ID、时间或随机字段。相同输入必须产生深度相等结果与相同 issue 顺序。
- **K1-5-REQ-009 — Evidence-backed report kinds:** 本阶段 report kind 仅为 validation 和 migration。现有轻量 `ValidationReport` 保持不变；K1-5 提供另名 validation report adapter 与真实 `MigrationReport`。
- **K1-5-REQ-010 — Derived status/summary:** report status 与全部计数必须由 issues 自动计算且不可由调用者覆盖；计数必须保持 safe integer，不得发生静默溢出。
- **K1-5-REQ-011 — Compatibility entry:** migration 入口接收不可信内存值；当前 `brilliant-score-1` 只有在 strict decode 和 semantic validation 均通过后才返回 `not-required` 与隔离候选。
- **K1-5-REQ-012 — Safe rejection:** 畸形、semantic-invalid、未来/未知 schema 或内部异常必须返回稳定 `MigrationFailure` 与 rejected `MigrationReport`；不得抛出原始异常或返回 candidate。
- **K1-5-REQ-013 — No fictional migration:** 生产 migration step 目录静态、私有、封闭且当前为空；公共结果本阶段只有 `not-required | rejected`，不包含不可产生的 `migrated` 分支。
- **K1-5-REQ-014 — Candidate isolation:** 成功候选必须与输入及内部状态脱离、深度冻结，并深度保留未知 ExtensionBlock；migration 不接触活动 CommandBus、history、dirty state 或 events。
- **K1-5-REQ-015 — Explicit exception capture:** 只有显式 K1-5 wrapper 可以把 unknown exception 转为安全 family error/issue；本阶段不新增全局 issue observer，不改变 K1-3 subscriber isolation。
- **K1-5-REQ-016 — Public boundary:** public index 只导出批准的纯数据类型、强类型 adapters、report builder/validation adapter 与 migration entry；不得导出 error classes、mutable builders/registries、internal step table、sanitizer、physical IO 或未来 report aliases。

## Planning Questions

- [x] K1-5 保持一个 Trellis 任务，在 `implement.md` 内拆为 error/issue、reports、migration、integration/docs 四个可独立回滚阶段；不创建子任务。
- [x] K1-1 `Diagnostic` 保持原样；K1-5 不创建重叠的 `KernelDiagnostic`，而是新增 `KernelIssue` 作为 error/report 的统一纯数据适配结果。
- [x] K1-5 采用 additive、opt-in 的无损适配层；既有子系统 failure union 与 API 签名保持原样，只有明确的 K1-5 消费入口执行统一映射。
- [x] 使用基础错误类与少量错误族派生类封装行为；class 实例不作为跨 API/JSON/clone 的兼容面，对外返回深度冻结的纯数据快照，并以稳定 code 而非 `instanceof` 判断兼容性。
- [x] K1-5 定义最小 `KernelReport`/`KernelIssue`/summary 公共外壳、validation adapter 和实际 `MigrationReport`；import/export/recovery 只保留未来复用约束，不提前公开无消费者的专属类型或 details。
- [x] Core report 不携带 report ID、operation ID 或创建时间；只包含确定性内容，关联 ID 与 wall-clock metadata 由 Core 外层拥有。
- [x] migration 接收不可信输入，只返回隔离、深度冻结且验证通过的候选；不写活动 `CommandBus`，失败不返回半成品，未知 ExtensionBlock 深度保留，当前步骤目录静态封闭且为空。
- [x] 当前公共 `MigrationResult` 只包含真实可产生的 `not-required | rejected`；不预留死 `migrated` 分支。
- [x] K1-5 只在显式 operation/migration/module wrapper 内转换异常；不新增全局 issue/event bus，不改变 K1-3 subscriber isolation，也不尝试恢复 K1-4 已隐藏的异常内容。
- [x] public adapter 保持强类型签名，但运行时总边界验证畸形值；分别返回 `report.invalid-input` 或 `report.internal-error` issue/report，不抛异常。

## Acceptance Criteria

- [x] **AC-K1-5-001:** 最终 PRD、`design.md` 和 `implement.md` 已于 2026-07-20 经用户审核批准；任务可交给操作者执行启动 gate。
- [x] **AC-K1-5-002:** 内部 OO hierarchy 具有基础类和少量 family 派生类，但 public API/runtime export 不含这些 class，所有公开结果均为深度冻结纯数据。
- [x] **AC-K1-5-003:** Diagnostic、CommandFailure、CommandBusCreationFailure、CheckpointFailure、ReadFailure、EventSubscription failure、Registry startup/access failure 分别具有 compile-time closed adapter 覆盖；新增 union member 会触发穷尽性编译失败或测试失败。
- [x] **AC-K1-5-004:** 每个 adapter 保留原 code 和全部批准的安全字段；semantic-invalid 同时保留外层 issue 与全部原始 semantic diagnostics，顺序深度相等。
- [x] **AC-K1-5-005:** messageKey 与 severity 只能由 code 推导；调用者不能构造 code/messageKey/severity 矛盾组合。
- [x] **AC-K1-5-006:** diagnostic-path、ScoreAddress、ScoreRange、Core subsystem 与 module/contribution source 均覆盖 good/base/bad case；source 不执行授权，file path/URL/free-form source 被排除。
- [x] **AC-K1-5-007:** known failure details 使用白名单复制；恶意 extra fields、getter、Proxy、raw Error、stack、cause、token、secret、路径和谱面正文均无法进入输出或触发未捕获异常。
- [x] **AC-K1-5-008:** validation report adapter 对空 diagnostics、unsupported warnings、semantic/decode errors 产生正确 kind/status/summary/issues，且不改变现有 `ValidationReport`。
- [x] **AC-K1-5-009:** report status/summary 不能由调用者伪造；issues 的外部后续修改不影响 report，report 嵌套对象和数组均被冻结。
- [x] **AC-K1-5-010:** 当前 schema 的有效输入返回 `not-required`、completed empty report 与隔离冻结候选；修改输入或输出均不能影响另一方。
- [x] **AC-K1-5-011:** future/unknown schema、malformed shape、semantic-invalid 与意外内部异常分别返回稳定 rejected result/report，不返回 candidate、不抛原始异常。
- [x] **AC-K1-5-012:** unknown ExtensionBlock 在 current-version pass-through 中深度相等保留；migration 不修改活动 CommandBus、documentVersion、history、dirty state 或 event sequence。
- [x] **AC-K1-5-013:** 重复运行相同 adapter/report/migration 输入得到深度相等结果和相同顺序，不读取 wall clock/randomness，不包含 ID/time。
- [x] **AC-K1-5-014:** public boundary 只增加批准的 issue/report/adapters/migration 数据 API；无 KernelError class、KernelDiagnostic、ImportReport、ExportReport、RecoveryReport、MigrationContribution、mutable registry/builder、physical IO 或全局 issue event。
- [x] **AC-K1-5-015:** 更新活动 Core spec、父任务和产品 REQ/SPEC 的 K1-5 状态与最终合同；历史快照和退休文档保持不改。
- [x] **AC-K1-5-016:** `npm run typecheck`、`npm run build`、`npm test`、forbidden dependency/public export checks 与 `git diff --check` 全部通过；实施完成后仍需独立人工验收才能解锁 K1-6。

## Approved Decisions

- **DEC-K1-5-001 — Additive failure mapping:** K1-5 不替换 K1-2/K1-3/K1-4 已验收的 failure/result 合同。统一错误与 report issue 通过显式 adapter 无损生成；原 code 和原有安全字段必须保留。
- **DEC-K1-5-002 — Object-oriented behavior, data-oriented boundary:** Core 内部使用抽象基础错误类与少量按语义职责划分的派生错误族（候选为 operation、migration、module、internal）复用行为；不为每个 code 创建子类。公开 result/report/serialization boundary 只返回深度冻结的纯数据记录，消费者使用 closed code 而非 `instanceof`。任何 `toIssue()`/snapshot 路径都不得携带 raw `message`、`stack`、`cause` 或原始异常。
- **DEC-K1-5-003 — Preserve Diagnostic, adapt to KernelIssue:** K1-1 `Diagnostic` 及现有轻量 `ValidationReport { ok, diagnostics }` 保持冻结。K1-5 不新增同义 `KernelDiagnostic`，而是定义 closed、深度不可变的 `KernelIssue` 数据合同；显式 adapter 无损保留 diagnostic 的 `code`、`messageKey`、`path` 与 `details`，并只在 K1-5 层增加已批准的 severity/source/location。通用报告不得与现有 `ValidationReport` 重名或改变其返回形状。
- **DEC-K1-5-004 — Evidence-backed report surface:** K1-5 公开最小、版本化、深度不可变的 `KernelReport`、`KernelIssue` 与 summary 合同，提供现有 validation diagnostics 的通用 report adapter，并实现由本阶段 migration 入口实际产生的 `MigrationReport`。`ImportReport`、`ExportReport`、`RecoveryReport` 及其专属 details 延后到对应真实模块；后续类型必须复用本阶段的 report/issue 基础，而不能建立第二套报告体系。
- **DEC-K1-5-005 — Deterministic report identity:** `KernelReport` 不包含 `reportId`、`operationId`、`createdAt` 或其他时钟/随机来源字段。Core 只输出 `reportVersion`、kind、status、summary、issues 及经批准的确定性 details；应用层 correlation 与时间元数据必须在 Core 结果外包装，不得回写 report。
- **DEC-K1-5-006 — No fictional schema history:** K1-5 不创建 `brilliant-score-0` 或其他虚构 legacy fixture，也不增加动态 migration registry。迁移入口对当前 `brilliant-score-1` 执行 strict decode 与 semantic validation 后返回确定性的 `not-required`；未来/未知 schema 安全返回 `unsupported-source-version`；畸形输入保留具体 decode/semantic issues。静态迁移步骤目录在本阶段保持封闭且为空，真实新 schema 出现时再通过独立兼容规划增加真实 step。
- **DEC-K1-5-007 — Detached migration candidate:** migration 是纯、原子的 compatibility boundary。成功或 `not-required` 只返回与输入及内部状态脱离、深度冻结、已通过 decode/semantic validation 的 `ScoreDocument` 候选与 report；失败不返回 candidate 或任何半迁移状态。migration 不持有、修改或整体替换活动 `CommandBus`，不产生 history/dirty/event；外层可用成功候选创建新的 session。未知 ExtensionBlock 必须在所有成功路径深度原样保留。
- **DEC-K1-5-008 — Explicit exception boundaries only:** K1-5 的基础错误模块提供从 `unknown` 安全归一化为 family error/`KernelIssue` 的显式工厂或 wrapper，但只用于明确进入该边界的 operation、migration 或未来 module 调用。原始异常不得被保存、返回或重新抛出。K1-3 subscriber 异常继续按原合同隔离且本阶段不产生全局 issue；K1-4 的安全 failure 只能无损映射，不能恢复已抑制内容。K1-5 不增加全局错误 observer/event bus。
- **DEC-K1-5-009 — Separate issue location from source:** `KernelIssueLocation` 是可选 closed union，只允许现有 `DiagnosticPath`、`ScoreAddress` 或 `ScoreRange`；adapter 不在缺少文档上下文时猜测语义地址。`KernelIssueSource` 是独立 closed union，只允许受控 Core subsystem 或经严格验证的 module/contribution attribution，并且不参与授权。Core issue 不接受 file path、URL 或自由文本 location/source；所有嵌套数据均严格解码、隔离复制并深度冻结。
- **DEC-K1-5-010 — Closed code and derived severity:** `KernelIssueCode` 无损包含已批准的 K1-1 diagnostics、K1-2/K1-3/K1-4 failure code 与 K1-5 自有 closed code；其中 K1-2 同时包含 `CommandFailure` 与 `CommandBusCreationFailure`。`messageKey` 恒为 `core.${code}`。severity 不能由调用者提供：`unsupported.*` 为 `warning`，internal/invariant/显式未知模块异常为 `fatal`，其余失败为 `error`；本阶段不加入无真实语义的 `info`。`fatal` 仅表示当前 operation 无法安全继续。`command.semantic-invalid` 与携带 diagnostics 的 `command.invalid-initial-document` 都映射为外层 operation issue，随后按原确定顺序追加全部具体 semantic issues。
- **DEC-K1-5-011 — Derived report status and summary:** `KernelReport` 当前只允许 `kind: "validation" | "migration"`，status 只允许 `completed | completed-with-warnings | rejected`。status 与 `issueCount/warningCount/errorCount/fatalCount` 必须由冻结 issues 自动计算，调用者不得填写或覆盖；无 issue 为 completed，仅 warning 为 completed-with-warnings，出现 error/fatal 为 rejected。当前版本 pass-through 的 `MigrationResult.status: "not-required"` 对应 completed report；partial 语义延后到真实 importer。
- **DEC-K1-5-012 — Single task with staged delivery:** K1-5 不创建子任务；同一任务的 `implement.md` 明确拆为 (1) error class/issue/adapters、(2) report/validation adapter、(3) migration compatibility boundary、(4) integration/public exports/spec sync 四个顺序阶段。每阶段必须有独立 RED/GREEN、局部回归、回滚点与建议提交边界，最终统一通过 K1-5 Gate。
- **DEC-K1-5-013 — Internal sealed class hierarchy:** 抽象 `KernelError` 基类及其 family 派生类属于 Core 内部实现，不作为公共继承/`instanceof` 合同导出。公共 API 只暴露 closed data types 与必要的安全 adapters/factories。外部代码不能覆盖 `toIssue()` 或注入自定义 subclass；未来第三方 Module SDK 若需要可扩展错误协议，必须独立规划。
- **DEC-K1-5-014 — Allowlist privacy construction:** 所有 K1-5 新 error/issue/report details 都由已知 code 的 adapter 按字段白名单构造，不使用 spread、通用对象复制、字符串扫描或事后 redaction。K1-1 diagnostic 的既有安全 details 只做隔离克隆；未知 exception 的 `message/stack/cause` 与自定义属性全部丢弃，仅保留调用边界提供且已验证的 source/location。转换不得触发未知 getter 或 Proxy `get` trap，输出必须是有限、深度冻结的 JsonObject。
- **DEC-K1-5-015 — Only producible migration results:** 当前公共 `MigrationResult` 只允许 `not-required` 与 `rejected`。不公开本阶段永远无法产生的 `migrated` 分支；未来真实 schema 升级必须通过独立兼容任务同时增加真实 step、fixture、结果分支与 exhaustive-consumer 更新。
- **DEC-K1-5-016 — Total public adapters:** public adapters 保持现有 union 的强类型 TypeScript 签名，但实现把 runtime value 视为不可信输入并采用 descriptor-first、zero-getter 解码。畸形值返回 `report.invalid-input` error issue；解码/映射内部意外异常返回 `report.internal-error` fatal issue。validation adapter 将其包装为 rejected report。两个 code、固定 `core.report.*` messageKey 与 Core `report` source 纳入 closed contract，输出不携带原始输入或异常内容。

## Notes

- 2026-07-20：用户批准三份 K1-5 规划文档后，操作者已在 `codex/k1-5-errors-diagnostics-reports-migration` 启动实施；当前 Trellis task 为 `in_progress / acceptance_pending`。
- “实施前创建独立 K1-5 分支”是规划阶段的历史启动条件，现已满足。当前修复仍以已验收 K1-4 为祖先；K1-5 在独立复验前不得标记 accepted，K1-6 继续阻塞。
- 所有非 K1-5 的用户自有未跟踪目录（包括 `.trellis/maintenance/`、DVA/Codex theme 任务与 `codex theme/`）均不属于本任务，不得修改、清理、移动或纳入提交。
