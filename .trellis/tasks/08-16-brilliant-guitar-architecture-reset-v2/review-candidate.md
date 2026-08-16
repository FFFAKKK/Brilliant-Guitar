# Architecture Reset V2 — Independent Review Candidate

## Candidate status

**Status: `READY FOR TARGETED INDEPENDENT ARCHITECTURE REREVIEW`.** The bounded plugin-runtime repair and local clean-HEAD gates passed. The task remains `planning`; this self-audit does not replace the separate read-only architecture rereview.

## Exact review input

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\brilliant-guitar-architecture-reset-v2`
- Branch: `codex/brilliant-guitar-architecture-reset-v2`
- Base: `5e1599598b1468784ae9b7410383ef63b33201b8`
- Candidate HEAD: the docs-only commit containing this file; resolve with `git rev-parse HEAD` and compare with the final planner report
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
15. Are WASM inputs/outputs pure and exact, with fuel/memory/output caps and atomic trap/overflow behavior?
16. Does KernelSessionComposition have one `kernel-session` owner and Product ApplicationAssembly one Product Host owner, with different identities?
17. Does pre-session migration preserve missing-plugin blocks and avoid a partially migrated writable session?
18. Are namespace writes owner-only and cross-plugin collaboration limited to declared/versioned public contributions?
19. Is stale revision rejected by Kernel, with at most one host-side recomputation and no Core rebase?
20. Is Official BGP Persistence the unique canonical V1 durability owner while other formats use provider ports?
21. Does Instrument semantic contribution flow through Layout Engine and Render Scene before Renderer?
22. Are Event/Voice time truth, Note fields and score/Part ExtensionBlock V1 preserved?
23. Does Node/Tauri bridging use small DTOs and avoid a second validation/transaction path?
24. Do the exact 28/51/8/34/9/schema inventories match accepted RKP-0 fixtures?
25. Are performance targets paired with complexity counters and executable future gates?
26. Do RKP-1/5/6/9 uniquely own the repaired contracts while RKP-8 remains the only cutover?
27. Does RKP-9 lead to the default Guitar Instrument Plugin/Core Loop before broad horizontal expansion?
28. Does every old-document conflict have an explicit retain/refine/supersede/historical/defer disposition?
29. Is candidate scope docs-only and are current authorities/RKP-1 untouched?

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

Latest bounded-repair evidence:

- New-task Trellis: `PASS`, 27 + 27 entries.
- Product-parent Trellis: `PASS`, 0 + 0 entries.
- Rust-parent Trellis: `PASS`, 18 + 19 entries.
- Post-Core-parent Trellis: `PASS`, 15 + 16 entries.
- JSON/JSONL/path uniqueness: `PASS`, 27 unique existing paths in each context file.
- Parent child count: `PASS`, exactly 1.
- Markdown/Mermaid fences: `PASS`.
- `git diff --check`: `PASS`.
- Protected production delta: `PASS`, zero.
- Typecheck: `PASS`.
- Build: `PASS`.
- Full suite: `PASS`, 531/531 on the clean repair HEAD.
- Planning self-audit: `PASS`, P0/P1/P2=`0/0/0`.
- Repair commit scope: `PASS`, candidate task directory only; cumulative base diff retains the already-committed parent child reference.
- Worktree after final amended commit: `PASS`, clean and staged empty; the final planner report supplies the resolved HEAD.

## Current lifecycle declaration

- Independent architecture review: `targeted rereview pending after bounded plugin-runtime repair`.
- V2 current authority: `false`.
- Production implementation authorization: `false`.
- RKP-1 created/started: `false/false`.
- Archive/push: `false/false`.
