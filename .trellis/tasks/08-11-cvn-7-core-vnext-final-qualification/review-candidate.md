# CVN-7 Review Record and Frozen Harness Handoff

## Current status - 2026-08-14

`BOUNDED CVN-7 PREFLIGHT STAGE SPLIT REPAIR IMPLEMENTED / TARGETED INDEPENDENT REREVIEW PENDING`

- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Original reviewed harness implementation anchor: `623f94a4308d2a51014256a2616af1bff53fdb56` (`test(cvn-7): freeze qualification harness`). The launcher, scoped-Git and batch-event assertion repairs passed targeted rereviews. Diagnostics commit `5e6be66` closed every observability item except compound CVN-7 build/test stage identity; the current split-stage repair is the only implementation delta awaiting targeted rereview.
- Task status: `in_progress`; task start and qualification implementation authorization are true.
- Independent planning review final verdict: `PASS`, P0/P1/P2=`0/0/0`.
- Independent implementation review final verdict after all bounded repairs and the rejected-stress negative-path probe: `PASS`, P0/P1/P2=`0/0/0`.
- Recorded pre-freeze verification: typecheck/build pass, CVN-7 `69/69`, full `501/501`, Trellis/JSON/JSONL/allowlist/diff gates pass, production source delta zero.
- First official input `7e3b7e61cc8ee292ee59522df297f43a86210b7c` ended `EVIDENCE_INVALID` at direct Windows `execFileSync("npm.cmd", ...)`: reason `npm_cmd_execfile_einval`, `worker_started=false`, `partial_evidence=false`. Task-local `evidence/` still contains only `README.md`; nothing from that attempt is reusable.
- Second official input `e510ed1d88f646c41143d94e3513af3f79f7d943` ended at baseline clean-status Git preflight: reason `git_dubious_ownership_preflight`, `worker_started=false`, `partial_evidence=false`, `measurement_complete=false`, `evidence_valid=false`. Evidence remains README-only and that input is not reusable.
- Third official input `330d8938997a2c7e7f3835da41588fbef4f05787` reached the baseline `batch-100` warmup worker and ended `EVIDENCE_INVALID` with `worker-failed-batch-result-mismatch`, `worker_started=true`, `partial_evidence=false`. Independent root-cause review returned classification A, P0/P1/P2=`0/1/0`: the harness filtered `kernel.command.committed`, while accepted Core emits `core.document.committed`; Core/CVN-5 behavior is correct. All 253 external diagnostics are non-reusable.
- Fourth official input `075de27a03a7bf5c3cc0949f85a36f209954435e` ran persistently from 16:15:17 to 16:16:18 and ended at nonzero `candidate.test.cvn7` preflight. The old runner discarded native status/signal/stdout/stderr, and the outer `254` was a wrapper sentinel. No worker or qualification TEMP run started, evidence remained README-only, and later same-identity/cwd/pipe reproduction passed `78/78`; the original A/E trigger remains unresolved and this input/log is non-reusable.
- CVN-7 remains unaccepted and unarchived. The Core VNext parent and all post-Core children remain gated.

## Implementation review closure

The current repair captures and strictly validates `process.env.npm_execpath`, invokes npm as `process.execPath` plus the npm CLI JavaScript argv, preserves the native Git launcher, and rejects invalid npm identity before preflight side effects. CVN-7 boundary regressions cover Windows selection, path/argument spaces, missing/relative/nonexistent/non-file/wrong-identity paths, npm order/output/failure propagation, Git preservation and zero evidence/worker activity on validation failure. Qualification schema, fixture matrix, budgets, repeats and seeds are unchanged.

Repair-candidate verification is green: typecheck, build, CVN-7 `73/73`, full `505/505`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product parent `0/0`, post-Core `15/16`, exact 10-file changed allowlist, protected paths/evidence zero delta and `git diff --check`. No `--mode all` worker was started.

The next review is a targeted independent launcher rereview of this bounded delta and its direct regressions. It is not the final evidence review. No official `--mode all`, acceptance, archive or push occurs before that verdict.

The current bounded repair resolves each candidate/baseline root to an existing canonical directory before side effects and routes every runner Git call through native `git` with exact argv `-c safe.directory=<that root>` and matching `cwd`. It adds no persistent configuration, wildcard scope, shell, command concatenation or second launcher. Targeted rereview is limited to this helper, its four preflight call sites, actual frozen-baseline probe, invalid-root/evidence-zero regressions, retained Node-to-npm behavior and the updated two-attempt ledger.

Repair-candidate verification is green: typecheck, build, CVN-7 `77/77`, full `509/509`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product parent `0/0`, post-Core `15/16`, exact 10-file allowlist, protected/evidence zero delta and `git diff --check`. The scoped native Git probe returned clean for the frozen baseline under the current runner identity. No official measurement was invoked during repair.

The current bounded repair changes the worker's aggregate committed-event expectation to `core.document.committed` and validates commandId `core.transaction.batch`, exact source `{kind: "core"}`, cause `submit`, documentVersion 1, the 100-child committed result and undo/redo depth 1/0. The dirty-state event is validated independently and is not counted as a committed event. A real `runQualificationWorker()` warmup regression passes, and one controlled baseline plus candidate probe yields deep-equal normalized results. Schema, fixtures, budgets, timeouts, samples, repeats and seeds remain exact. Targeted independent rereview is pending; this repair session does not run official `--mode all`.

