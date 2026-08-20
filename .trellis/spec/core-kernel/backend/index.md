# Core Kernel Backend Guidelines

> **Current Core implementation stage (2026-08-20):** Pure Core Kernel V1, CVN-0 through CVN-6, the extensibility reservation gate, and GD-0 are accepted and archived. CVN-5 source `f329ec1` was archived at `198c71a`. CVN-7 remains `in_progress`; the official stress attempt was executed at `b21540fa3636e6c8e827ff24c2099f4ff331285d` but ended `EVIDENCE_INVALID` with measurement incomplete. It is not a qualification pass. The next CVN-7 gate is the qualification measurement contract targeted preflight rereview before any new complete official run. Guitar/product/public-plugin work remains outside Core VNext.
> K1-4 is fixed at `94766a0930c05e5339c44f667deaf02116af1c0c` with 125/125 tests passing.
> K1-5 implementation baseline `51fa2177cbd25dea53f1ebaf23bd8b8426471589` was independently accepted at documentation baseline `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` with 161/161 tests passing. K1-6 test baseline `355512aba4a8057d2d75aa665d74df49cdd2e23c` passed 8/8 focused and 169/169 full tests and was independently accepted at review baseline `989c1f7a4056b14d3d59918c9b96874ad71591a8`; Pure Core Kernel V1 is closed.
> CVN-3 was accepted and archived at source/test candidate `d9500f5a8ac285071586ba8eda380370eafd022f`; CVN-4's final accepted repair/source line is `b0272e2eabd0d222baea12cbaae3e08f9f61bfdd`; CVN-5 source `f329ec10bc77c530282db3a6f47dbd6b6112859e` was accepted and archived at `198c71a039defee19d3e435664b9bd9b682cd135`. The accepted `38afdc3` production line has 28 Core commands and passed 432/432 normalized-HEAD tests. The `623f94a` CVN-7 candidate adds qualification tests/harness only and recorded 501/501 before freeze; it is not part of the accepted Core claim until measurement, final technical review, acceptance and archive complete.

> **RKP-0 transition state (2026-08-15):** the TypeScript runtime remains current authority. The Rust path is limited to the [rust runtime transition contract](rust-runtime-transition.md), deterministic test-only oracle data, and Qualification V2 contract data; no native/runtime cutover is authorized. CVN-7 official input five is invalid/incomplete and has no published partial evidence.

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
| [Score Document Model](./score-document-model.md) | `brilliant-score-1`, exact time, pitch, extensions, validation | K1-1 authoritative + accepted CVN-3/CVN-4 additions |
| [Command and Transaction](./command-transaction.md) | K1-2 executable command/transaction/history/replay contract | K1-2 authoritative + accepted CVN-1/CVN-3/CVN-4 additions |
| [Snapshot and Events](./snapshot-events.md) | K1-3 address/read/checkpoint/event implementation contract | K1-3 authoritative |
| [Registry and Capability](./registry-capability.md) | Approved K1-4 startup Registry/gateway implementation contract | K1-4 accepted + accepted CVN-1/CVN-3/CVN-4 descriptors |
| [Errors and Reports](./errors-reports.md) | K1-5 additive Issue/Report adapters and current-schema migration | K1-5 accepted + accepted CVN-3/CVN-4 failure mappings |
| [Integration Gate](./integration-gate.md) | K1-6 cross-contract fixture, deterministic public flow, failure/privacy matrix, and final gate | Accepted / Pure Core V1 closed |
| [Domain Transaction Integration](./domain-transaction-integration.md) | GD-0 additive Core V1.1 seam for official domain commands, unified transactions, exact schema compatibility, validation completeness, events, and read-only degradation | Accepted documentation/architecture contract; runtime separately gated |
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
- [x] K1-5 adapters preserve accepted failure facts, reports derive status/summary, and migration stays detached from CommandBus state.
- [x] K1-5 public output contains no raw Error fields, ID/time metadata, dynamic migration registry, physical IO, or unapproved report kinds.
- [x] K1-6 exercises the accepted public surface through one deterministic four-measure flow and eight focused integration tests.
- [x] K1-6 preserves extensions, failure atomicity, unsupported separation, capability denial, and subscriber/report privacy without production source changes.
- [ ] Semantic schema/codec stays independent from physical zip/file IO.
- [ ] Any newly added kernel concept is documented as part of one of the 9 mechanisms or has an approved boundary decision.
- [ ] Any Core V1.1 domain integration preserves the single CommandBus/history/replay/event owner and follows `domain-transaction-integration.md`.
- [ ] Tests cover the Core loop fixture and semantic-valid-but-profile-unsupported boundaries.
