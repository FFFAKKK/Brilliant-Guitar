# CVN-7 Qualification Harness Operator Handoff

## Current frozen harness state — 2026-08-13

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification`.
- Branch: `codex/cvn-7-core-vnext-final-qualification`.
- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Reviewed harness implementation anchor: `623f94a4308d2a51014256a2616af1bff53fdb56`.
- Official candidate/harness input: the exact clean branch `HEAD` after this docs-only status sync; resolve it immediately before the run and pass the same 40-character value to both arguments.
- Task: `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/`.
- Status: `in_progress`; `task_start_run=true`; qualification implementation authorization is true.
- Independent planning review: final `PASS`, P0/P1/P2=`0/0/0`.
- Independent harness implementation review, including the final rejected-stress negative-path repair: final `PASS`, P0/P1/P2=`0/0/0`.
- Worktree is clean after `test(cvn-7): freeze qualification harness`.
- Official qualification measurement has not run; `evidence/` contains only `README.md`.
- CVN-7 is not accepted or archived, and the Core VNext parent remains open.

## Frozen implementation boundary

- Stage 0 baseline freeze passed for both `38afdc3` and the candidate line.
- The frozen harness adds exactly the 13 allowlisted CVN-7 TypeScript files and the two approved `package.json` scripts.
- `src/**`, `package-lock.json`, `tsconfig.json`, `openspec/**` and every pre-existing test remain unchanged from `38afdc3`.
- Recorded pre-freeze gates pass: typecheck, build, CVN-7 `69/69`, full `501/501`, four Trellis validations, strict JSON/JSONL, allowlist and `git diff --check`.
- Worker loading is restricted to the coordinator-registered baseline and candidate build roots; evidence decoding rejects accessors, cycles and unreadable dense arrays without caller execution.
- Harness, fixture, runner, validator and script content is immutable from `623f94a`. The later status-sync commit changes documentation only; its exact clean `HEAD` becomes the runner-required candidate/harness input. Any post-sync content change requires a new clean HEAD and renewed boundary verification; any harness or fixture change returns to implementation review.

## Immediate operator action

Resolve the exact clean measurement input and run the single official blocking qualification invocation from the candidate worktree:

```powershell
$measurementCommit = (git rev-parse HEAD).Trim()

npm.cmd run qualify:cvn7 -- --mode all `
  --baseline-root E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-accepted-baseline `
  --candidate-root E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification `
  --evidence-dir .trellis\tasks\08-11-cvn-7-core-vnext-final-qualification\evidence `
  --qualification-base 38afdc3fd508dc67f7aa446fd323837a5d550b70 `
  --candidate-commit $measurementCommit `
  --harness-commit $measurementCommit
```

This is the only official worker invocation. Development-only partial modes are not accepted evidence and are not combined with the official artifact set.

## Required result handling

1. Before invocation, verify the exact current HEAD is a docs-only descendant of `623f94a` with zero `src/**`, `test/**`, `package*.json`, `tsconfig.json`, `openspec/**` and `evidence/**` delta from that anchor. Preflight must then observe clean baseline and candidate worktrees before temporary output or worker startup.
2. The runner executes functional, portable, reference and stress sub-gates within the same `--mode all` run.
3. Intermediate output stays under the runner-owned OS temporary directory.
4. Only a complete validator-accepted artifact set is atomically published to task-local `evidence/`.
5. Immediately create one path-limited measurement commit containing the published evidence set; do not run another worker after publication.
6. Before independent technical review, the result remains `BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW` with `qualified: false`, or a complete named non-qualified result.
7. Synchronize `SPEC-010-product-quality.md` and current authority projections only from committed evidence.
8. Give the frozen commits, evidence, ordered benchmark pairs, build/environment manifests, 44-row trace, full test transcript and authority diff to the independent technical reviewer.
9. `QUALIFIED` is produced only after independent technical review records P0/P1/P2=`0/0/0` and the deterministic finalizer validates the committed review and evidence hashes.

## Fixed stop conditions

Return to the owning stage when any of these appears:

- a new public command, type, export, failure, capability, effect or persisted field;
- any `src/**` change or edit to a pre-existing accepted test;
- a dependency, package-lock or `tsconfig.json` change;
- a fixture count, seed, generator version, operation, sample count, budget, evidence schema or exact-environment change;
- dirty baseline/candidate input, build-manifest mismatch, worker timeout, invalid evidence shape or partial publication;
- a proposed second owner for `SPEC-010-product-quality.md`;
- post-Core child activation before CVN-7 and the Core VNext parent are accepted and archived.

## Historical review closure

- Planning review repair commit: `c427d2f89a291618325dab273e926db635cca9a6`.
- Qualification activation commit: `616130cc6908f5c8741d12761cdb0ccebff63589`.
- Initial harness findings and all targeted repairs are retained in `review-candidate.md` and `task.json`.
- The final negative-path targeted rereview supersedes the earlier interim implementation verdicts.

## Completion handoff

After committed evidence, final independent technical PASS and explicit user acceptance: record the accepted evidence, archive CVN-7, perform the separate Core VNext parent final acceptance/archive, then keep the post-Core parent in `planning` until explicit approval creates only the `official-guitar-domain-v1` planning child. That child is not automatically started, and no remote push is implied.
