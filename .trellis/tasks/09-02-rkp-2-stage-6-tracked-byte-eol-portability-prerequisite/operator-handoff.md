# Operator handoff

## Current gate

Planning only. Do not start or implement this task until:

1. `review-candidate.md` names an exact docs-only planning HEAD;
2. a dedicated independent planning task returns P0/P1/P2=`0/0/0` for that exact HEAD;
3. the user separately authorizes the tracked-byte/EOL prerequisite.

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
4. `indices.rs` — three test-only source inspections plus small LF/CRLF parity coverage.

All commands, fresh clones, Cargo targets, TEMP/TMP and transcripts stay on E:.

The Rust diff is accepted only when the lexical verifier locates the unique matched end of each terminal test module, finds a whitespace-only suffix, contains both old/new hunk ranges inside the five named existing functions plus `source_shape_normalization_is_lf_crlf_invariant`, and reconstructs the exact base blob after removing those six permitted edits. Prefix equality alone is invalid.

The Node red baseline is not matched by titles alone. I0 freezes four programmatic primary assertion signatures and the exact `3 + 1` cause split; I3 must reproduce both in addition to exit/count/title/manifest equality.

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
- four Node primary assertion signatures with the exact three-new-child plus one-inherited-base cause split;
- matched terminal test-module/six-function exact reconstruction proof;
- task-local evidence;
- E3 count zero;
- clean/staged-empty worktree.

After a separate implementation audit, lifecycle closeout remains an explicit owner decision. Even after integration, the next action is a new S6.2 planning candidate, not direct E2 continuation.
