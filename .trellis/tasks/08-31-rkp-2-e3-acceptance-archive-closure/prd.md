# RKP-2 E3 Acceptance and Archive Closure

## Goal

Accept and natively archive the independently reviewed E3 acceptance-state projection without weakening Workspace Law, rerunning E3 stress, or advancing RKP-2 Stage 6. The closeout must terminate the lifecycle-recursion problem: the reviewed law must accept both the target archive and this closure task's later archive, so a successful closeout does not create another technical repair.

## Background

- Planning base and reviewed candidate: `f27daf7b514731adaabbe8f7814d2b57e12a7df7`.
- Acceptance-projection technical commit: `4abfef9b3f7620d6428382af287cccd662aa7bf7`.
- Dedicated review task/turn: `01a01e48-1934-77b0-821e-a8026cd9e5f7` / `01a0562d-c544-7371-861f-0ead4d04cea2`.
- Verdict: PASS, P0/P1/P2=`0/0/0`.
- Focused baseline: `11 tests / 8 pass / 3 exact historical fail`.
- Full baseline: `611 discovered / 606 pass / 3 exact historical fail / 2 skipped`.
- Current Workspace Law intentionally rejects `acceptance_authorized=true`, `archive_authorized=true`, and disappearance of the active acceptance task path. Direct native archive would therefore create a new unreviewed law failure.

The canonical source review record is:

```json
{"schemaVersion":1,"reviewTaskId":"01a01e48-1934-77b0-821e-a8026cd9e5f7","reviewTurnId":"01a0562d-c544-7371-861f-0ead4d04cea2","candidateCommit":"f27daf7b514731adaabbe8f7814d2b57e12a7df7","technicalCommit":"4abfef9b3f7620d6428382af287cccd662aa7bf7","verdict":"PASS_READY_FOR_OWNER_ACCEPTANCE_AND_ARCHIVE_CLOSURE","P0":0,"P1":0,"P2":0}
```

It is exactly 334 UTF-8 bytes with SHA-256 `8559f7aed98ddc45154f90dd459688530ba5e24efedeb573389e06ca7d099436`.

## Requirements

### E3AAC-R001 — Preserve every audited endpoint

`0c561d14193374436361eec09b361cab0170278a`, `4abfef9b3f7620d6428382af287cccd662aa7bf7`, and `f27daf7b514731adaabbe8f7814d2b57e12a7df7` remain immutable. No amend, rebase, force update, rewrite, or evidence regeneration may replace them.

### E3AAC-R002 — Bind the exact acceptance-projection review

The 334-byte record above is the only structured authority for accepting `f27daf7`. While this closure task is active it owns the record in its `task.json`; after native archive the same unchanged record moves with the task. The E3 law and Stage 6 parents store only owner-path and digest references.

### E3AAC-R003 — Archive-aware, non-recursive state machine

Workspace Law must distinguish and accept exactly:

1. implementation transition: target acceptance task and closure task both active, all later gates false;
2. target-archived candidate: target exists only under `.trellis/tasks/archive/2026-08/`, closure task remains active and review-pending;
3. closeout-archived terminal: both tasks exist only under the archive root, the immediate parent has no live planning/implementation child, and the next gate is an owner decision for the E3 law parent.

The law consumes the source audit record from exactly one active-or-archived closure-task location. It must not require another technical commit merely because the closure task itself moves to the archive.

### E3AAC-R004 — Exact archive semantics

- Native `python ./.trellis/scripts/task.py archive <task>` is the sole move/status owner.
- Each target task contains exactly 11 artifacts before and after its move.
- Active and archived copies may never coexist.
- An archived task has `status=completed`, a non-null `completedAt`, retained parent identity, and the exact reviewed candidate record.
- Manual move, copy/delete, path rewriting, and `--no-commit` archive are excluded.

### E3AAC-R005 — Fixed technical and lifecycle ownership

Future technical ownership is exactly:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

The implementation candidate relative to `f27daf7` has an exact no-rename 40-path projection:

- 11 active closure planning/lifecycle artifacts;
- one Workspace Law test;
- three E3 law parent lifecycle files;
- three Stage 6 parent lifecycle files;
- 11 deleted active acceptance-task artifacts;
- 11 added archived acceptance-task artifacts.

After the closure task is archived, the same cardinality remains: its 11 active paths are replaced by its 11 archive paths. RKP-2, the Rust parent, `src/**`, `crates/**`, Cargo, package, tsconfig, fixtures, worker/process, evidence, and active specs remain byte-identical to `f27daf7`.

### E3AAC-R006 — Preserve product and Stage 6 truth

- E3 stress evidence is reused without execution or mutation.
- S6.1 remains retained complete; S6.2 and S6.3 remain false.
- TypeScript remains default.
- Integration, qualification, runtime cutover, push, and RKP-3 remain false.
- The three historical Workspace Law failures keep their exact names; additional failures are zero at the implementation candidate.

### E3AAC-R007 — Review and owner gates remain distinct

Planning review, implementation authorization, implementation review, owner acceptance, native archive, parent acceptance, Stage 6 continuation, qualification, cutover, push, and RKP-3 are distinct gates. This task may accept/archive only the acceptance-state projection and, after its own review, itself. It does not accept/archive the E3 law parent or Stage 6 parent.

## Acceptance Criteria

- [ ] Planning candidate is docs-only, `status=planning`, `task_start_run=false`, and `production_implementation_authorized=false`.
- [ ] Dedicated independent planning review passes the exact planning commit with P0/P1/P2=`0/0/0`.
- [ ] A later explicit implementation authorization precedes `task.py start`.
- [ ] The source review record is exactly 334 bytes and SHA-256 `8559f7ae...9436`, with one structured owner.
- [ ] Workspace Law supports transition, target-archived candidate, and closeout-archived terminal states without a third technical change.
- [ ] Both archives use native `task.py archive`; each task has exactly 11 artifacts and no active/archive duplicate.
- [ ] Candidate and post-closeout no-rename projections are each exact 40 paths.
- [ ] Focused Node 20 and supported Node remain `11/8/3` with zero additional failure.
- [ ] Dynamic full classification remains `611/606/3/2` unless a separately reviewed manifest change is proven; E3 stress remains skipped.
- [ ] Relevant Trellis, JSON/JSONL, parent-child, Markdown fence, `git diff --check`, typecheck, and build gates pass.
- [ ] Production/protected delta from `f27daf7` is zero.
- [ ] Dedicated implementation audit passes the exact target-archived candidate before the closure task records PASS or archives itself.
- [ ] Final next gate is only an explicit owner decision about E3 law-parent acceptance; S6.2/S6.3 and all later gates remain false.

## Out of Scope

- Editing Rust, production TypeScript, FFI, DTOs, fixtures, workers, process wrappers, build configuration, or active specifications.
- Rerunning or changing E3 stress, its fixture, timeout, protocol, counters, or evidence.
- Repairing the three historical Workspace Law failures.
- Accepting or archiving the E3 law parent, Stage 6 parent, RKP-2, or Rust remediation parent.
- Integration, S6.2/S6.3, qualification, Rust-default cutover, push, or RKP-3.

## Planning Status

Repository evidence closes the requirements and scope decisions. Implementation remains unauthorized pending dedicated independent planning review and a later explicit user authorization.
