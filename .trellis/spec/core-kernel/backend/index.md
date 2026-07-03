# Core Kernel Backend Guidelines

> Coding rules for the Pure Core Kernel V1 implementation.

---

## Scope

These guidelines apply to the pure TypeScript Core Kernel for `Brilliant Guitar`.

Pure Core Kernel V1 is not the desktop app. It must be testable without React, Tauri, VexFlow, Web Audio, browser DOM, PDF/PNG libraries, Guitar Pro parsers, zip file IO, or platform file-system APIs.

---

## Pre-Development Checklist

- [ ] Read the active task artifacts: `prd.md`, `design.md`, and `implement.md`.
- [ ] Confirm the current task is implementing `Pure Core Kernel V1 only`.
- [ ] Read every guide in this directory before touching Core Kernel code.
- [ ] Identify which of the 9 kernel mechanisms the change touches.
- [ ] Confirm new domain concepts map to one of the 9 mechanisms; do not silently create a tenth kernel mechanism.
- [ ] Confirm all score mutations go through semantic commands.
- [ ] Confirm all read paths use snapshot or selector contracts.
- [ ] Confirm no UI, rendering, audio, desktop shell, physical file IO, or third-party plugin runtime dependency is introduced.
- [ ] Confirm tests can run in a pure TypeScript environment.

---

## Guidelines Index

| Guide | Purpose | Status |
|-------|---------|--------|
| [Pure Kernel Boundary](./pure-kernel-boundary.md) | What Core Kernel V1 may and may not contain | Stable |
| [Score Document Model](./score-document-model.md) | Score truth, MVP musical scope, schema constraints | Stable |
| [Command and Transaction](./command-transaction.md) | Semantic commands, transactions, undo/redo, replay | Stable |
| [Snapshot and Events](./snapshot-events.md) | Read API, selectors, post-commit events, cache invalidation | Stable |
| [Registry and Capability](./registry-capability.md) | Module identity, static registration, capability checks | Stable |
| [Errors and Reports](./errors-reports.md) | Structured errors, diagnostics, reports, privacy | Stable |
| [Quality Guidelines](./quality-guidelines.md) | Required tests and forbidden shortcuts | Stable |

---

## Quality Check

Before finishing Core Kernel work, verify:

- [ ] `ScoreDocument` remains the only score truth.
- [ ] Public writes are command-only; no public patch, JSON path, mutable draft, or field replacement API exists.
- [ ] Command failures roll back and do not create undo entries.
- [ ] Snapshot and selector results cannot mutate kernel state.
- [ ] Events are post-commit facts and do not contain mutable documents or internal deltas.
- [ ] Registry summaries never expose handlers or mutable objects.
- [ ] Capability checks happen before command execution, selector access, and contribution registration.
- [ ] Kernel errors, diagnostics, and reports use stable codes and `messageKey`.
- [ ] `.bgp` semantic schema and migration entry points stay independent from physical zip/file IO.
- [ ] Any newly added kernel concept is documented as part of one of the 9 mechanisms or has an approved boundary decision.
- [ ] Tests cover the 4-measure standard 6-string guitar riff fixture and unsupported MVP boundaries.
