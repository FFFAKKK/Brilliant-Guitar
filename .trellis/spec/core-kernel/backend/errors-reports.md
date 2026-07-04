# Errors and Reports

## Core Rule

All kernel failures must be structured, stable, testable, localizable, and privacy-safe by default.

Do not express kernel failures only as thrown strings, UI text, console logs, or untyped exceptions.

## Error Rules

- `KernelError` must contain stable `code`, `severity`, and `messageKey`.
- `code` is a compatibility and test contract.
- `messageKey` is the only user-visible text pointer.
- Error `details` must be machine-readable and privacy-safe.
- Fatal severity means the current operation cannot safely continue; it does not automatically mean the application must exit.
- `KernelErrorCode` is operation-level. Do not add every score validation rule to the generic error enum.

## Diagnostic Rules

- Diagnostics must be able to target document, score address, score range, module, contribution, file, or operation scope.
- Hard validation failures must produce structured diagnostics with fine-grained validation diagnostic codes such as `rhythm-slot-gap`, `technique-definition-missing`, or `pitch-octave-out-of-range`.
- Do not collapse targeted validation failures into broad codes such as `duration-invalid` when a specific validation code is defined by the owning score model spec.
- If a command rolls back because hard validation fails, the outer `KernelError.code` may be `command-validation-failed`, but the returned diagnostics must preserve the concrete validation diagnostic codes.
- Module exceptions must be caught and converted to `module-error` diagnostics or report issues.
- UI localization happens outside the kernel.

## Report Rules

Reports share one shell for validation, migration, import, export, and recovery:

- Report id.
- Kind.
- Status.
- Source module.
- Created timestamp.
- Issue summary.
- Issues.

`ImportReport` and `ExportReport` are report shells for external modules. Their presence in Core Kernel does not mean Core Kernel implements real import/export formats.

Report issue codes may reference either operation-level `KernelErrorCode` values or score validation diagnostic codes. Validation reports should preserve the specific validation codes instead of rewriting them to generic operation errors.

## Privacy Rules

By default, errors, diagnostics, reports, and details must not include:

- User score text beyond structured references.
- Access tokens.
- API keys.
- Local private absolute paths.
- Third-party secrets.
- Full plugin source code.

If a detail is useful for debugging but privacy-sensitive, store a redacted value, stable code, or target reference instead.
