# ARCHIVED SPEC-016 旧内核错误、Diagnostic 与 Report 契约

> **已归档，不是 K1-5 实现契约。** K1-1 已建立新的封闭诊断兼容面。

## 状态

- 状态: 已收敛；实现细节以本 spec 的强制规则、测试要求和 `implement.md` 为准。
- 映射需求: `REQ-006`, `REQ-009`, `REQ-010`, `REQ-015`, `REQ-019`。
- 目标: 定义 Core Kernel 的结构化错误、diagnostic、report issue 和操作报告外壳。
- 非目标: 注册表、capability、模块身份和 contribution descriptor 由 `SPEC-015-kernel-registry-capability.md` 定义。

## 问题定义

命令、验证、文件、迁移、导入、导出、注册表和未来插件都会失败。如果失败只靠字符串、异常或 UI toast 表达，后续测试、国际化、日志、问题定位和导入导出报告都会失控。

本 spec 只解决:

- 失败如何结构化表达。
- diagnostic 如何定位到文档、地址、范围、模块、贡献点或文件。
- report 如何统一导入、导出、迁移、验证和恢复结果。
- 错误对象如何避免隐私泄露。

本 spec 不解决:

- 模块如何注册贡献点。
- 调用方是否有 capability。
- 第三方插件沙箱。
- 诊断包压缩、上传和远程错误收集。

## 设计结论

第一阶段采用 “Structured Error + Diagnostic + Shared Report Shell”。

- Error: 同步失败和 API 失败使用稳定 `KernelError`。
- Diagnostic: 可展示、可测试、可定位的问题使用 `KernelDiagnostic`。
- Report: 导入、导出、迁移、验证和恢复使用 `KernelReport<TDetails>`。
- I18n: 用户可见文本只通过 `messageKey` 解析。
- Privacy: 默认不包含用户谱面正文、访问令牌、本机隐私路径或第三方密钥。

## 适用范围

本 spec 约束:

- `KernelError`。
- `KernelDiagnostic`。
- `KernelIssueTarget`。
- `KernelIssueSource`。
- `KernelReport`。
- `KernelReportIssue`。
- `ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和恢复报告。

本 spec 不约束:

- `KernelRegistry` 的注册算法。
- capability 授权算法。
- 插件 manifest 解析。
- 诊断包收集、压缩和上传。
- 操作系统崩溃转储。

## 第一性原则

- STRUCTURED-FAILURE: 所有失败都必须结构化，不能只抛字符串。
- STABLE-CODE: 错误 code 是测试和兼容契约，不能随 UI 文案变化。
- I18N-MESSAGES: 用户可见文本来自 `messageKey`，不硬编码中英文。
- TARGETED-DIAGNOSTIC: 能定位的问题必须带 target。
- PRIVACY-BY-DEFAULT: 默认不收集用户谱面正文、令牌、密钥和本机隐私路径。
- MODULE-ISOLATION: 模块异常必须被捕获并转换为结构化问题，不得让 Core Kernel 崩溃。

## 强制规则

- KER-001: 所有 `KernelError` 必须包含稳定 `code`、`severity` 和 `messageKey`。
- KER-002: 用户可见文本不得写入 `messageKey` 以外的字段；UI 通过 i18n 字典渲染。
- KER-003: `details` 只能保存机器可读上下文，不得默认包含用户谱面正文、访问令牌、本机绝对隐私路径或第三方密钥。
- KER-004: `KernelDiagnostic` 必须可以定位到 `ScoreAddress`、`ScoreRange`、文档级、模块级、贡献点级或文件级目标。
- KER-005: `KernelReport` 必须包含 report id、kind、status、source module、createdAt、issue summary 和 issues。
- KER-006: `ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和 `RecoveryReport` 必须复用 `KernelReportIssue`。
- KER-007: 模块异常必须被捕获并转换为 `module-error` diagnostic 或 report issue。
- KER-008: fatal severity 只表示当前操作无法安全继续，不等同于应用必须退出。
- KER-009: report issue 不得要求 UI 必须显示全部 details；UI 可以只显示 messageKey 和摘要。
- KER-010: source 字段只用于诊断归因，不得用于 capability 授权。
- KER-011: `KernelErrorCode` 只表达操作级失败；谱面 hard validation 的细粒度原因必须使用 `ValidationDiagnosticCode`，不得为了每个验证规则扩张 `KernelErrorCode`。
- KER-012: 如果命令因 hard validation 失败而 rollback，外层 `KernelError.code` 应使用 `command-validation-failed`，同时在 `KernelDiagnostic.code` 中保留具体 `ValidationDiagnosticCode`。

## 数据结构草案

本节是后续实现的编码输入。每个结构都必须保留注释，说明用途和边界。

