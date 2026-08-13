# CVN-7 Review Record and Frozen Harness Handoff

## Current status — 2026-08-13

`BOUNDED GIT OWNERSHIP REPAIR IMPLEMENTED / TARGETED INDEPENDENT REREVIEW PENDING`

- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Reviewed harness implementation anchor before the launcher finding: `623f94a4308d2a51014256a2616af1bff53fdb56` (`test(cvn-7): freeze qualification harness`). The bounded launcher repair is a new implementation delta and has no independent verdict yet.
- Task status: `in_progress`; task start and qualification implementation authorization are true.
- Independent planning review final verdict: `PASS`, P0/P1/P2=`0/0/0`.
- Independent implementation review final verdict after all bounded repairs and the rejected-stress negative-path probe: `PASS`, P0/P1/P2=`0/0/0`.
- Recorded pre-freeze verification: typecheck/build pass, CVN-7 `69/69`, full `501/501`, Trellis/JSON/JSONL/allowlist/diff gates pass, production source delta zero.
- First official input `7e3b7e61cc8ee292ee59522df297f43a86210b7c` ended `EVIDENCE_INVALID` at direct Windows `execFileSync("npm.cmd", ...)`: reason `npm_cmd_execfile_einval`, `worker_started=false`, `partial_evidence=false`. Task-local `evidence/` still contains only `README.md`; nothing from that attempt is reusable.
- Second official input `e510ed1d88f646c41143d94e3513af3f79f7d943` ended at baseline clean-status Git preflight: reason `git_dubious_ownership_preflight`, `worker_started=false`, `partial_evidence=false`, `measurement_complete=false`, `evidence_valid=false`. Evidence remains README-only and that input is not reusable.
- CVN-7 remains unaccepted and unarchived. The Core VNext parent and all post-Core children remain gated.

## Implementation review closure

The current repair captures and strictly validates `process.env.npm_execpath`, invokes npm as `process.execPath` plus the npm CLI JavaScript argv, preserves the native Git launcher, and rejects invalid npm identity before preflight side effects. CVN-7 boundary regressions cover Windows selection, path/argument spaces, missing/relative/nonexistent/non-file/wrong-identity paths, npm order/output/failure propagation, Git preservation and zero evidence/worker activity on validation failure. Qualification schema, fixture matrix, budgets, repeats and seeds are unchanged.

Repair-candidate verification is green: typecheck, build, CVN-7 `73/73`, full `505/505`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product parent `0/0`, post-Core `15/16`, exact 10-file changed allowlist, protected paths/evidence zero delta and `git diff --check`. No `--mode all` worker was started.

The next review is a targeted independent launcher rereview of this bounded delta and its direct regressions. It is not the final evidence review. No official `--mode all`, acceptance, archive or push occurs before that verdict.

The current bounded repair resolves each candidate/baseline root to an existing canonical directory before side effects and routes every runner Git call through native `git` with exact argv `-c safe.directory=<that root>` and matching `cwd`. It adds no persistent configuration, wildcard scope, shell, command concatenation or second launcher. Targeted rereview is limited to this helper, its four preflight call sites, actual frozen-baseline probe, invalid-root/evidence-zero regressions, retained Node-to-npm behavior and the updated two-attempt ledger.

Repair-candidate verification is green: typecheck, build, CVN-7 `77/77`, full `509/509`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product parent `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta and `git diff --check`. The scoped native Git probe returned clean for the frozen baseline under the current runner identity. No official measurement was invoked during repair.

The review sequence is retained here so later technical reviewers can distinguish superseded interim verdicts from the frozen result:

1. Initial independent implementation review: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/5/2`.
2. First targeted rereview: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/2/1`.
3. Targeted rereview after the second repair: `PASS`, P0/P1/P2=`0/0/0`.
4. Additional all-rejected stress negative-path probe: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/1/0`; this explicitly superseded the preceding interim PASS.
5. Final negative-path targeted rereview: `PASS`, P0/P1/P2=`0/0/0`.

The final repair encodes absent stress assessment as explicit `null`, accepts that exact shape in the decoder, and regresses the 10,000-rejected JSON round trip and functional routing. Commit `623f94a` contains the reviewed harness implementation. The later status-sync commit changes documentation only; its clean HEAD becomes the exact official candidate/harness input because the runner requires both values to equal candidate worktree HEAD.

## Next review target

The next independent review is the final Core technical review after the single official `--mode all` run, atomic evidence publication, path-limited measurement commit and evidence-based authority sync. Its package must include the two frozen input commits, all published evidence, ordered benchmark pairs, build/environment manifests, 44-row trace, full regression transcript, owner-routing table and quality-spec diff. Until that review records P0/P1/P2=`0/0/0`, summaries remain `qualified: false`.

The planning-era record below is historical authority for the closed planning phase; its `planning`, authorization-pending and uncommitted-candidate wording describes the state at that earlier gate rather than the current lifecycle.

## Historical planning status

`INDEPENDENT PLANNING REVIEW PASSED / LATER ACTIVATED AT 616130c`

At the time of the initial planning review, the candidate was docs-only, task status was `planning`, task start and production implementation authorization were false, and qualification measurements had not run. That historical state was later superseded by activation commit `616130cc6908f5c8741d12761cdb0ccebff63589` and reviewed harness implementation commit `623f94a4308d2a51014256a2616af1bff53fdb56`.

