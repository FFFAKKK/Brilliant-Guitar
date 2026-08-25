# Implementation Evidence — RKP-2 Cross-platform Full Test Runner Contract Repair

## Candidate boundary

- accepted planning content P: `44832ad01d136368c1b61203e9207ca4a521241f`
- accepted planning anchor A: `c69d7b76175e2b818f4d276504a39b741e6e1975`, dedicated planning PASS `0/0/0`
- preserved implementation activation / Stage 1 / Stage 2: `9da6ba6`, `912a68a`, `d366653`
- bounded merge: `b4906ac64a44cc735de7b923818817300d5c70fd`
- event-coverage correction: `b20016882c16906db350feade4811821d55dad93`
- hostile/version/range proof: `ce9598eca3ad4df30854b8cc9383f4034e2e55a3`
- discarded diagnostic `610d20b` is not an ancestor
- final docs/evidence commit: exact hash is reported after commit; it changes lifecycle/evidence only

The live `P..candidate` range is mechanically constrained to the exact four technical paths plus eleven active lifecycle/authority paths, fifteen unique paths total. RKP-2 retains its own 21 technical and 22 active coordination ownership sets. Both RKP-2 JSONL files remain byte-identical.

## RED/GREEN mechanism evidence

Before the correction, accepted amendment tests reproduced `runner.outcome-path-mismatch`, missed malformed/relative pass paths, and allowed the obsolete unique-terminal model to mask premature close. The correction now uses only event type plus pass `data.file`: any fail at any nesting is fatal; every pass file is a non-empty absolute manifest member; duplicate and nested passes are idempotent set insertions; normal end requires manifest/run-files/seen equality. `data.name`, `data.nesting`, `details.type`, reporter text and `test:complete` do not establish truth.

Focused tests cover duplicate and nested passes, opaque and absolute-looking titles, missing/non-string/relative/unknown files, partial coverage, nested/top-level fail, interrupted, abort, premature close, reporter flush/backpressure, synchronous observer attachment, real empty/all-skipped files, real hard-link rejection before `run()`, invalid physical identity and independent compiled-tree manifest equality.

## Cross-version and full-run evidence

Node 20.20.2 and Node 24.15.0 each pass the focused runner/workspace-law set 23/23. On the same clean compiled tree, both use:

`{"kind":"full-test-manifest-v1","fileCount":78,"sha256":"e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5"}`

Each complete run reports 573 tests, 572 pass, 1 expected GC skip, 0 fail, 0 cancelled and exits zero. Totals are evidence snapshots only; the runner discovers them dynamically.

## Rust and compatibility evidence

The main Windows checkout exposes the known CRLF-only source-text introspection mismatch without product-code drift. A detached checkout created with per-command `core.autocrlf=false` at `ce9598e` contains zero CRLF in the inspected Runtime source and passes:

- Rust 1.97.1 fmt and workspace all-target check;
- Rust workspace tests 70/70;
- Rust 1.97.1 Clippy all-targets with `-D warnings`;
- Rust 1.88.0 workspace all-target locked check.

Final TypeScript, Node bridge, Trellis, JSON/JSONL, path, hash, protected-delta and clean-status gates are recorded on the committed candidate before handoff.

## Lifecycle result

`READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. The child remains `in_progress`; implementation review is `pending`. No implementation audit PASS, acceptance, archive, closeout, integration into RKP-2, Stage 6 authorization, push, qualification, RKP-3 or default-runtime switch is claimed.