```ts
/**
 * 内核问题严重级别。
 *
 * 用途:
 * - 统一错误、diagnostic 和 report issue 的严重性。
 * - 供 UI、测试和导出报告排序。
 */
export type KernelSeverity = "info" | "warning" | "error" | "fatal"

/**
 * 内核错误 code。
 *
 * 用途:
 * - 作为测试、i18n、report 和兼容判断的稳定机器可读标识。
 * - 新增 code 必须进入文档和测试。
 */
export type KernelErrorCode =
  | "registry-duplicate-id"
  | "registry-kind-unsupported"
  | "api-version-incompatible"
  | "runtime-unsupported"
  | "capability-denied"
  | "contribution-disabled"
  | "command-unknown"
  | "command-payload-invalid"
  | "command-validation-failed"
  | "schema-invalid"
  | "address-invalid"
  | "range-invalid"
  | "duration-invalid"
  | "tuning-invalid"
  | "mvp-limitation-unsupported"
  | "migration-failed"
  | "import-failed"
  | "export-failed"
  | "module-error"
  | "unsupported"
  | "internal-error"

/**
 * 谱面验证 diagnostic code。
 *
 * 用途:
 * - 表达 hard validation 的细粒度原因。
 * - 例如 `rhythm-slot-gap`、`technique-definition-missing`、`pitch-octave-out-of-range`。
 *
 * 边界:
 * - 具体 code 由对应验证 spec 定义，例如 `SPEC-001-document-model.md`。
 * - 不得把所有验证细码加入 `KernelErrorCode`；操作级错误和验证原因必须分层。
 */
export type ValidationDiagnosticCode = string

/**
 * issue code。
 *
 * 用途:
 * - 让 diagnostic 和 report issue 可以同时表达操作级错误和验证细节。
 */
export type KernelIssueCode = KernelErrorCode | ValidationDiagnosticCode

/**
 * 内核错误。
 *
 * 用途:
 * - 统一命令、注册、权限、schema、迁移、导入导出和内部模块错误。
 * - 用户可见文本由 i18n 层根据 `messageKey` 渲染。
 */
export interface KernelError {
  code: KernelErrorCode
  severity: KernelSeverity
  messageKey: string
  target?: KernelIssueTarget
  source?: KernelIssueSource
  details?: Record<string, unknown>
}

/**
 * issue 目标。
 *
 * 用途:
 * - 让 UI、测试、report 和日志定位问题。
 */
export type KernelIssueTarget =
  | { kind: "document" }
  | { kind: "score-address"; address: ScoreAddress }
  | { kind: "score-range"; range: ScoreRange }
  | { kind: "module"; moduleId: ModuleId }
  | { kind: "contribution"; contributionId: ContributionId }
  | { kind: "file"; pathKind: "user-selected" | "autosave" | "package-entry"; pathHint?: string }

/**
 * issue 来源。
 *
 * 用途:
 * - 表示问题由谁产生。
 * - 不用于授权，只用于诊断和报告。
 */
export interface KernelIssueSource {
  moduleId: ModuleId
  contributionId?: ContributionId
}

/**
 * 内核 diagnostic。
 *
 * 用途:
 * - 表示当前文档或模块状态中可展示、可测试的问题。
 * - 例如硬验证失败、模块事件处理器失败、unsupported 能力提示。
 */
export interface KernelDiagnostic {
  id: string
  code: KernelIssueCode
  severity: KernelSeverity
  messageKey: string
  target?: KernelIssueTarget
  source?: KernelIssueSource
  details?: Record<string, unknown>
}

/**
 * report 类型。
 *
 * 用途:
 * - 统一导入、导出、迁移、验证和恢复报告。
 */
export type KernelReportKind =
  | "import"
  | "export"
  | "migration"
  | "validation"
  | "recovery"
  | "module-error"

/**
 * report 状态。
 *
 * 用途:
 * - 表达一次操作的总体结果。
 */
export type KernelReportStatus =
  | "success"
  | "success-with-warnings"
  | "failed"
  | "partial"
  | "unsupported"

/**
 * report issue。
 *
 * 用途:
 * - 让不同 report 使用同一套问题字段。
 */
export interface KernelReportIssue {
  code: KernelIssueCode
  severity: KernelSeverity
  messageKey: string
  target?: KernelIssueTarget
  source?: KernelIssueSource
  details?: Record<string, unknown>
}

/**
 * report 摘要。
 *
 * 用途:
 * - 快速显示报告结果，不读取完整 issue 列表。
 */
export interface KernelReportSummary {
  infoCount: number
  warningCount: number
  errorCount: number
  fatalCount: number
  unsupportedCount: number
}

/**
 * 内核 report 外壳。
 *
 * 用途:
 * - 统一 ImportReport、ExportReport、MigrationReport、ValidationReport 和恢复报告。
 * - 可被 UI 展示、测试断言和本地诊断包引用。
 *
 * 隐私:
 * - 默认不得包含用户谱面正文。
 */
export interface KernelReport<TDetails = unknown> {
  id: string
  kind: KernelReportKind
  status: KernelReportStatus
  sourceModuleId: ModuleId
  createdAt: IsoTimestamp
  documentId?: EntityId
  schemaVersion?: string
  summary: KernelReportSummary
  issues: KernelReportIssue[]
  details?: TDetails
}

export type ImportReport = KernelReport<ImportReportDetails>
export type ExportReport = KernelReport<ExportReportDetails>
export type MigrationReport = KernelReport<MigrationReportDetails>
export type ValidationReport = KernelReport<ValidationReportDetails>
export type RecoveryReport = KernelReport<RecoveryReportDetails>

/**
 * 导入报告细节。
 *
 * 用途:
 * - 描述导入格式、导入数量和跳过数量。
 */
export interface ImportReportDetails {
  sourceFormat: string
  importedEntityCount: number
  skippedEntityCount: number
}

/**
 * 导出报告细节。
 *
 * 用途:
 * - 描述导出目标格式和页面信息。
 */
export interface ExportReportDetails {
  targetFormat: "pdf" | "png" | "svg" | "musicxml" | "midi" | "other"
  pageCount?: number
}

/**
 * 迁移报告细节。
 *
 * 用途:
 * - 描述 schema version 变化和执行的迁移步骤。
 */
export interface MigrationReportDetails {
  fromSchemaVersion: string
  toSchemaVersion: string
  appliedMigrationIds: string[]
}

/**
 * 验证报告细节。
 *
 * 用途:
 * - 描述验证对应的文档版本。
 */
export interface ValidationReportDetails {
  documentVersion: DocumentVersion
}

/**
 * 恢复报告细节。
 *
 * 用途:
 * - 描述自动保存或崩溃恢复结果。
 */
export interface RecoveryReportDetails {
  recoverySource: "autosave" | "backup" | "package-repair"
  recoveredEntityCount: number
}
```

