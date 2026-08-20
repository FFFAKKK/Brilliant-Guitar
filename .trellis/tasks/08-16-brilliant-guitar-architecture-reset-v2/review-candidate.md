# Architecture Reset V2 — Independent Review Candidate

## Candidate status

**Status: `DEDICATED CROSS-THREAD ARCHITECTURE REVIEW PASSED — USER ACCEPTED — AUTHORITY SYNC ACCEPTED`.** Dedicated audit task `01a01da3-548c-7513-a53c-0e10d1aa7350` reviewed exact content commit `e81c739b1452a41a412966ee1f40367476011916` and returned `PASS`, P0/P1/P2=`0/0/0`, checklist `34/34`. User acceptance is recorded on `2026-08-20`; authority-sync task `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync` was independently accepted on repaired commit `d72278927468d93fd8817defaa18e7eb0976b1bb`. RKP-1 remains uncreated; the next gate is only creation of its planning task.

## Exact review input

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\brilliant-guitar-architecture-reset-v2`
- Branch: `codex/brilliant-guitar-architecture-reset-v2`
- Base: `5e1599598b1468784ae9b7410383ef63b33201b8`
- Audited candidate content commit: `e81c739b1452a41a412966ee1f40367476011916`
- Audit-record commit: the current docs-only HEAD; its diff from the audited content commit is restricted to review/task/handoff evidence
- Task: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2`
- Parent: `.trellis/tasks/06-29-commercial-guitar-tablature-product`

## Review scope

The auditor should assess architecture completeness and internal consistency, not production implementation. Review at least:

1. Does current-architecture evidence support the claimed root cause, without treating the CVN-7 timeout as a performance PASS or candidate regression?
2. Is the document truly self-contained?
3. Are Core Types, Score Foundation, Extension Protocol, Contracts, Runtime, Session/Use Cases, Bridge and Product Application distinct?
4. Is the seven-crate graph acyclic, with Core Types as the leaf and Session as the only Core-handler/composition owner?
5. Do ScoreDocument and LiveScoreStore express one semantic truth with explicit conversion?
6. Are EntityId, RuntimeHandle and MusicalLocation correctly separated at every file/FFI/event/plugin boundary?
7. Do indices and local-edit complexity avoid unrelated-score scans while preserving deterministic order?
8. Are overlay/store/index/history/event adoption and rejection zero-delta fully atomic?
9. Does cursor history preserve accepted undo/redo/replay behavior without documents/functions/handles?
10. Is incremental validation gated by complete diagnostic parity and explicit fallback?
11. Are snapshots/selectors/events/thread ownership precise and free of second state owners?
12. Are Guitar, Piano, Bass and third-party Instrument Plugins equal protocol consumers with no official Runtime privilege?
13. Are Plugin Semantic Command, DomainChangeProposal and KernelExtensionTransactionRequest distinct, with no instrument handler registered in Rust?
14. Does Level A/B/C validation close authoritative domain writes, including structural-only limits and deterministic declarative/WASM behavior?
15. Are known requirements independent from installed contributions, with exact `requirementVersion: 1`, 1,024-row/256-version caps, arbitrary dense input-order canonicalization, installed-requirement parity and only inventory miss classified unknown?
16. Do unavailable-only, incompatible-only and mixed states publish a complete global read-only KernelSession with selector/snapshot/encode and zero write callbacks?
17. Are WASM bytes captured once with 256/8 MiB/64 MiB caps, Rust SHA-256, ABI/role/reference checks and private compilation before migration or validation?
18. Is validation policy Catalog-only, with policy/namespace/schema/WASM/capability request fields rejected as extras?
19. Are WASM inputs/outputs pure and exact, with fuel/memory/stack/output/issue/fact caps and atomic trap/overflow behavior?
20. Does KernelSessionComposition have one `kernel-session` owner and Product ApplicationAssembly one Product Host owner, with different identities?
21. Does pre-session TypeScript migration precede capture, while prepared-WASM migration follows Rust preparation and every unavailable path preserves an original read-only Session?
22. Are namespace writes owner-only and cross-plugin collaboration limited to declared/versioned public contributions?
23. Is stale revision rejected by Kernel, with at most one host-side recomputation and no Core rebase?
24. Is Official BGP Persistence the unique canonical V1 durability owner while other formats use provider ports?
25. Does Instrument semantic contribution flow through Layout Engine and Render Scene before Renderer?
26. Are Event/Voice time truth, Note fields and score/Part ExtensionBlock V1 preserved?
27. Does Node/Tauri bridging use small DTOs and avoid a second validation/transaction path?
28. Do the exact 28/51/8/34/9/schema inventories match accepted RKP-0 fixtures?
29. Are performance targets paired with complexity counters and executable future gates?
30. Does RKP-5 implement protocol/WASM and RKP-6 inventory/composition/gateway/migration, while RKP-7 only proves, RKP-8 only switches and RKP-9 only qualifies accepted fixtures?
31. Are real BGP Persistence, Layout/Renderer and Guitar implementation/qualification left to post-RKP product children?
32. Does RKP-9 lead to the default Guitar Instrument Plugin/Core Loop before broad horizontal expansion?
33. Does every old-document conflict have an explicit retain/refine/supersede/historical/defer disposition?
34. Is candidate scope docs-only and are current authorities/RKP-1 untouched?

