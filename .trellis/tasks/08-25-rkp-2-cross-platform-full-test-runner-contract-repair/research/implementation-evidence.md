# Implementation Evidence — RKP-2 Cross-platform Full Test Runner Contract Repair

## Candidate boundary

- accepted planning content P: `44832ad01d136368c1b61203e9207ca4a521241f`
- accepted planning anchor A: `c69d7b76175e2b818f4d276504a39b741e6e1975`, dedicated planning PASS `0/0/0`
- preserved implementation activation / Stage 1 / Stage 2: `9da6ba6`, `912a68a`, `d366653`
- bounded merge: `b4906ac64a44cc735de7b923818817300d5c70fd`
- event-coverage correction: `b20016882c16906db350feade4811821d55dad93`
- hostile/version/range proof: `ce9598eca3ad4df30854b8cc9383f4034e2e55a3`
- implementation-review return: exact `15c84a1929d1365ebf466088e896fd5309a4fa57`, P0/P1/P2=`0/1/1`, auditor `01a01e48-1934-77b0-821e-a8026cd9e5f7`
- bounded repair state / precedence / branch evidence: `04364ecaf6f329bd2a4d3671a75bac7b15d23c49`, `f77549ef429dd2611d7f6144c164511599da9129`, `139f1271b651af0c1b70e151ba9604ef154442d7`
- discarded diagnostic `610d20b` is not an ancestor
- final docs/evidence commit: exact hash is reported after commit; it changes lifecycle/evidence only

The live `P..candidate` range is mechanically constrained to the exact four technical paths plus eleven active lifecycle/authority paths, fifteen unique paths total. RKP-2 retains its own 21 technical and 22 active coordination ownership sets. Both RKP-2 JSONL files remain byte-identical.

## RED/GREEN mechanism evidence

Before the correction, accepted amendment tests reproduced `runner.outcome-path-mismatch`, missed malformed/relative pass paths, and allowed the obsolete unique-terminal model to mask premature close. The correction now uses only event type plus pass `data.file`: any fail at any nesting is fatal; every pass file is a non-empty absolute manifest member; duplicate and nested passes are idempotent set insertions; normal end requires manifest/run-files/seen equality. `data.name`, `data.nesting`, `details.type`, reporter text and `test:complete` do not establish truth.

Focused tests cover duplicate and nested passes, opaque and absolute-looking titles, missing/non-string/relative/unknown files, partial coverage, nested/top-level fail, interrupted, abort, premature close, reporter flush/backpressure, synchronous observer attachment, real empty/all-skipped files, real hard-link rejection before `run()`, invalid physical identity and independent compiled-tree manifest equality.

The P1 repair retains observer first-failure wins across event handling, finalize and pipeline catch. A later reporter sink, transform or flush failure cannot replace an already selected `runner.test-failed`, `runner.test-interrupted`, outcome-path or stream code; reporter-only construction/pipeline failure remains `runner.reporter-failed`. The P2 evidence directly executes real root and entry junction rejection, an injected unsupported directory entry and a real repository missing `package.json`, each with `runCalls=0`, plus separate reporter factory, reporter-sink factory and transform-callback failures under bounded timeouts.

## Cross-version and full-run evidence

Node 20.20.2 and Node 24.15.0 each pass the focused runner/workspace-law set 26/26 (runner 19/19, workspace-law 7/7). On the same clean compiled tree, both use:

`{"kind":"full-test-manifest-v1","fileCount":78,"sha256":"e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5"}`

Each complete run reports 576 tests, 575 pass, 1 expected GC skip, 0 fail, 0 cancelled and exits zero. Totals are evidence snapshots only; the runner discovers them dynamically.

## Rust and compatibility evidence

The main Windows checkout exposes the known CRLF-only source-text introspection mismatch without product-code drift. A detached checkout created with per-command `core.autocrlf=false` at `ce9598e` contains zero CRLF in the inspected Runtime source and passes:

- Rust 1.97.1 fmt and workspace all-target check;
- Rust workspace tests 70/70;
- Rust 1.97.1 Clippy all-targets with `-D warnings`;
- Rust 1.88.0 workspace all-target locked check.

Final TypeScript, Node bridge, Trellis, JSON/JSONL, path, hash, protected-delta and clean-status gates are recorded on the committed candidate before handoff.

## Lifecycle result

Independent implementation review of exact `15c84a1929d1365ebf466088e896fd5309a4fa57` returned P0/P1/P2=`0/1/1`, and the first bounded repair closed those production/P2 findings. Targeted implementation rereview of exact `6dac686d7f7dcaa447330209c6da04e414b7615c` then returned P0/P1/P2=`0/1/0`: production runner behavior remains accepted, while the workspace-law oracle must model ordered signals and first-observed failure. The child remains `in_progress`; candidate readiness is false during this oracle-only repair and rereview remains pending. No implementation audit PASS, acceptance, archive, closeout, integration into RKP-2, Stage 6 authorization, push, qualification, RKP-3 or default-runtime switch is claimed.
