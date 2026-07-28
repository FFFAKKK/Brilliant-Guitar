# GD-0 Documentation Synchronization Matrix

> **Candidate state:** synchronized on 2026-07-28; independent review pending.
> **Production implementation:** not authorized.

## Decision Coverage

| Decision | Fixed contract | Active Core authority | Product/spec projections | Status |
|---|---|---|---|---|
| GD0-D001 | One public submit port and one CommandBus/history/replay/event owner | `domain-transaction-integration.md` — Fixed Decisions; Submission Pipeline | product `design.md`/`implement.md`; SPEC-003; SPEC-009; both architecture docs | synchronized |
| GD0-D002 | Additive modular result/issue data; Core does not enumerate domain codes | `domain-transaction-integration.md` — Results, Issues, and Failures | SPEC-016; product `design.md`; microkernel architecture | synchronized |
| GD0-D003 | Core semantic first, then every installed domain semantic validator; profiles only after semantic validity | `domain-transaction-integration.md` — Submission Pipeline | SPEC-003; SPEC-005; product `design.md`; microkernel architecture | synchronized |
| GD0-D004 | One `core.document.committed` per committed transaction plus optional dirty event | `domain-transaction-integration.md` — Event Contract | SPEC-014; product `design.md`; microkernel architecture | synchronized |
| GD0-D005 | Known required contribution missing is lossless read-only; unknown opaque extension retains Core V1 preservation/writable behavior | `domain-transaction-integration.md` — Read, Replay, and Compatibility | SPEC-009; SPEC-014; both architecture docs | synchronized |

## Technical Derivation Coverage

| Derivation | Synchronized documents | Boundary retained |
|---|---|---|
| Startup-frozen `kernel.domain-commands.v1` catalog and private assembly identity | active Core spec; SPEC-009; SPEC-015; architecture docs | no dynamic registration, third-party runtime, or Registry event |
| Private nonempty effect set and fine-grained inverse history | active Core spec; SPEC-003; product design | no public patch, whole-document history snapshot, or mutable document |
| Part-owned GuitarExtension and atomic placement/pitch update | active Core spec; SPEC-005; product design/implement | no Guitar field or Guitar import in Core |
| Descriptor-first/no-getter/no-throw prerequisite | active Core spec; SPEC-016; product design/implement | CK1.1-0 remains separately gated |
| Official module SDK separated from application-facing Core root | active Core spec; SPEC-009; SPEC-016; modular architecture | no error classes, builders, handlers, or effects in application root |
| Fixed downstream sequence | active Core spec; product design/implement; SPEC-005; architecture docs | no downstream task activated by GD-0 |

## Changed Documentation Scope

- GD-0 task artifacts and this matrix.
- Product task metadata, `prd.md`, `design.md`, and `implement.md`.
- SPEC-003, SPEC-005, SPEC-009, SPEC-014, SPEC-015, and SPEC-016.
- `technical/microkernel-architecture.md` and `technical/modular-plugin-architecture.md`.
- `.trellis/spec/core-kernel/index.md`, backend index, K1-6 status line, and new `backend/domain-transaction-integration.md`.

## Protected Scope Evidence

The Stage 0 candidate contains no change under `src/**`, `test/**`, `package.json`, package lockfiles, TypeScript/build configuration, physical file-format implementation, UI, rendering, playback, or plugin runtime.

## Independent Review Checklist

- [ ] D001-D005 match the approved GD-0 `prd.md` and `design.md` without reopening product decisions.
- [ ] Core-only K1-1 through K1-6 behavior is distinguished from future integrated behavior.
- [ ] The new Core V1.1 spec contains no Guitar-specific implementation dependency.
- [ ] Missing-domain read-only behavior is not confused with unknown opaque-extension preservation.
- [ ] No document claims CK1.1-0, CK1.1-1, GD-1, GD-2, GD-3, or GD-4 implementation is authorized or complete.
- [ ] Trellis task validation and `git diff --check` pass on the candidate.
