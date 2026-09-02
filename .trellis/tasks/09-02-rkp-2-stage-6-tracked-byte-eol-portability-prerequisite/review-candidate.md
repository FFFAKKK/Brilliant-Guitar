# Planning review candidate

## Status

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`

## Exact object

- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`
- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Candidate HEAD: the exact clean `git rev-parse HEAD` produced by the docs-only planning commit and named in the audit dispatch; this file intentionally avoids a self-referential hash
- Task: `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
- Status: `in_progress`, paused before I1 while this planning repair is reviewed
- `task_start_run=true` records the historical stopped I0 attempt and is not current authorization
- `production_implementation_authorized=false`
- `user_implementation_authorization=false`
- historical stop evidence: `fa756bb3755ab4f9dcc8bc1b5e5ada571102927f`; its technical-file delta is empty

The candidate is eligible for audit only after the post-commit command set confirms clean/staged-empty status, docs-only repair diff, Trellis/JSON/JSONL/fence checks, typecheck/build results and the exact Node baseline classification. `implementation-evidence.md` is absent at this repaired planning HEAD; its stopped-run history remains in commit `fa756bb...` and `research/e2-blocker-and-audit-evidence.md`, so the next independently approved I0 source can again satisfy the evidence-absence gate. Any post-commit content repair creates a new HEAD and invalidates the prior audit object.

## Author validation evidence

- historical clean planning baseline at `f39c72bf...`: focused `11/7/4/0`, full `611/605/4/2`, manifest `80` with SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`;
- current pre-commit mechanical/Trellis/JSON/JSONL/fence/protected-delta gates: pass;
- corrected function-owner/lexical negative verifier: `5/5`, SHA-256 `34ff103c52922a75fa30b525138c8d7e2573206c61f0c8037c935e61a28a93e2`;
- current typecheck/build: pass/pass;
- current focused classifier: `11/7/4/0`;
- current dirty-worktree full classifier: `611/604/5/2`; the only extra title is the clean-tree assertion and must disappear on the clean post-commit replay before dispatch;
- clean-head focused/full classifiers: `11/7/4/0` and `611/605/4/2`;
- clean-head manifest: `80`, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`;
- the final evidence-record amend must reproduce this same tuple before audit dispatch;
- exact four failure titles: listed in `research/planning-self-audit.md`;
- cause classification: three new-child exact-path/projection failures plus one inherited pre-/post-RKP-1A property-cap blob failure; none is a product-test failure;
- audit requirement: independently accept or reject that classification; do not infer a pass from this self-record.
- current amendment validation: the post-repair command tuple is recorded in `research/planning-self-audit.md`; this is author evidence, not an independent verdict.

## First independent audit and bounded repair

- dedicated audit task: `01a06123-b6c9-78a0-8216-9c8f1d53a061`;
- reviewed HEAD: `538abbdaee079aaf5df800f09d192fbb777174d9`;
- verdict: RETURN, P0/P1/P2=`0/2/0`;
- P1-1 repair: replaced prefix-only product proof with matched terminal-module close, whitespace-only suffix, six named function ranges, both old/new hunk containment and exact in-memory reconstruction to the base blob;
- P1-2 repair: corrected the failure causes to `3 + 1` and added deterministic primary assertion signatures to I0/I3;
- historical disposition: the bounded repair was sent for targeted rereview; that rereview produced the second audit below and did not authorize implementation.

## Second independent audit and bounded repair

- dedicated audit task: `01a06123-b6c9-78a0-8216-9c8f1d53a061`;
- reviewed HEAD: `ad56a0307bd2ef429a2693e6235f7a77a4c71ece`;
- verdict: RETURN, P0/P1/P2=`0/2/0`;
- P1-1 repair: fixed the real Node `v24.15.0` event contract to `isolation: "none"`, title-level `test:fail`, outer `ERR_TEST_FAILURE`/`testCodeFailure`, exactly one inner `AssertionError` cause, and frozen Node/test/capture-script bytes;
- P1-2 repair: replaced impossible baseline-to-candidate equality with pre-I1 control, independently constructed expected-transition and candidate lanes; the inherited Part Owner record stays unchanged while the other three may move only to predeclared expected values;
- historical gate: this repair subsequently received the third review below.

## Third independent audit and bounded repair

- dedicated audit task: `01a06123-b6c9-78a0-8216-9c8f1d53a061`;
- reviewed HEAD: `5d08d5c1f7442b6105e95348ba2220c209c80e5b`;
- verdict: RETURN, P0/P1/P2=`0/1/0`;
- confirmed closed: Node v24 event capture and pre-I1 control/expected/candidate contract are executable and non-self-referential;
- sole P1 repair: replaced task-meta whole-directory authority and research shorthand with the same six repo-relative literal coordination paths used by PRD/design/implement; added count `6` and an I0/I3 four-authority set-equality gate;
- historical gate: this repair subsequently received the fourth review below.

## Fourth independent audit, stopped I0 and current bounded repair

- dedicated audit task: `01a06123-b6c9-78a0-8216-9c8f1d53a061`;
- reviewed HEAD: `f39c72bfba28664b1772bf19855d74c765005f14`;
- verdict: PASS, P0/P1/P2=`0/0/0`;
- separately authorized A0: `13a3a6a923f6af6744ef4aa60291a622f3dff989`;
- stopped I0 evidence commit: `fa756bb3755ab4f9dcc8bc1b5e5ada571102927f`, with I1/I2/I3 all false, E3 zero and no technical-file delta;
- blocker: the reviewed verifier assigned the metrics hunk to the ignored `rkp2_stage_6_private_scale_evidence_v1`, but the source owner is the non-ignored `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores`;
- additional executable fact: committed V1/V2 expected lanes were content-insensitive and all four expected signatures equalled control, so the contract now forbids presuming either equality or inequality;
- current repair: correct only the function owner, ignored/non-ignored wording, lexical self-test line oracle (`13`, not `14`), signature relationship and deterministic re-entry baseline; reset current authorization and require a fifth dedicated planning review plus new user authorization.

## Review question

Does this planning candidate define the smallest sufficient prerequisite that makes S6.2's raw-byte inputs and Rust source-shape tests reproducible across `core.autocrlf=true/false`, without changing Rust product behavior or prematurely resuming S6.2?

## Required review focus

1. Base `55cb575c` excludes the unaccepted S6.2 activation/E1 commits.
2. The task is the sole EOL/raw-byte planning owner and is not a concurrent implementation child.
3. `.gitattributes` adds only seven exact path rules.
4. Three Rust files change only in existing `#[cfg(test)]` source-shape checks.
5. Five LF-sensitive sites are all covered; the fifth is the non-ignored metrics extraction, and the ignored scale worker contains no permitted edit.
6. Dual fresh-checkout verification compares raw bytes, byte lengths, SHA-256 and Git blob bytes without normalization.
7. Cargo and temporary output remain on E:.
8. E1 worker logic is preserved conceptually but `c3c4d198...` is not accepted or reused as evidence authority.
9. The separate E1 provenance P1 has exactly one successor owner and is not silently dropped.
10. E3 remains zero; TypeScript default and all later lifecycle gates remain unchanged.
11. Rollback and new-S6.2 re-entry sequence are deterministic.
12. Planning diff contains no technical/production/test/Cargo/package/tsconfig changes.
13. The two findings from the `538abbda...` review are closed without expanding the four-file future implementation allowlist.
14. The Rust verifier rejects a top-level suffix after the terminal test module and unrelated edits inside that module.
15. Node red-baseline capture uses the exact Node v24 title-level outer-wrapper/one-inner-cause event shape and records tool/test bytes.
16. Control and expected-transition signatures are frozen before I1; every new evidence path passes a two-placeholder content-insensitivity probe and the candidate cannot supply its own expected values.
17. The Part Owner signature stays baseline-equal, while the other three candidate signatures equal independently predeclared transition values; those values may equal or differ from control and are never inferred from the candidate.
18. The two findings from the `ad56a030...` review are closed without changing task/lifecycle scope.
19. The sole finding from the `5d08d5c...` review is closed: no task-directory prefix remains in the candidate coordination allowlist.
20. Task meta, PRD, design and implement each expose the same six literal paths and count; the I0/I3 parser mechanically compares them with the actual candidate diff.
21. The six-function verifier names `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores` and contains the metrics hunk there; it authorizes no edit to the ignored scale worker.
22. The old A0, stop evidence commit and temporary lanes are non-reusable; the next attempt creates a new clean re-entry activation commit only after this exact HEAD passes review and receives new authorization.
23. Current authorization flags are false while historical `task_start_run=true` remains truthful.
24. The verifier's synthetic lexical fixture expects its matched module close at line 13, the unrelated-hunk negative uses the real unique `indices_cover_entity_owner_content_extension_and_core_references` rather than nonexistent `fn fixture`, and all five self-tests pass before candidate inspection.

## Expected review output

- verdict first;
- P0/P1/P2 counts;
- file:line evidence for each finding;
- exact bounded repair when returning;
- exact reviewed HEAD and clean/staged-empty state;
- no file changes, reactivation, I1 work, acceptance, archive, integration or push.