## Bounded repair under rereview

1. `CVN-FC-020/021/030/031` now have the single parent-matrix owner CVN-3; `140..143` consumer failures must be reclassified to one underlying FC before production routing.
2. All 44 rows now fix an exact repository-relative decisive path and exact title, while a separate `cvn-7-contract-trace.test.ts` owns the exact unique `CVN7-Q-*` assertion title.
3. Official evidence now comes from one clean frozen `--mode all` invocation, external temporary output and one atomic task-local publish followed by one measurement commit.
4. Reference and blocking-evidence intermediate states remain `qualified: false`; `QUALIFIED` is reserved until stress and independent technical review are recorded.
5. Exact process-liveness timeouts yield `EVIDENCE_INVALID` and do not become performance budgets.
6. Product coordination again requires both CVN-7/Core-parent archive and explicit user approval.
7. Fixture provenance is artifact-specific and benchmark evidence stores 20 ordered pair records.
8. The active Core spec now identifies the accepted CVN-4 repair, CVN-5 archive, 28 commands and 432/432 baseline without claiming CVN-7 acceptance.

Targeted rereview is limited to these eight initial findings and their direct documentation consistency. No production-code review or qualification measurement is requested.

## Targeted rereview round 1 and residual repair

Round 1 returned `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/1`. The only residuals were obsolete temporary-output/partial-rerun wording and a legacy reviewer handoff shape that lost pair invocation order. The second bounded repair now requires external `%TEMP%` output plus a full clean `--mode all` rerun with no partial reuse, and requests exactly 20 ordered pairs plus recomputed aggregates. Final targeted rereview remains read-only and limited to these two residuals.

## Final targeted planning rereview — 2026-08-13

- Verdict: `PASS`.
- P0/P1/P2: `0/0/0`.
- The external temporary-output/full clean rerun protocol and ordered-pair reviewer package are aligned; all eight initial findings are closed.
- Reviewer reproduced CVN-7 Trellis `31/27`, strict JSON/JSONL, residual scan, diff check and protected delta `0` while leaving all files, staging and lifecycle execution untouched.
- This PASS closes planning review only. Task start, qualification implementation, measurements, staging, commit, acceptance and archive remain separate actions.

## Reviewed planning repair commit

- Commit: `c427d2f89a291618325dab273e926db635cca9a6`.
- Message: `docs(cvn-7): close independent planning review findings`.
- Scope: the 14 independently reviewed planning, authority-projection and lifecycle-record paths only; production/test/package/lock/tsconfig delta remains zero.
- Next gate: separate user authorization for qualification implementation. Task start, production authorization and measurements remain false.

## Reviewer question

Does this plan fully close the final Core VNext qualification method without adding product behavior, reopening accepted child contracts or leaving fixture/benchmark/evidence choices to the future operator?

## Required verdict

- `PASS` or `RETURN FOR BOUNDED PLANNING REPAIR`;
- P0/P1/P2 counts;
- each finding includes exact file/line, authority, observable impact and narrow repair;
- review remains read-only.

## Directed review points

1. Base `38afdc3` includes accepted/archived CVN-0 through CVN-6 and CVN-5 archive `198c71a`.
2. Primary ownership is exactly `130..134/140..143`; `135..139` remains unallocated.
3. All 44 actual FC rows have one stable qualification case ID and one primary owner.
4. Qualification default is `src/**` zero diff; behavior repair routing is unambiguous.
5. Representative arithmetic yields exactly 25,600 Events, 12,800 Notes, two contributions and 2,000 retained entries.
6. Stress arithmetic yields exactly 102,400 Events, 51,200 Notes and 10,000 changed/replayed envelopes.
7. All eight timed operations have exact setup, timed region and postcondition.
8. Baseline/candidate worktrees/build outputs are isolated; build manifests and package locks are comparable.
9. Five warm-ups, twenty fresh-state samples, alternating A/B order, median and sample-19 P95 are exact.
10. Environment mismatch, evidence invalidity and qualification failure states cannot become `QUALIFIED`.
11. RSS/heap collection claims match the recorded method; tracked evidence excludes raw path/stack/env payloads.
12. Source repair invalidates evidence and returns to the owning child rather than expanding CVN-7.
13. `SPEC-010-product-quality.md` has one owner and retains the Core/product qualification boundary.
14. Existing tests remain read-only; heavy benchmarks are not part of ordinary `npm test`.
15. CVN-7 closure only permits creation of Official Guitar Domain planning after both CVN-7 and the Core parent archive plus explicit user approval.

## Planning validation target

- Trellis child/parent/product/post-Core pass;
- JSON/JSONL strict and unique;
- parent child reference exactly one;
- typecheck/build/full `432/432`;
- diff check pass;
- `src/test/package/package-lock/tsconfig` delta from `38afdc3` empty;
- worktree clean after a docs-only planning commit.

Operator bounded-repair verification reproduced typecheck/build and full `432/432`; strict JSON/JSONL, 44-row parent-set equality, 44 unique qualification titles, every existing decisive title exactly once, Trellis child `31/27`, parent `3/3`, product `0/0`, post-Core `15/16`, diff check and protected production zero-diff gates pass. The worktree intentionally contains only this reviewed docs repair candidate pending a separate planning commit decision and qualification implementation authorization; qualification measurements remain unrun.
