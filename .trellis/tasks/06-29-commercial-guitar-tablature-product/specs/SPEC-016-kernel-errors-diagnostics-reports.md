# SPEC-016 内核错误、Issue、Report 与迁移兼容边界

> **状态：K1-5 IMPLEMENTATION CANDIDATE / INDEPENDENT ACCEPTANCE PENDING。**
> 实施候选基线 `51fa2177cbd25dea53f1ebaf23bd8b8426471589` 已通过 161/161 测试；K1-1～K1-4 的 diagnostics/failure union 保持不变，K1-6 在 K1-5 形成独立验收基线前继续阻塞。

## 1. Scope / Trigger

K1-5 提供显式、可选的失败适配层、不可变 `KernelIssue`/`KernelReport`
数据合同、validation report adapter，以及当前 `brilliant-score-1` 的纯内存迁移兼容入口。

不包含 `KernelDiagnostic` 新类型、公开错误类、全局 issue bus、动态迁移注册、
`ImportReport`/`ExportReport`/`RecoveryReport`、物理 `.bgp` IO 或真实旧 schema。

## 2. Authoritative Contracts

详细签名、K1-1 code 表、场景与失败矩阵以
`.trellis/spec/core-kernel/backend/errors-reports.md` 为唯一活动合同。
K1-2/K1-3/K1-4 的原始 failure union 分别由 `command-transaction.md`、
`snapshot-events.md` 和 `registry-capability.md` 拥有，K1-5 不复制或改写它们。

公共运行时入口：

- `mapDiagnosticToKernelIssue`
- `mapCommandFailureToKernelIssues`
- `mapCommandBusCreationFailureToKernelIssues`
- `mapCheckpointFailureToKernelIssues`
- `mapReadFailureToKernelIssues`
- `mapEventSubscriptionFailureToKernelIssues`
- `mapRegistryStartupFailureToKernelIssues`
- `mapRegistryAccessFailureToKernelIssues`
- `createModuleInternalIssue`
- `createKernelValidationReport`
- `migrateScoreDocument`

## 3. Contracts

- 内部使用封闭错误族复用行为；公共边界只返回深冻结纯数据，不能依赖 `instanceof`。
- `KernelIssueCode` 是闭集；`messageKey` 恒为 `core.${code}`，severity 由 code 推导。
- K1-2 的闭集同时包含 `CommandFailure["code"]` 与 `CommandBusCreationFailure["code"]`；后者严格支持 `{ code }` 和 `{ code, diagnostics }` 两种真实形状。
- 所有 diagnostic/failure code 表必须使用 `Record<UnionCode, true>` 或等价 `never` 证明形成编译期穷尽门禁；仅使用 `satisfies readonly Failure[]` 不构成穷尽证明。
- adapter 严格按字段白名单构造结果；畸形输入返回 `report.invalid-input`，内部意外返回 `report.internal-error`。
- `KernelReport` 只允许 `validation | migration`，status/summary 只能从 issues 推导。
- report 不包含 reportId、operationId、createdAt、时间戳或随机标识。
- 当前迁移结果只有 `not-required | rejected`；私有步骤表为空，无 `migrated` 死分支。
- migration 成功候选与输入隔离、深冻结、通过 decode/semantic validation；失败不返回半成品。
- migration 不接受或修改 CommandBus，不改变 history、dirty 或 event sequence。

## 4. Validation & Failure Matrix

| Scenario | Stable result |
|---|---|
| K1-1 diagnostic | 保留 code/path/details 与顺序 |
| K1-2 `CommandFailure`、K1-3/K1-4 failure | 保留原 code，只复制每个 code 获批字段 |
| K1-2 `CommandBusCreationFailure` code-only | 单个 `command.invalid-initial-document` issue |
| K1-2 `CommandBusCreationFailure` with diagnostics | 外层 `command.invalid-initial-document`，随后保持全部 semantic diagnostics 原顺序 |
| malformed adapter input | 单个 `report.invalid-input` |
| unexpected adapter failure | 单个 fatal `report.internal-error` |
| empty validation issues | `completed` |
| unsupported-only validation | `completed-with-warnings` |
| error/fatal validation | `rejected` |
| valid current schema | `not-required` + 空 migration report |
| future schema | `migration.unsupported-source-version` + decoder issues |
| malformed/semantic-invalid schema | 外层 migration issue + 全部具体 issues |
| internal migration fault | 单个 fatal `migration.internal-error` |

## 5. Good / Base / Bad Cases

- Good：同一输入重复映射、报告或迁移得到深度相等结果。
- Base：`command.semantic-invalid` 先输出 operation issue，再按原顺序输出全部 semantic issues。
- Base：实际 `CommandBus.create()` 与 replay 的 invalid-initial-document 结果先输出创建 issue，再按原顺序输出全部 semantic issues。
- Base：未知 `ExtensionBlock` 在 current-schema pass-through 中深度保留。
- Bad：getter、Proxy、extra field、cycle 或 sparse array 不能逃逸异常或执行 `get` trap。
- Bad：公共根不得导出错误类、builder、strict codec、迁移步骤表或测试依赖注入缝。

## 6. Tests Required

穷尽映射全部已验收 code，并用编译期穷尽 code 表保证新增 union member 时 typecheck 失败；
覆盖实际 `CommandBus.create()` 与 replay 创建失败；验证字段白名单、顺序、深冻结、mutation isolation、
report 派生计数、全部 migration 路径、unknown ExtensionBlock 与 CommandBus 隔离。
公共出口、禁止依赖、typecheck、build、完整测试、Trellis validate 和 diff check
必须全部通过。

## 7. Candidate Gate

当前只能声明：`K1-5 implementation candidate complete; independent acceptance pending.`
实施候选基线为 `51fa2177cbd25dea53f1ebaf23bd8b8426471589`，完整测试为 161/161；不得提前标记 accepted 或开启 K1-6。
