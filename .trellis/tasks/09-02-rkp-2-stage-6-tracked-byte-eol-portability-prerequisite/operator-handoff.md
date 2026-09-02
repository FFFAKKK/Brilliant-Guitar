# Operator handoff

## Current gate

The latest implementation attempt stopped in I1 before a technical commit at `6d7d85da83970c1674880bd61fc3e7610ebe72f0`; all four inherited failures were green, but the parity oracle omitted the newline before the split closing delimiter. The technical delta was rolled back to zero. The corrected literal is `"\n    entity_index_lookups: usize,\n"`.

Before resuming, commit the docs-only amendment, record that exact HEAD in a bounded activation projection, regenerate the patch/verifier hashes, and use a fresh E-drive checkout. The corrected patch has already passed verifier `5/5`, all five focused tests, `fmt`, and the runtime library suite `18/18` with one ignored large test. The user's current `继续` instruction supplies the new bounded implementation authorization; acceptance and integration still wait for a separate implementation audit.

The old A0, old patch/verifier hashes and earlier temporary lanes remain diagnostic history. The successful author rehearsal may be cited as planning proof, but execution evidence must be regenerated from the new activation HEAD.

## Work object

- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`
- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\rkp-2-stage-6-eol-portability-prerequisite`
- Base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Task: `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
- Parent: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`

## Problem being repaired

Four Rust tests parse checked-out source with LF-only tokens. Windows `core.autocrlf=true` materializes CRLF because the relevant paths lack attributes. The same missing policy makes S6.2 raw working-tree hashes vary across clean checkouts. This is a portability/evidence prerequisite, not a Runtime behavior failure.

## Future operator scope

Technical changes are exactly:

1. `.gitattributes` — seven explicit `text eol=lf` path rules;
2. `runtime.rs` — one test-only source inspection;
3. `store.rs` — one test-only source inspection;
4. `indices.rs` — three test-only source inspections plus small LF/CRLF parity coverage; the metrics inspection owner is exactly `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores`, while the ignored `rkp2_stage_6_private_scale_evidence_v1` contains no permitted edit.

All commands, fresh clones, Cargo targets, TEMP/TMP and transcripts stay on E:.

Candidate coordination is also literal, not directory-wide: child `task.json`, `implementation-evidence.md`, `review-candidate.md`, `operator-handoff.md`, RKP-2 parent `task.json` and Rust parent `task.json` are the only six paths. The I0/I3 parser must require this exact set in task meta, PRD, design and implementation plan; the task-directory prefix is not an allowlist entry.

The Rust diff is accepted only when the lexical verifier locates the unique matched end of each terminal test module, finds a whitespace-only suffix, contains both old/new hunk ranges inside the five named existing functions plus `source_shape_normalization_is_lf_crlf_invariant`, and reconstructs the exact base blob after removing those six permitted edits. Prefix equality alone is invalid.

The Node red baseline is not matched by titles alone. The capture uses Node `v24.15.0` and its programmatic runner with `isolation: "none"`, `concurrency: 1`, consumes title-level `test:fail` events, validates the outer `ERR_TEST_FAILURE`/`testCodeFailure` wrapper and unwraps exactly one inner `AssertionError` cause. I0 freezes the resolved Node executable, focused-test bytes, capture-script bytes and exact `3 + 1` cause split.

Candidate signatures are not inferred from the candidate. Before I1, the operator must freeze three lanes from the new clean `I0_SOURCE_HEAD`: a control checkout, an independently constructed expected-transition checkout using `I0_EXPECTED_PATCH.diff`, and the future candidate contract. Every new evidence path must first pass the two-placeholder content-insensitivity probe. At I3 the fresh control must equal I0, the rebuilt expected lane must equal its pre-I1 record, the Part Owner signature must remain unchanged, and the other three candidate signatures must equal their corresponding predeclared expected-transition values. An expected value is allowed to equal control; equality or inequality is never presumed. Deriving an expected value from the candidate is invalid.

## Hard stops

- Do not modify Rust product code.
- Do not modify S6.2 worker, worker-test, wrapper, fixture or Workspace Law semantics.
- Do not run the large ignored test or S6.2 E3.
- Do not reuse `c3c4d198...` or its raw hashes as accepted evidence.
- Do not create S6.2 evidence.
- Do not accept, archive, integrate, start S6.3, qualify, cut over, create RKP-3 or push.
- Any unexpected Cargo/Node failure stops the current phase and is reported before scope changes.

## Delivery endpoint

Stop at `READY FOR DEDICATED INDEPENDENT EOL PREREQUISITE IMPLEMENTATION REVIEW` with:

- exact activation, technical and evidence commits;
- exact four-file technical diff;
- dual-checkout byte/SHA/blob matrix;
- Cargo and Node gate results;
- I0/control, expected-transition and candidate Node primary assertion signatures with the exact three-new-child plus one-inherited-base cause split;
- Node executable/version, `isolation: "none"`, outer/inner error shape, compiled-test SHA, capture-script SHA and pre-I1 expected-patch SHA;
- matched terminal test-module/six-function exact reconstruction proof;
- task-local evidence;
- E3 count zero;
- clean/staged-empty worktree.

After a separate implementation audit, lifecycle closeout remains an explicit owner decision. Even after integration, the next action is a new S6.2 planning candidate, not direct E2 continuation.
