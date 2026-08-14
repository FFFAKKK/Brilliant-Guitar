# CVN-7 Qualification Harness Operator Handoff

## Current bounded preflight diagnostics repair state - 2026-08-14

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification`.
- Branch: `codex/cvn-7-core-vnext-final-qualification`.
- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Reviewed harness implementation anchor: `623f94a4308d2a51014256a2616af1bff53fdb56`.
- First official input `7e3b7e61cc8ee292ee59522df297f43a86210b7c` is invalidated for reuse: direct Windows `execFileSync("npm.cmd", ...)` failed with `npm_cmd_execfile_einval` before worker startup.
- Second official input `e510ed1d88f646c41143d94e3513af3f79f7d943` is also invalidated for reuse: baseline clean-status Git preflight failed with `git_dubious_ownership_preflight` before worker startup.
- Third official input `330d8938997a2c7e7f3835da41588fbef4f05787` is invalidated for reuse: baseline `latency-sample / batch-100 / warmup / sampleIndex=0` failed with `worker-failed-batch-result-mismatch` after worker startup because the CVN-7 worker expected `kernel.command.committed` instead of accepted `core.document.committed`.
- Independent root-cause review classified the third failure as a CVN-7 harness assertion defect, P0/P1/P2=`0/1/0`; Core and CVN-5 remain unchanged. The bounded batch event assertion repair is implemented and awaits targeted independent rereview; only the later clean reviewed repair `HEAD` may become the next equal candidate/harness input.
- Fourth official input `075de27a03a7bf5c3cc0949f85a36f209954435e` is invalidated for reuse: the persistent run from 16:15:17 to 16:16:18 ended on a nonzero `candidate.test.cvn7` preflight, but the old top-level error path discarded the child status, signal, stdout and stderr. The wrapper `254` was only a sentinel. No measurement TEMP run or evidence was created; `worker_started=false`, `partial_evidence=false`, and the A/E trigger remains unresolved because the same Node/npm CLI, cwd and pipe-shaped reproduction later passed `78/78`.
- Task: `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/`.
- Status: `in_progress`; `task_start_run=true`; qualification implementation authorization is true.
- Independent planning review: final `PASS`, P0/P1/P2=`0/0/0`.
- Independent harness implementation review, including the final rejected-stress negative-path repair: final `PASS`, P0/P1/P2=`0/0/0`.
- The failed attempt recorded `worker_started=false`, `partial_evidence=false`; `evidence/` still contains only `README.md`, so no partial result may be reused.
- The second failed attempt also recorded `worker_started=false`, `partial_evidence=false`, `measurement_complete=false` and `evidence_valid=false`; no measurement artifact exists.
- The third failed attempt recorded `worker_started=true`, `partial_evidence=false`, `measurement_complete=false` and `evidence_valid=false`. Its 253 worktree-external diagnostic request/result pairs are non-published and non-reusable; task-local evidence remains README-only.
- The fourth failed attempt recorded `worker_started=false`, `partial_evidence=false`, `measurement_complete=false` and `evidence_valid=false`; there was no qualification request/result TEMP run and task-local evidence remained README-only.
- CVN-7 is not accepted or archived, and the Core VNext parent remains open.

## Frozen implementation boundary

- Stage 0 baseline freeze passed for both `38afdc3` and the candidate line.
- The frozen harness adds exactly the 13 allowlisted CVN-7 TypeScript files and the two approved `package.json` scripts.
- `src/**`, `package-lock.json`, `tsconfig.json`, `openspec/**` and every pre-existing test remain unchanged from `38afdc3`.
- Recorded pre-freeze gates pass: typecheck, build, CVN-7 `69/69`, full `501/501`, four Trellis validations, strict JSON/JSONL, allowlist and `git diff --check`.
- Bounded launcher repair gates pass: typecheck, build, CVN-7 `73/73`, full `505/505`, strict JSON/JSONL, Trellis `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta and `git diff --check`.
- Bounded Git ownership repair gates pass: typecheck, build, CVN-7 `77/77`, full `509/509`, strict JSON/JSONL, Trellis `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta, actual scoped baseline Git status clean and `git diff --check`.
- Worker loading is restricted to the coordinator-registered baseline and candidate build roots; evidence decoding rejects accessors, cycles and unreadable dense arrays without caller execution.
- `623f94a4308d2a51014256a2616af1bff53fdb56` remains the original harness implementation anchor. Relative to that anchor, the reviewed launcher/Git repairs and this diagnostics repair may change `test/core-kernel/qualification/cvn-7-runner.ts` and the boundary test; the reviewed assertion repair additionally changed only `test/core-kernel/qualification/cvn-7-worker.ts` and that same boundary test. Fixture, validator, schema, budgets and scripts remain unchanged.
- The repaired batch worker checks the accepted aggregate envelope exactly: 100 children, committed version 1, undo/redo depth 1/0, one `core.document.committed` for `core.transaction.batch` with source `{kind: "core"}`, cause `submit` and version 1, then one independent dirty-state event. Controlled baseline/candidate probes pass with deep-equal normalized results.

- Batch assertion repair verification: typecheck/build pass; focused boundary `21/21`; CVN-7 `78/78`; full suite `510/510`; strict JSON/JSONL, four Trellis validations and `git diff --check` pass; baseline/candidate `dist/src` manifests are identical at 71 files with tree SHA-256 `65c1e715409c0631355a60e6f06b4bd7f091d2952cc44205eaae27cba79ba861`; protected paths and evidence remain unchanged.
- Preflight diagnostics repair verification: typecheck/build pass; focused boundary `25/25`; CVN-7 `82/82`; full suite `514/514`; direct Node plus `npm-cli.js` reproduction `82/82`; diagnostics use schema version 1 and a 65,536-byte complete-UTF-8 prefix cap per stream; injected `candidate.test.cvn7` failure starts no worker, creates no measurement TEMP run, and adds no evidence; strict JSON/JSONL, Trellis `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, diff check and exact nine-file allowlist pass; baseline/candidate production manifests are equal at 71 files and tree SHA-256 `2fd30bbd33294454f142e160bf88d2755c67e6639e154b282bd566c13d6e7ad2`.
- All runner Git calls now use one worktree-scoped native helper with exact canonical root, one `-c safe.directory=<root>` argv pair and matching `cwd`; candidate and baseline roots remain distinct and no persistent Git configuration is written.

## Immediate operator action after the preflight diagnostics repair commit

Submit the bounded preflight diagnostics repair and its regressions for targeted independent rereview. Do not execute the command below during the repair session. After rereview passes, resolve the new exact clean repair `HEAD` containing the reviewed launcher, scoped-Git, batch assertion and diagnostics repairs, then use that same value for both commit arguments in one full rerun:

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

1. Before invocation, verify the exact current `HEAD` is the independently reviewed clean preflight-diagnostics-repair commit and contains the reviewed launcher, scoped-Git and batch-assertion repair ancestors. Relative to original harness anchor `623f94a4308d2a51014256a2616af1bff53fdb56`, the permitted `test/**` delta is exactly `test/core-kernel/qualification/cvn-7-runner.ts`, `test/core-kernel/qualification/cvn-7-worker.ts` and `test/core-kernel/cvn-7-qualification-boundary.test.ts`. Relative to the established protected baseline, `src/**`, `package*.json`, lock files, `tsconfig.json`, `openspec/**`, qualification evidence results and every other test must have zero additional delta. Pass the new clean repair `HEAD` identically as `candidateCommit` and `harnessCommit`; preflight must observe both canonical worktree roots as clean before temporary output or worker startup.
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
- Invalid official inputs `7e3b7e6`, `e510ed1` and `330d893` are retained only in the failure ledger and are never reused; the third attempt's 253 external diagnostics are likewise non-reusable.

## Completion handoff

After committed evidence, final independent technical PASS and explicit user acceptance: record the accepted evidence, archive CVN-7, perform the separate Core VNext parent final acceptance/archive, then keep the post-Core parent in `planning` until explicit approval creates only the `official-guitar-domain-v1` planning child. That child is not automatically started, and no remote push is implied.
