# SPEC-016 内核错误、Diagnostic 与 Report 重规划门

> **状态：PARTIAL CONTRACT / K1-5 BLOCKED。** K1-1 的 validation diagnostics 已是活动兼容面；通用 operation errors、reports 与 migration shell 仍须 K1-5 重规划。

## 1. Scope / Trigger

当前立即适用于 decode、Core semantic validation 与 ScoreFeatureProfile。实现命令、registry、migration、import/export 或 recovery 时，必须先批准 K1-5 的其余契约。

## 2. Signatures

K1-1 已批准：

```typescript
interface Diagnostic {
  readonly code: DiagnosticCode
  readonly messageKey: `core.${DiagnosticCode}`
  readonly path: readonly (string | number)[]
  readonly details?: JsonObject
}
```

`DiagnosticCode` 是 `.trellis/spec/core-kernel/backend/errors-reports.md` 中记录并由 TypeScript union 约束的封闭集合，不得使用任意 string。KernelError/KernelReport 最终签名尚未批准。

## 3. Contracts

- `decode.*`、`semantic.*`、`unsupported.*` 的 code、messageKey、path 与确定顺序是兼容面。
- 外层 operation error/report 必须保留具体 validation diagnostics，不得折叠成泛化字符串。
- Guitar Domain 后续拥有 `guitar.*`，Core 不产生或解释该族。
- 用户可见文本通过 i18n messageKey 解析。
- details 只含有限、隐私安全 JsonValue，不含原始异常、令牌、密钥、私有绝对路径或整段谱面正文。
- Report shell 的 kind/status/source/summary/issues 只有在 K1-5 证明消费方后才能定型。

## 4. Validation & Error Matrix

| Layer | Current owner | Status |
|---|---|---|
| decode/semantic/profile diagnostics | K1-1 stable spec | approved |
| Guitar diagnostics | future Guitar Domain | blocked |
| command/transaction errors | K1-2 + K1-5 | blocked |
| registry/capability errors | K1-4 + K1-5 | blocked |
| migration/import/export/recovery reports | K1-5 / external modules | blocked |

## 5. Good / Base / Bad Cases

- Good：ValidationReport 未来引用原始 `semantic.measure-coverage-missing`，路径和 details 不丢失。
- Base：合法但当前不支持的和弦保持 `unsupported.chord`，不变成 operation failure。
- Bad：`type ValidationDiagnosticCode = string`，或 report 把所有失败改写成 `validation-failed`。

## 6. Tests Required

现有 K1-1 测试继续验证封闭 code、messageKey、路径、隐私和确定顺序。K1-5 必须补充 report code 保留、模块异常转换、隐私边界、序列化和跨操作一致性测试。

## 7. Wrong vs Correct

```typescript
// Wrong
report.issues = [{ code: "validation-failed" }]

// Correct direction
report.issues = diagnostics.map(preserveDiagnosticAsReportIssue)
```
