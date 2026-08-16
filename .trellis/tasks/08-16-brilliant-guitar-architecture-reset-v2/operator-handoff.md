# Architecture Reset V2 — Operator and Auditor Handoff

## Current object

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\brilliant-guitar-architecture-reset-v2`
- Branch: `codex/brilliant-guitar-architecture-reset-v2`
- Base: `5e1599598b1468784ae9b7410383ef63b33201b8`
- Task: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2`
- Initial candidate commit: `d9293ee84b1c547af77eeab2cde907a3261c9999`
- Bounded repair commit: current clean HEAD with subject `docs(architecture): repair plugin runtime semantics`

## What this candidate delivers

1. One self-contained V2 architecture document.
2. A requirements/acceptance contract.
3. Live repository evidence for the current architecture and hot paths.
4. An old-authority conflict/supersession map.
5. A staged document review/promotion procedure.
6. Exact compatibility inventories and future implementation test gates.
7. Repaired unified Instrument Plugin, Level A/B/C validation, deterministic WASM, migration, namespace, service and composition contracts.

## What it does not deliver

- accepted/current architecture status;
- Rust/Cargo/Node/Tauri/React production code;
- RKP-1 task or activation;
- authority synchronization into old documents;
- Guitar Instrument Plugin/product service/plugin implementation;
- archive or remote push.

## Next actor

The next actor is a **separate read-only architecture auditor**, not a production operator. Use the review focus in `review-candidate.md`, inspect exact HEAD and diff, and report P0/P1/P2. Do not modify the worktree.

If the auditor returns a finding, return it to the planning session for one bounded docs-only repair and targeted rereview. If the auditor passes, stop for explicit user acceptance.

## Post-acceptance sequence

Only after independent PASS and explicit user acceptance:

1. create a separate docs-only authority-sync candidate;
2. update the product/Core/Rust/post-Core authority pointers and historical labels;
3. independently audit and accept that sync;
4. create only the RKP-1 **planning** child;
5. review RKP-1 planning;
6. obtain explicit activation authorization before any Rust production implementation.

## RKP execution law after sync

- one dependency-satisfied stage at a time;
- independent branch/worktree and exact allowlist;
- TypeScript remains default through RKP-7;
- RKP-8 is the one default switch;
- RKP-9 qualifies/cleans later;
- rollback to previous accepted stage;
- RKP-1 uses seven crates; RKP-5 owns Extension Protocol/domain validation; RKP-6 proves two external synthetic Instrument Plugins;
- first post-RKP work is the default Guitar Instrument Plugin/Core Loop, not a new generic registry/plugin framework.

## Protected scope

At candidate commit, only the new task directory and the product parent’s single child reference may differ from the base. Any `src/**`, `test/**`, package/tsconfig/Cargo, Rust-parent, post-Core-parent, product PRD or old technical architecture diff is a stop condition.

## Lifecycle flags

```text
status=planning
task_start_run=false
production_implementation_authorized=false
candidate_authority_status=proposed_not_current
independent_architecture_review=targeted_rereview_pending_after_bounded_plugin_runtime_repair
rkp1_created=false
rkp1_started=false
archive_authorized=false
push_authorized=false
```
