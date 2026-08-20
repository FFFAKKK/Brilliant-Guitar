# Architecture Reset V2 — Operator and Auditor Handoff

## Current object

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\brilliant-guitar-architecture-reset-v2`
- Branch: `codex/brilliant-guitar-architecture-reset-v2`
- Base: `5e1599598b1468784ae9b7410383ef63b33201b8`
- Task: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2`
- Initial candidate commit: `d9293ee84b1c547af77eeab2cde907a3261c9999`
- First bounded repair: `812f154e18bafd8cc2cef858be4cfa46603563ed`, `docs(architecture): repair plugin runtime semantics`
- Current audited content: `e81c739b1452a41a412966ee1f40367476011916`
- Audit-record commit: `ea574ec4495ac2c82445d1275ad6648035231fc6`
- Independent audit task: `01a01da3-548c-7513-a53c-0e10d1aa7350`, result `PASS`, P0/P1/P2=`0/0/0`, checklist `34/34`, full `531/531`
- Accepted by user: `2026-08-20`
- Authority-sync task: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`

## What this candidate delivers

1. One self-contained V2 architecture document.
2. A requirements/acceptance contract.
3. Live repository evidence for the current architecture and hot paths.
4. An old-authority conflict/supersession map.
5. A staged document review/promotion procedure.
6. Exact compatibility inventories and future implementation test gates.
7. Repaired unified Instrument Plugin, Level A/B/C validation, deterministic WASM, migration, namespace, service and composition contracts.
8. Independent known inventory, global read-only KernelSession, Catalog-only request policy and bounded Rust-owned WASM preparation.
9. Unique RKP-5/6 implementation owners with RKP-7 proof, RKP-8 switch and RKP-9 qualification-only boundaries.

## What it does not deliver

- further architecture content changes;
- Rust/Cargo/Node/Tauri/React production code;
- RKP-1 task or activation;
- Guitar Instrument Plugin/product service/plugin implementation;
- archive or remote push.

## Next actor

Dedicated cross-thread audit task `01a01da3-548c-7513-a53c-0e10d1aa7350` has completed a read-only review of exact content commit `e81c739b1452a41a412966ee1f40367476011916` with `PASS`, P0/P1/P2=`0/0/0`. The next actor is the project owner for explicit acceptance. A production operator is not activated by the technical PASS.

After explicit acceptance, create a separate docs-only authority-sync task/commit. RKP-1 planning follows only after that sync is independently checked; production implementation remains a later, separately authorized operator task.

## Post-acceptance sequence

After the independent PASS and explicit user acceptance, the next bounded action is the separate authority-sync task:

1. synchronize the product/Core/Rust/post-Core authority pointers and historical labels in `08-20...authority-sync`;
2. independently audit and accept that sync;
3. create only the RKP-1 **planning** child after that audit/acceptance;
4. review RKP-1 planning;
5. obtain explicit activation authorization before any Rust production implementation.

## RKP execution law after sync

- one dependency-satisfied stage at a time;
- independent branch/worktree and exact allowlist;
- TypeScript remains default through RKP-7;
- RKP-8 is the one default switch;
- RKP-9 qualifies already implemented Core/Session/plugin fixtures and cleans only after PASS;
- rollback to previous accepted stage;
- RKP-1 uses seven crates; RKP-5 implements Extension Protocol/request codecs and WASM preparation/executor; RKP-6 implements known inventory, global read-only Session, gateway/namespace/stale revision/migration and two external synthetic Instrument Plugins; RKP-7 only proves them;
- Official BGP Persistence, Layout/Renderer and the real Guitar Plugin are implemented and qualified by post-RKP product children, not RKP-9;
- first post-RKP work is the default Guitar Instrument Plugin/Core Loop, not a new generic registry/plugin framework.

## Protected scope

The original V2 candidate was limited to its task directory and product-parent child reference. After user acceptance, the separate `08-20...authority-sync` task owns the explicit docs-only allowlist for product/Core/Rust/post-Core pointers and historical banners. Any `src/**`, `test/**`, package/tsconfig/Cargo, `crates/**`, archived RKP-0/CVN path or RKP-1 creation remains a stop condition.

## Lifecycle flags

```text
status=planning
task_start_run=false
production_implementation_authorized=false
candidate_authority_status=accepted_current_authority
user_acceptance=accepted_2026-08-20
authority_sync_task=08-20-brilliant-guitar-architecture-reset-v2-authority-sync
authority_sync_status=in_progress_review_pending
independent_architecture_review=passed_on_e81c739b1452a41a412966ee1f40367476011916
independent_architecture_review_thread=01a01da3-548c-7513-a53c-0e10d1aa7350
rkp1_created=false
rkp1_started=false
archive_authorized=false
push_authorized=false
```
