# K1-5 versus CVN-5 Scope Audit

## Finding

K1-5 and CVN-5 are different stages despite the shared numeric suffix.

## K1-5 accepted responsibility

The completed Core V1 K1-5 stage owns the stable errors, diagnostics, report projection and migration shell used by existing Core behavior. It did not add range transformations or explicit atomic semantic batches.

## CVN-5 responsibility

CVN-5 owns exactly:

- `core.range.delete`;
- `core.range.transpose-written-pitch`;
- `core.transaction.batch`;
- their range selection, atomic coordination, child failure attribution, history/replay/event integration and bounded regressions.

It consumes accepted K1-5 error/report infrastructure but does not replace it. New stable failure variants are projected through the existing mechanism with no new application-root error class.

## Guard against future confusion

Task status and reports must use the full labels:

- `K1-5 Core V1 errors/reports/migration shell — accepted`;
- `CVN-5 Range Operations and Explicit Atomic Batch — planning/dependency blocked`.

Neither label alone is evidence that the other stage is complete.
