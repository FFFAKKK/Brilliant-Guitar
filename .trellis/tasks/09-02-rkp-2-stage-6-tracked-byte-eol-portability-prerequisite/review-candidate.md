# Planning review candidate

## Status

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`

## Exact object

- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`
- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Candidate HEAD: the exact clean `git rev-parse HEAD` produced by the docs-only planning commit and named in the audit dispatch; this file intentionally avoids a self-referential hash
- Task: `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
- Status: `planning`
- `task_start_run=false`
- `production_implementation_authorized=false`

The candidate is eligible for audit only after the post-commit command set confirms clean/staged-empty status, planning-only diff, Trellis/JSON/JSONL/fence checks, typecheck/build results and the exact Node baseline classification. Any post-commit content repair creates a new HEAD and invalidates the prior audit object.

## Author validation evidence

- mechanical/Trellis/JSON/JSONL/fence/protected-delta gates: pass;
- typecheck/build: pass/pass;
- focused classifier: `11/7/4/0`;
- full classifier: `611/605/4/2`;
- full manifest: `80`, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`;
- exact four failure titles: listed in `research/planning-self-audit.md`;
- cause classification: three new-child exact-path/projection failures plus one inherited pre-/post-RKP-1A property-cap blob failure; none is a product-test failure;
- audit requirement: independently accept or reject that classification; do not infer a pass from this self-record.

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
- current gate: third targeted rereview of the new exact clean HEAD; implementation, task start and authorization remain false.

## Review question

Does this planning candidate define the smallest sufficient prerequisite that makes S6.2's raw-byte inputs and Rust source-shape tests reproducible across `core.autocrlf=true/false`, without changing Rust product behavior or prematurely resuming S6.2?

## Required review focus

1. Base `55cb575c` excludes the unaccepted S6.2 activation/E1 commits.
2. The task is the sole EOL/raw-byte planning owner and is not a concurrent implementation child.
3. `.gitattributes` adds only seven exact path rules.
4. Three Rust files change only in existing `#[cfg(test)]` source-shape checks.
5. Five LF-sensitive sites are all covered, including the site inside the ignored scale test.
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
17. The Part Owner signature stays baseline-equal, while the other three candidate signatures may change only to independently predeclared transition values.
18. The two findings from the `ad56a030...` review are closed without changing task/lifecycle scope.

## Expected review output

- verdict first;
- P0/P1/P2 counts;
- file:line evidence for each finding;
- exact bounded repair when returning;
- exact reviewed HEAD and clean/staged-empty state;
- no file changes, implementation, task start, acceptance, archive, integration or push.
