# Core VNext Documentation Synchronization Matrix

> **Lifecycle:** APPROVED COORDINATION BASELINE / POST-APPROVAL OWNERSHIP SYNC ACCEPTED / NEXT GATE SEPARATELY APPROVED CVN-2 PLANNING.
> **Scope:** roadmap and contract-authority synchronization only; no production source/test activation.

## Current Authority

| Subject | Current authority | Current status |
|---|---|---|
| Accepted Core behavior | `.trellis/spec/core-kernel/` and Core V1 close baseline `d92a7586536ac8757c318ae6f75aabd8698f85ac` | accepted and frozen compatibility base |
| Integrated official-domain public contract | GD-0 task acceptance record plus `backend/domain-transaction-integration.md` | accepted documentation/architecture contract; runtime separately gated |
| Core VNext completion scope and gate ownership | this parent PRD/design/implement | approved coordination baseline; CVN-0/1/3/4 and reservation gate archived |
| Core VNext exact feature behavior and qualification data | `feature-contract-matrix.md` CVN-FC-001–143 | approved parent contract; remaining gates separately activated |
| Product roadmap projection | product PRD/design/implement | post-approval legacy ownership synchronized and accepted |

## Post-Approval Mapping

This mapping changes task ownership only. It preserves every GD-0 public construction/result/availability/replay name, field and discriminant unless an independent GD-0 review explicitly returns that contract to planning.

| Existing roadmap label | New owner | Required document action |
|---|---|---|
| CK1.1-0 hostile-input guards | CVN-0 | replace downstream task label; retain descriptor-first/no-getter/no-throw contract |
| CK1.1-1 official module SDK | CVN-2 | replace downstream task label; retain SDK/application-root separation |
| GD-2 internal execution foundation | CVN-1 | record behavior-preserving Core-only refactor prerequisite |
| GD-2 integrated runtime/validation/replay | CVN-6 | move generic runtime responsibility; retain frozen GD-0 public surface |
| GD-2 cross-module batch extension | CVN-5 | add the new batch responsibility without a second submit/history path |
| GD-1/GD-3/GD-4 | Guitar roadmap after CVN-7 | pause implementation; later replan only Guitar-owned data, commands and conformance |

## Documents Synchronized for GD-0 Acceptance

### GD-0 authority and task artifacts

- `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/prd.md`
- `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/design.md`
- `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/implement.md`
- `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/documentation-sync-matrix.md`
- `.trellis/spec/core-kernel/backend/domain-transaction-integration.md`

Only downstream gate names/order and lifecycle references change. Tagged public declaration fences, exact validation/availability behavior and task-local contract fixtures remain protected and must be rerun.

### Active Core roadmap projections

- `.trellis/spec/core-kernel/index.md`
- `.trellis/spec/core-kernel/backend/index.md`
- `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`
- `.trellis/spec/core-kernel/backend/integration-gate.md`

These documents must continue to call Core V1 the accepted production baseline. They may identify Core VNext as an approved roadmap only after parent approval; no VNext behavior becomes an active code contract before its owning child is accepted.

Each newly activated child must copy only its owned CVN-FC rows into a task-local trace table and link back to `feature-contract-matrix.md`; it does not duplicate or reinterpret the complete matrix. Active specs gain a behavior only after that child is accepted.

### Product roadmap projections

- product `prd.md`, `design.md`, `implement.md` and `task.json`;
- `SPEC-003`, `SPEC-005`, `SPEC-009`, `SPEC-014`, `SPEC-015`, `SPEC-016`;
- `technical/software-architecture.md`, `technical/microkernel-architecture.md`, `technical/modular-plugin-architecture.md`.

The absent planned `SPEC-010-product-quality.md` is not fabricated during parent planning. Formal CVN-7 child `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/` now owns its Stage 10 creation at `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-010-product-quality.md`. It may synchronize only approved Core qualification fixtures, methods, budgets and evidence; later UI/file/playback/render/export/install budgets remain owned by `product-release-qualification-v1`. An alternative authority requires explicit parent review and replaces, rather than duplicates, this path.

## Protected Historical Scope

- archived K1-1 through K1-6 tasks and their acceptance snapshots;
- `planning-snapshots/`, retired plans and historical context notes explicitly labeled as snapshots;
- production `src/**`, `test/**`, package/build configuration and persisted fixtures during this documentation pass.

## Verification

The post-approval synchronization is accepted only if all of the following rerun successfully on the review candidate:

1. Run GD-0 Layer A Markdown public-contract verification.
2. Run GD-0 Layer B real-Core no-emit drift assertions.
3. Search active nonhistorical Markdown for the obsolete fixed sequence `CK1.1-0 -> CK1.1-1 -> GD-1 -> GD-2` and classify every remaining match.
4. Verify every concrete task/spec path exists; retain the explicit SPEC-010 planned-gap record until its owner lands.
5. Run Trellis validation for GD-0 and this parent task.
6. Verify the feature matrix has exactly 22 VNext command rows, every CVN-FC row maps to one gate, and no active child contains an unresolved public-contract placeholder.
7. Run `git diff --check` and verify no protected production path changed.
