# Pure Core Kernel Boundary

> **Authoritative staged boundary (2026-07-29):** K1-1 through K1-6 are independently accepted, the Core V1 qualification gate is archived, and Pure Core Kernel V1 is closed.
> **GD-0 lifecycle:** USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING.

## Closed Pure Core Kernel V1 Baseline

Pure Core Kernel V1 consists only of the accepted K1-1 through K1-6 contracts:

- K1-1: `ScoreDocument`, exact musical time and written pitch, strict decode, semantic validation, feature support, and lossless `ExtensionBlock` preservation.
- K1-2: the closed six-command write boundary, atomic transactions, document version, history, undo/redo, and deterministic replay.
- K1-3: stable addresses and ranges, immutable snapshots and selectors, checkpoint/dirty state, and deterministic committed/session events.
- K1-4: the startup-frozen Registry, immutable compiled contribution tables, capabilities, and module gateway.
- K1-5: data-only issue/report adapters, validation and current-schema migration reports, privacy boundaries, and detached current-schema migration compatibility.
- K1-6: cross-contract integration evidence. Its accepted flow passed 8/8 focused and 169/169 full tests without changing the K1-1 through K1-5 production contracts.

The archived Core V1 qualification gate recorded 25 covered contract groups, zero coverage gaps, and zero reproducible bugs. Its sole nonblocking P3 disposition requires future public `unknown` guards to be descriptor-first, no-getter, and no-throw through a separately accepted Core V1.1 prerequisite.

## Frozen Core-Only Contract

Core-only construction, exports, persisted `brilliant-score-1` meaning, command/result unions, history and replay behavior, snapshots/selectors/checkpoints, event ordering, Registry/capability behavior, Issue/Report contracts, and migration compatibility are frozen at the accepted Core V1 baseline. An additive integration may consume these contracts but does not rename, widen, or reinterpret them.

Pure Core remains a platform-neutral TypeScript library with no Guitar imports, UI, DOM, rendering, audio, physical package/file IO, dynamic plugin lifecycle, or generic external document-mutation capability. `ScoreDocument` remains the only score truth, `ExtensionBlock` remains an opaque persistence envelope at the Core boundary, and `CommandBus` remains the sole document/version/history owner.

## GD-0 Additive Documentation Candidate

GD-0 is an additive integrated documentation review candidate, not an accepted runtime baseline. It defines the minimum behavior required for official domain contributions to join the existing transaction owner while leaving every Core-only path unchanged. Its authority is limited to `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/` and `domain-transaction-integration.md` until independent acceptance.

The candidate requires exact `ExtensionBlock.schemaVersion` compatibility negotiation, explicit complete/incomplete domain-validation availability, lossless read-only degradation for missing or incompatible required contributions, and stable integrated public signatures/discriminants. CK1.1-0, CK1.1-1, GD-1, GD-2, GD-3, and later production work remain inactive and require separate plans and acceptance gates.

Every active Core-only type must map to an accepted K1-1 through K1-6 contract. Every additive integrated type must map to the GD-0 review candidate and still requires separately accepted production implementation. Retired boundary drafts live only under `.trellis/archive/core-kernel/`.
