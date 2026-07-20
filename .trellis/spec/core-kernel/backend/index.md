# Core Kernel Backend Guidelines

> **Current Core implementation stage (2026-07-20):** K1-1 through K1-4 are accepted foundations.
> K1-4 is fixed at `94766a0930c05e5339c44f667deaf02116af1c0c` with 125/125 tests passing.
> K1-5 implementation candidate is complete at `51fa2177cbd25dea53f1ebaf23bd8b8426471589` with 161/161 tests passing; independent acceptance is pending, so K1-6 remains blocked.

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
- [ ] Identify which staged kernel mechanisms the active task touches.
- [ ] Confirm new domain concepts map to one of the 9 mechanisms; do not silently create a tenth kernel mechanism.
- [ ] Confirm writes use the accepted K1-2 command boundary and K1-3 reads/events follow `snapshot-events.md`.
- [ ] Confirm no UI, rendering, audio, desktop shell, physical file IO, or third-party plugin runtime dependency is introduced.
- [ ] Confirm tests can run in a pure TypeScript environment.

---

## Guidelines Index

| Guide | Purpose | Status |
|-------|---------|--------|
| [Pure Kernel Boundary](./pure-kernel-boundary.md) | What Core Kernel V1 may and may not contain | Stable |
| [Score Document Model](./score-document-model.md) | `brilliant-score-1`, exact time, pitch, extensions, validation | K1-1 authoritative |
| [Command and Transaction](./command-transaction.md) | K1-2 executable command/transaction/history/replay contract | Active |
| [Snapshot and Events](./snapshot-events.md) | K1-3 address/read/checkpoint/event implementation contract | K1-3 authoritative |
| [Registry and Capability](./registry-capability.md) | Approved K1-4 startup Registry/gateway implementation contract | Accepted at `94766a0` |
| [Errors and Reports](./errors-reports.md) | K1-5 additive Issue/Report adapters and current-schema migration | Candidate; acceptance pending |
| [Quality Guidelines](./quality-guidelines.md) | Required tests and forbidden shortcuts | Stable |

---

## Quality Check

Before finishing Core Kernel work, verify the frozen K1-1 rules plus the active task contract:

- [ ] `ScoreDocument` remains the only score truth.
- [ ] Measure order, event order/time, and sounding pitch each have one truth source.
- [ ] Fraction/NoteValue arithmetic is exact and overflow-safe.
- [ ] Decode, semantic validation, and feature-profile validation are separate.
- [ ] Unknown ExtensionBlock payload survives semantic round-trip.
- [ ] Core does not interpret guitar payloads or expose test assets.
- [ ] Diagnostics use stable codes, messageKeys, paths, and deterministic ordering.
- [ ] K1-5 adapters preserve accepted failure facts, reports derive status/summary, and migration stays detached from CommandBus state.
- [ ] K1-5 public output contains no raw Error fields, ID/time metadata, dynamic migration registry, physical IO, or unapproved report kinds.
- [ ] Semantic schema/codec stays independent from physical zip/file IO.
- [ ] Any newly added kernel concept is documented as part of one of the 9 mechanisms or has an approved boundary decision.
- [ ] Tests cover the Core loop fixture and semantic-valid-but-profile-unsupported boundaries.