Repair verification is green: typecheck/build, focused boundary `21/21`, CVN-7 `78/78`, full `510/510`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product `0/0`, post-Core `15/16`, exact nine-file allowlist and diff check. Baseline/candidate normalized probes are deep-equal; both `dist/src` manifests contain 71 files and tree SHA-256 `65c1e715409c0631355a60e6f06b4bd7f091d2952cc44205eaae27cba79ba861`. Production, other tests, package/lock/config/OpenSpec/evidence and fixture/budget/schema paths have zero additional delta.

The current bounded diagnostics repair labels every preflight subprocess stage and serializes a stable schema-version-1 `preflight-command-failed` record to stderr. It preserves the canonical root, executable, argv, native integer-or-null status, string-or-null signal, and separately bounded stdout/stderr with original byte counts and truncation flags. Each stream retains the longest complete UTF-8 prefix within 65,536 bytes. Injection regressions cover build/test stage identity, path/argv spaces, cap-minus-one/cap/cap-plus-one and split Unicode, top-level serialization, and zero later npm/worker/measurement-TEMP/evidence side effects. Success order and all qualification contracts remain unchanged.

Diagnostics repair verification is green: typecheck/build, focused boundary `25/25`, CVN-7 `82/82`, full `514/514`, direct Node plus npm CLI JavaScript reproduction `82/82`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product `0/0`, post-Core `15/16`, exact nine-file allowlist and diff check. Baseline/candidate production manifests are equal at 71 files and tree SHA-256 `2fd30bbd33294454f142e160bf88d2755c67e6639e154b282bd566c13d6e7ad2`. Schema, fixtures, budgets, timeouts, samples, repeats and seeds are unchanged. Official `--mode all` was not invoked.

Targeted rereview of `5e6be662216f3aeef0cb086fa91ef43b7ccaa015` returned `RETURN FOR BOUNDED REPAIR`, P0/P1/P2=`0/1/0`. It explicitly passed the diagnostic schema/native fields, both 65,536-byte caps, UTF-8 boundary behavior, top-level stderr and zero side effects. Its sole finding was that the real candidate path still invoked compound `npm run test:cvn7`, so nested build and Node test shared one stage and argv.

The current repair executes `candidate.test.cvn7.build` through Node plus validated npm CLI `run build`, discovers a nonempty ordinal list of immediate regular non-symlink `cvn-7-*.test.js` files, then executes direct Node `--test` as `candidate.test.cvn7.node-test`. It parses only the second subprocess stdout. Real `runQualification()` failure injections prove build failure suppresses Node/full/worker/TEMP/evidence and Node failure suppresses full/worker/TEMP/evidence; success injection proves build output is ignored for counts. Discovery regressions cover empty/missing, extra nonmatching, spaces, nonregular and symlink cases. Verification is boundary `27/27`, CVN-7 `84/84`, full `516/516`, strict JSON/JSONL, Trellis child `31/27`, Core parent `3/3`, product `0/0`, post-Core `15/16`, exact nine-file allowlist and diff check. Baseline/candidate production manifests are equal at 71 files and tree SHA-256 `2fd30bbd33294454f142e160bf88d2755c67e6639e154b282bd566c13d6e7ad2`; package/script/schema/fixture/budget/timeout/seed/repeat contracts remain unchanged. Official `--mode all` was not invoked.

The review sequence is retained here so later technical reviewers can distinguish superseded interim verdicts from the frozen result:

1. Initial independent implementation review: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/5/2`.
2. First targeted rereview: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/2/1`.
3. Targeted rereview after the second repair: `PASS`, P0/P1/P2=`0/0/0`.
4. Additional all-rejected stress negative-path probe: `RETURN FOR BOUNDED IMPLEMENTATION REPAIR`, P0/P1/P2=`0/1/0`; this explicitly superseded the preceding interim PASS.
5. Final negative-path targeted rereview: `PASS`, P0/P1/P2=`0/0/0`.
6. Third official-run root-cause review: classification A / CVN-7 harness assertion defect, `RETURN FOR BOUNDED REPAIR`, P0/P1/P2=`0/1/0`; the batch assertion repair later passed targeted rereview.
7. Fourth official-run observability review: `RETURN FOR MORE EVIDENCE`, classification A / confirmed CVN-7 harness observability defect, P0/P1/P2=`0/1/0`.
8. Targeted diagnostics rereview at `5e6be66`: `RETURN FOR BOUNDED REPAIR`, P0/P1/P2=`0/1/0`; all diagnostics behavior passed, with only compound candidate build/Node-test stage ambiguity remaining. The current split-stage repair awaits targeted rereview.

The rejected-stress repair encodes absent assessment as explicit `null`, accepts that exact shape in the decoder, and regresses the 10,000-rejected JSON round trip and functional routing. Commit `623f94a` remains the original reviewed harness anchor. After the current split-stage repair passes targeted rereview, its new clean commit becomes the exact equal candidate/harness input; `075de27`, `330d893` and all earlier failed inputs remain invalid for reuse.

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
