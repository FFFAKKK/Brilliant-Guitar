# RKP-2 Stage 6 Acceptance, Archive and Integration Closeout — PRD

## Goal

Close the already audited RKP-2 Stage 6 repair authority without repeating technical work: accept and archive the consumed semantic/canonical child, accept and archive the Stage 6 repair parent, integrate that exact accepted authority into the original RKP-2 branch, archive this closeout task, and leave RKP-2 at a clean explicit gate immediately before S6.2.

## Confirmed input state

- Planning base is `65debd52d379004c966cefe59f54d72ac1136eb4`.
- The Stage 6 technical candidate is independently reviewed PASS at `0c561d14193374436361eec09b361cab0170278a`, P0/P1/P2=`0/0/0`.
- The E3 Workspace Law Q4 closure is accepted and archived under `.trellis/tasks/archive/2026-09/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure/`.
- Stage 6 remains `in_progress`; its only active child is the already-consumed semantic/canonical amendment.
- RKP-2 remains `in_progress`, paused before S6.2; S6.2/S6.3 are false and TypeScript remains default.
- Original RKP-2 head `4a302bc9f9981940336fc97941b08e09bd0d1f67` is an ancestor of the planning base.

## Requirements

### CLOSE-R001 — Single accepted technical authority

Preserve accepted Stage 6 technical bytes and evidence. Do not rerun E3 stress, recreate the seam/fixture, modify production code, or reinterpret the independent PASS.

### CLOSE-R002 — Consumed child termination

`.trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment/` must be owner-accepted and natively archived before Stage 6. Its accepted E1R2/E2 authority becomes historical and its stale E3 gate becomes `completed_historical_no_live_gate`.

### CLOSE-R003 — Stage 6 acceptance and native archive

After the consumed child has exactly one archive authority, Stage 6 must record the audited candidate, P0/P1/P2=`0/0/0`, owner acceptance and archive authorization. Native Trellis archive then moves its exact thirteen-artifact inventory to the current `2026-09` archive root.

### CLOSE-R004 — Archive-aware authority

For the consumed child, Stage 6 and this closeout, active and archived roots are mutually exclusive. Current self references and JSONL paths point to archive successors after native archive; historical paths remain unchanged. Wildcards and directory exemptions are forbidden.

### CLOSE-R005 — Workspace-law final state

`test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` must add a bounded closeout state machine proving exact manifests and phase path sets, accepted ancestry, zero dual authority, no active child before Stage 6 archive, RKP-2 paused before S6.2, TypeScript default, and no qualification/cutover/push/RKP-3/S6.2/S6.3 authorization.

### CLOSE-R006 — Explicit fast-forward integration

Only after an independent Stage 6 archive-candidate PASS may the clean original RKP-2 worktree run `git merge --ff-only <accepted-closeout-candidate>`. The closeout source freezes at that candidate. The first projection commit belongs only to the original RKP-2 worktree and records sole authority handoff.

### CLOSE-R007 — Closeout archive and terminal projection

After independent integration PASS, natively archive this closeout and create one bounded terminal projection. Terminal state is:

- consumed child: accepted/archived/historical;
- Stage 6: accepted/archived/integrated/historical;
- closeout: completed/archived;
- RKP-2: `in_progress`, no current child, S6.2/S6.3 false, next gate `explicit_user_authorization_for_rkp2_s6_2_resume`;
- Rust parent: RKP-2 remains sole active implementation child;
- default runtime: TypeScript.

### CLOSE-R008 — Separate evidence and authority gates

Planning PASS, archive-candidate implementation PASS, integration PASS and terminal-projection PASS are separate. A technical PASS never silently performs owner acceptance, archive, integration or S6.2 activation.

### CLOSE-R009 — Protected boundaries

The only technical file allowed to change is `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. Lifecycle/docs changes are limited to the declared task trees, archive successors and parent coordination files. `src/**`, Rust crates, package/Cargo/tsconfig, active specs, fixtures, worker/process and qualification files remain byte-identical to the planning base.

## Acceptance criteria

1. Semantic/canonical child and Stage 6 exist only under exact `2026-09` archive roots with exact manifests.
2. Stage 6 pins accepted candidate and audit tuple, P0/P1/P2=`0/0/0`.
3. Original RKP-2 contains the audited closeout candidate by clean fast-forward ancestry and owns the post-integration projection.
4. This closeout is natively archived with exact manifest and archive-aware self references.
5. RKP-2 has no active child, S6.2/S6.3 false, TypeScript default and exact later S6.2 gate.
6. Trellis validation passes for three archived tasks, RKP-2 and Rust parent.
7. JSON/JSONL/path uniqueness, parent-child exact-once and Markdown fences pass.
8. `git diff --check`, typecheck, build, focused current/Node20 Workspace Law and full dynamic suite pass with only three frozen historical fail-closed tests.
9. Planning-base delta outside the literal allowlist is empty.
10. Final worktrees are clean/staged-empty; no push, qualification, cutover, RKP-3, S6.2 or S6.3 occurs.

## Out of scope

RKP-2 S6.2/S6.3 execution, stress/qualification rerun, Rust cutover, RKP-2 parent archive, RKP-3, product/schema/ABI/FFI/provider/plugin/fixture/worker/performance changes and remote push.