## Review exclusions

- Do not edit files.
- Do not run `task.py start`.
- Do not create RKP-1.
- Do not accept/archive/push.
- Do not require a concrete Rust collection choice that V2 explicitly assigns to RKP-2, unless the delegated acceptance constraints are insufficient.

## Expected verdict format

```text
PASS
P0/P1/P2 = 0/0/0
```

or:

```text
RETURN FOR BOUNDED PLANNING REPAIR
P0/P1/P2 = x/y/z
[finding with exact file:line, impact, and narrow repair]
```

## Local candidate evidence

Latest inventory/preparation bounded-repair evidence:

- New-task Trellis: `PASS`, 28 + 28 entries.
- Product-parent Trellis: `PASS`, 0 + 0 entries.
- Rust-parent Trellis: `PASS`, 18 + 19 entries.
- Post-Core-parent Trellis: `PASS`, 15 + 16 entries.
- JSON/JSONL/path uniqueness: `PASS`, 28 unique existing paths in each context file.
- Parent child count: `PASS`, exactly 1.
- Markdown/Mermaid fences: `PASS`, 96 fence lines, 6 Mermaid openers, zero odd files.
- `git diff --check`: `PASS`.
- Protected production delta: `PASS`, zero across `src/**`, `test/**`, package/tsconfig/Cargo and `crates/**`.
- Typecheck: `PASS`.
- Build: `PASS`.
- Full suite: `PASS`, 531/531 on the clean repair commit; the planner report must also supply the post-amend clean-HEAD rerun result and resolved commit hash.
- Planning self-audit: `PASS`, P0/P1/P2=`0/0/0`.
- Repair commit scope: `PASS`, 11 files and all are inside this candidate task directory.
- Worktree: the planner report must supply final clean/staged-empty status after the evidence amend.

## Current lifecycle declaration

- Formal independent architecture review: `PASS on e81c739b1452a41a412966ee1f40367476011916`, P0/P1/P2=`0/0/0`.
- Dedicated audit task: `01a01da3-548c-7513-a53c-0e10d1aa7350`; read-only final verdict received.
- Advisory subagent result: `not formal evidence; four reproduced planning findings consumed`.
- V2 current authority: `true`; synchronized pointers are accepted after `PASS` on repaired commit `d72278927468d93fd8817defaa18e7eb0976b1bb`.
- Authority-sync task: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`.
- Production implementation authorization: `false`.
- RKP-1 created/started: `false/false`.
- Archive/push: `false/false`.
- Next gate: create the separate RKP-1 planning task only; no implementation activation is implied.
