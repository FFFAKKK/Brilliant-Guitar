# CVN-7 Qualification Harness Operator Handoff

## Current bounded Git ownership repair state — 2026-08-13

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification`.
- Branch: `codex/cvn-7-core-vnext-final-qualification`.
- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Reviewed harness implementation anchor: `623f94a4308d2a51014256a2616af1bff53fdb56`.
- First official input `7e3b7e61cc8ee292ee59522df297f43a86210b7c` is invalidated for reuse: direct Windows `execFileSync("npm.cmd", ...)` failed with `npm_cmd_execfile_einval` before worker startup.
- Second official input `e510ed1d88f646c41143d94e3513af3f79f7d943` is also invalidated for reuse: baseline clean-status Git preflight failed with `git_dubious_ownership_preflight` before worker startup.
- Git ownership compatibility repair: implemented; targeted independent rereview pending. After that review passes, the new exact clean repair `HEAD` becomes the next equal candidate/harness input.
- Task: `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/`.
- Status: `in_progress`; `task_start_run=true`; qualification implementation authorization is true.
- Independent planning review: final `PASS`, P0/P1/P2=`0/0/0`.
- Independent harness implementation review, including the final rejected-stress negative-path repair: final `PASS`, P0/P1/P2=`0/0/0`.
- The failed attempt recorded `worker_started=false`, `partial_evidence=false`; `evidence/` still contains only `README.md`, so no partial result may be reused.
- The second failed attempt also recorded `worker_started=false`, `partial_evidence=false`, `measurement_complete=false` and `evidence_valid=false`; no measurement artifact exists.
- CVN-7 is not accepted or archived, and the Core VNext parent remains open.

## Frozen implementation boundary

- Stage 0 baseline freeze passed for both `38afdc3` and the candidate line.
- The frozen harness adds exactly the 13 allowlisted CVN-7 TypeScript files and the two approved `package.json` scripts.
- `src/**`, `package-lock.json`, `tsconfig.json`, `openspec/**` and every pre-existing test remain unchanged from `38afdc3`.
- Recorded pre-freeze gates pass: typecheck, build, CVN-7 `69/69`, full `501/501`, four Trellis validations, strict JSON/JSONL, allowlist and `git diff --check`.
- Bounded launcher repair gates pass: typecheck, build, CVN-7 `73/73`, full `505/505`, strict JSON/JSONL, Trellis `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta and `git diff --check`.
- Bounded Git ownership repair gates pass: typecheck, build, CVN-7 `77/77`, full `509/509`, strict JSON/JSONL, Trellis `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta, actual scoped baseline Git status clean and `git diff --check`.
- Worker loading is restricted to the coordinator-registered baseline and candidate build roots; evidence decoding rejects accessors, cycles and unreadable dense arrays without caller execution.
- `623f94a4308d2a51014256a2616af1bff53fdb56` remains the original harness implementation anchor. Relative to that anchor, the reviewed launcher repair is permitted to change exactly `test/core-kernel/qualification/cvn-7-runner.ts` and `test/core-kernel/cvn-7-qualification-boundary.test.ts`; fixture, validator, worker, schema, budgets and scripts remain unchanged.
- All runner Git calls now use one worktree-scoped native helper with exact canonical root, one `-c safe.directory=<root>` argv pair and matching `cwd`; candidate and baseline roots remain distinct and no persistent Git configuration is written.

## Immediate operator action after this repair commit

Submit the bounded Git ownership repair and its regressions for targeted independent rereview. Do not execute the command below during the repair session. After rereview passes, resolve the new exact clean repair `HEAD` containing both earlier launcher repair `5a21284` and this scoped-Git repair, then use that same value for both commit arguments in one full rerun:

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

1. Before invocation, verify the exact current `HEAD` is the independently reviewed clean Git-ownership-repair commit and contains launcher repair ancestor `5a21284c3b27d36073a3bfc929130e063679b569`. Relative to original harness anchor `623f94a4308d2a51014256a2616af1bff53fdb56`, the only permitted `test/**` delta remains the exact pair `test/core-kernel/qualification/cvn-7-runner.ts` and `test/core-kernel/cvn-7-qualification-boundary.test.ts`. Relative to the established protected baseline, `src/**`, `package*.json`, lock files, `tsconfig.json`, `openspec/**`, qualification evidence results and every other test must have zero additional delta. Pass the new clean repair `HEAD` identically as `candidateCommit` and `harnessCommit`; preflight must observe both canonical worktree roots as clean before temporary output or worker startup.
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
- Invalid official inputs `7e3b7e6` and `e510ed1` are retained only in the failure ledger and are never reused.

## Completion handoff

After committed evidence, final independent technical PASS and explicit user acceptance: record the accepted evidence, archive CVN-7, perform the separate Core VNext parent final acceptance/archive, then keep the post-Core parent in `planning` until explicit approval creates only the `official-guitar-domain-v1` planning child. That child is not automatically started, and no remote push is implied.
