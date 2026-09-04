# RKP-2 Post-Archive Path Compatibility

## Goal

Restore the already accepted RKP-2 workspace law and Trellis context validation after native archive moved the RKP-2 task from its active root to its September archive root. Preserve historical Git reads at their original active paths while resolving current lifecycle reads from exactly one active/archive location.

## Confirmed baseline

- RKP-2 final candidate `33af840e11a4235c36c8f936c3a1b20da76ce5d0` passed direct review `P0/P1/P2=0/0/0`.
- Owner acceptance is `99ceea9477b171d83618ce2ce312f29b978cf7b1`.
- S6.3 and RKP-2 native archives are `57113a16487d511fa4fe832a863d11b9bfbcda01` and `38c8c2100590e0629979abcb0c3fa27b6de7dc94`.
- The focused compiled workspace-contract suite currently reports `11 total / 4 pass / 7 fail`; every failure is an active-path or archive-delta assumption, while all four kernel/runtime assertions pass.
- Archived RKP-2 `task.py validate` reports exactly 12 missing references, all of which target the former active root of that same task.

## Requirements

### PA-R001 — Separate historical and current paths

Historical `git show`/diff assertions must retain the active RKP-2 paths that existed at the referenced commit. Current filesystem reads must resolve from exactly one of the active or September archive roots and require the exact 13-file task manifest.

### PA-R002 — Reject ambiguous or malformed authority

The current-location helper must reject both roots present, neither root present, and any missing or extra file. It must not recreate the active task directory or search multiple archive months heuristically.

### PA-R003 — Close accepted-delta history

Workspace allowlist assertions must recognize the exact accepted archive and this task's activation boundary, then permit only the literal repair technical/evidence paths after activation. Historical RKP-2 allowlists remain unchanged.

### PA-R004 — Resolve archived same-task JSONL references narrowly

`task.py validate` may map a missing `.trellis/tasks/<task>/<suffix>` reference only when it is validating `.trellis/tasks/archive/<month>/<task>/*.jsonl`; the mapped target is `<that exact archived task>/<suffix>`. Existing paths win. References to another task, another archive, or an absent same-task suffix still fail.

### PA-R005 — Record the recurring root cause

The repair must record the five-dimension root cause and update the Rust-transition specification so future task archive consumers distinguish historical paths from current lifecycle paths. No in-repository generated template counterpart exists; that fact must be recorded.

### PA-R006 — Preserve product and authorization boundaries

There must be zero delta under `src/**`, `crates/**`, Cargo/package/tsconfig files, native artifacts, public exports, and qualification evidence. TypeScript remains default. E3, qualification, cutover, RKP-3 and push remain unauthorized.

## Acceptance criteria

- [ ] `PA-AC001`: focused RKP-2 workspace-contract suite passes `11/11` with the four kernel/runtime assertions preserved.
- [ ] `PA-AC002`: archived RKP-2 `task.py validate` passes `25/25` implement and `20/20` check entries without editing the archived JSONL files.
- [ ] `PA-AC003`: active RKP-2 and S6.3 roots remain absent; exact archive roots and manifests remain present.
- [ ] `PA-AC004`: current archive resolution rejects both/neither/extra-file hostile states.
- [ ] `PA-AC005`: Python compile check, TypeScript typecheck/build, `git diff --check`, task validation and protected-path checks pass.
- [ ] `PA-AC006`: full Node discovery runs once after the focused suite is green and remains at `611 total / 609 pass / 2 expected skip / 0 fail` unless an independently explained infrastructure-only count change is proven.
- [ ] `PA-AC007`: no RKP-2 E3 command is run and no Rust/native/full qualification gate is rerun for this test-and-governance-only repair.

## Out of scope

- Production Rust or TypeScript implementation;
- RKP-2 requalification or default-runtime cutover;
- RKP-3 planning or implementation;
- edits to accepted archived JSONL evidence;
- push, release, or external integration.