## 错误和边界行为

- Command payload invalid: 返回 `command-payload-invalid`，不得进入事务 commit。
- Command validation failed: 返回 `command-validation-failed`，事务 rollback，不产生 undo 条目；同时返回定位到具体谱面目标的 `ValidationDiagnosticCode`。
- Schema invalid: 返回 `schema-invalid`，打开或保存入口必须中止。
- Migration failed: 返回 `migration-failed`，并输出 `MigrationReport`。
- Import failed: 返回 `import-failed`，并输出 `ImportReport`。
- Export failed: 返回 `export-failed`，并输出 `ExportReport`。
- Module exception: 捕获异常，转换为 `module-error` diagnostic 或 report issue。
- Privacy issue: report details 默认不得包含谱面正文、访问令牌或本机隐私路径。

## 与其它 spec 的关系

- `SPEC-003-command-system.md`: 命令失败、payload 无效和验证失败使用 `KernelError`。
- `SPEC-005-guitar-techniques.md`: 技巧结构非法或 unsupported 使用 diagnostic 定位到 technique annotation。
- `SPEC-009-extension-api.md`: 插件或内部模块异常转换为 `module-error`。
- `SPEC-011-internationalization.md`: 错误、diagnostic 和 report issue 必须使用 i18n key。
- `SPEC-014-kernel-snapshot-events.md`: 诊断变化必须发布 `kernel.diagnostics.changed`。
- `SPEC-015-kernel-registry-capability.md`: 注册和 capability 失败返回的 `KernelError` 使用本 spec 的结构。

## MVP 必须做

- 定义 `KernelError`。
- 定义 `KernelDiagnostic`。
- 定义 `KernelIssueTarget` 和 `KernelIssueSource`。
- 定义 `KernelReport`、`KernelReportIssue`、`KernelReportSummary`、`ImportReport`、`ExportReport`、`MigrationReport`、`ValidationReport` 和 `RecoveryReport` 外壳。
- 为 command、schema、migration、import、export、registry、capability 和 module exception 建立稳定错误 code。
- 确保 report 默认不包含用户谱面正文、访问令牌或本机隐私路径。

## MVP 不做

- 不做诊断包上传。
- 不做远程错误上报。
- 不做崩溃转储采集。
- 不做完整日志产品。
- 不做诊断 UI 面板产品化。
- 不做自动隐私脱敏策略编辑器。

## 测试要求

- [ ] AC-016-01: `KernelError`、`KernelDiagnostic` 和 `KernelReportIssue` 都包含稳定 code、severity 和 messageKey。
- [ ] AC-016-02: 用户可见错误文本只使用 i18n key，不硬编码中文或英文。
- [ ] AC-016-03: hard validation 失败能生成定位到 `ScoreAddress` 或 `ScoreRange` 的 diagnostic。
- [ ] AC-016-04: `ImportReport`、`ExportReport`、`MigrationReport` 和 `ValidationReport` 复用同一套 `KernelReportIssue`。
- [ ] AC-016-05: 模块 handler 抛出异常时，被转换为 `module-error` diagnostic 或 report issue。
- [ ] AC-016-06: report 默认不包含用户谱面正文、访问令牌或本机隐私路径。
- [ ] AC-016-07: fatal severity 不会被解释为应用必须退出，只表示当前操作无法安全继续。
