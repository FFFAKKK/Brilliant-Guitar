# GD-0 Documentation Synchronization Matrix

> **Lifecycle:** USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING.
> **Production implementation:** not authorized.

## Decision Coverage

| Decision | Fixed contract | Active Core authority | Product/spec projections | Status |
|---|---|---|---|---|
| GD0-D001 | One public submit port and one CommandBus/history/replay/event owner | `domain-transaction-integration.md` — Fixed Decisions; Submission Pipeline | product `design.md`/`implement.md`; SPEC-003; SPEC-009; architecture docs | synchronized |
| GD0-D002 | Additive modular result/issue data; Core does not enumerate domain codes | `domain-transaction-integration.md` — Results, Issues, and Failures | SPEC-016; product `design.md`; microkernel architecture | synchronized |
| GD0-D003 | Core semantic first, then every installed domain semantic validator; profiles only after semantic validity | `domain-transaction-integration.md` — Submission Pipeline | SPEC-003; SPEC-005; product `design.md`; microkernel architecture | synchronized |
| GD0-D004 | One `core.document.committed` per committed transaction plus optional dirty event | `domain-transaction-integration.md` — Event Contract | SPEC-014; product `design.md`; microkernel architecture | synchronized |
| GD0-D005 | Exact per-block `ExtensionBlock.schemaVersion` support; missing/incompatible/future required domains are lossless read-only and validation-incomplete; mixed gaps select incompatible while returning all facts; a mixed contribution exposes only its compatible block-scoped view and never executes an incompatible-block handler | `domain-transaction-integration.md` — Compatibility and Availability | SPEC-003; SPEC-005; SPEC-009; SPEC-014; SPEC-015; architecture docs | synchronized |

## Technical Derivation Coverage

| Derivation | Synchronized documents | Boundary retained |
|---|---|---|
| Startup-frozen `kernel.domain-commands.v1` catalog and private assembly identity | active Core spec; SPEC-009; SPEC-015; architecture docs | no dynamic registration, third-party runtime, or Registry event |
| Private nonempty effect set and fine-grained inverse history | active Core spec; SPEC-003; product design | no public patch, whole-document history snapshot, or mutable document |
| Part-owned GuitarExtension and atomic placement/pitch update | active Core spec; SPEC-005; product design/implement | no Guitar field or Guitar import in Core |
| Descriptor-first/no-getter/no-throw prerequisite | active Core spec; SPEC-016; product design/implement | CK1.1-0 remains separately gated |
| Frozen minimum integrated public signatures/discriminants | GD-0 design; active Core spec; SPEC-003; SPEC-014; docs-only contract compiler | legal no-emit declarations; `createGateway` is an instance overload; `summary`/typed `select`/`subscribe` remain; private authoring/runtime layout remains for CK1.1-1/GD-2 |
| Explicit validation completeness | GD-0 PRD/design; active Core spec; product PRD/design/implement; SPEC-014/SPEC-016 | Core-only validation cannot masquerade as complete installed-domain validation |
| Exact extension schema compatibility | pure boundary; active Core spec; SPEC-005/SPEC-009/SPEC-015; architecture docs | exact finite versions per block; mixed owner/version views expose only compatible blocks; no guessing/downgrade/implicit migration |
| Mixed availability failure selection | GD-0 PRD/design/implement; active Core spec; SPEC-003/SPEC-014; architecture docs | any incompatible fact wins the code; every write path returns the complete canonical fact list |
| Official module SDK separated from application-facing Core root | active Core spec; SPEC-009; SPEC-016; modular architecture | no error classes, builders, handlers, or effects in application root |
| Fixed downstream sequence | active Core spec; product design/implement; SPEC-005; architecture docs | no downstream task activated by GD-0 |

## Changed Documentation Scope

- GD-0 task artifacts, research decision closure, and this matrix.
- The task-local docs-only contract fixture under `contract-fixtures/`; it reads tagged Markdown fences and writes only temporary no-emit compiler input outside tracked source/test paths.
- Product task metadata, `prd.md`, `design.md`, and `implement.md`.
- SPEC-003, SPEC-005, SPEC-009, SPEC-014, SPEC-015, and SPEC-016.
- `technical/microkernel-architecture.md` and `technical/modular-plugin-architecture.md`.
- `.trellis/spec/core-kernel/index.md`, backend index, `backend/pure-kernel-boundary.md`, `backend/integration-gate.md` status line, and `backend/domain-transaction-integration.md`.
- Product `technical/software-architecture.md` in addition to the microkernel/modular architecture projections.

## Protected Scope Evidence

The Stage 0 candidate contains no change under `src/**`, `test/**`, `package.json`, package lockfiles, TypeScript/build configuration, physical file-format implementation, UI, rendering, playback, or plugin runtime. Its only executable fixture is task-local documentation tooling and does not alter production compilation or test semantics.

## Independent Review Checklist

- [ ] D001-D005 match the user-approved plan in GD-0 `prd.md` and `design.md` without prematurely claiming documentation acceptance.
- [ ] Core-only K1-1 through K1-6 behavior is distinguished from future integrated behavior.
- [ ] The new Core V1.1 spec contains no Guitar-specific implementation dependency.
- [ ] Missing/incompatible/future-schema read-only behavior is not confused with unknown opaque-extension preservation.
- [ ] Mixed unavailable/incompatible facts use the incompatible failure code plus the complete canonical facts for submit, undo, redo, and replay.
- [ ] One contribution with compatible and incompatible/future blocks receives only the compatible block-scoped validation/classification view; excluded blocks reach zero handlers and remain lossless.
- [ ] Availability facts prove whether installed-domain validation is complete; Core-only validation is never labeled complete domain validity.
- [ ] The docs-only compiler reports zero parse/type diagnostics for the minimum integrated factory, Registry instance overload/full gateway, read availability, and replay declarations.
- [ ] No document claims CK1.1-0, CK1.1-1, GD-1, GD-2, GD-3, or GD-4 implementation is authorized or complete.
- [ ] Trellis task validation and `git diff --check` pass on the candidate.
