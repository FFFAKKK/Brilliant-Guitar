# Review Candidate — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current checkpoint

`READY FOR INDEPENDENT IMPLEMENTATION REREVIEW`.

Planning head `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed targeted independent rereview at P0/P1/P2=`0/0/0` in auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user authorized this repair implementation only. This activation claims no implementation candidate, Stage 6 readiness, acceptance/archive/integration, qualification, push, RKP-3 or default-runtime cutover.

Dedicated implementation review of exact candidate `15c84a1929d1365ebf466088e896fd5309a4fa57` returned P0/P1/P2=`0/1/1`. Candidate readiness is withdrawn while the bounded repair preserves the first observer-selected failure over later reporter failure and adds direct evidence for the already implemented fail-closed branches. Targeted implementation rereview remains pending.

State commit `04364ecaf6f329bd2a4d3671a75bac7b15d23c49` reopened only those findings. Repair `f77549ef429dd2611d7f6144c164511599da9129` makes observer first-failure selection authoritative through finalize and pipeline catch; proof `139f1271b651af0c1b70e151ba9604ef154442d7` locks root junction, unsupported entry, invalid repository, reporter factory, sink factory and transform callback failures. Candidate readiness is restored for rereview; no PASS is claimed.

Targeted implementation rereview of exact `6dac686d7f7dcaa447330209c6da04e414b7615c` returned P0/P1/P2=`0/1/0`. It confirms the production runner and prior P2 evidence, but reopens the independent workspace-law oracle because separate event and terminal-state inputs cannot mechanically distinguish opposite first-failure orders. Candidate readiness is withdrawn during this single oracle repair; Stage 6 remains false.

State `dd63ff2677c063bb78686b28a73b92c0f22a9d1b` records that return without changing planning authority. Test repair `adaea920c8f8e92282c8871923d0c9e7ea156eab` replaces the collapsed oracle with an independent ordered signal reducer and mechanical `firstFailure ??=` selection. Exact reverse-order fixtures now prove stream-error/test-fail, abort/malformed pass, observer/reporter and interrupted combinations; end-before-flush and premature close remain fail-closed. Candidate readiness is restored only for rereview, not acceptance.

Planning head `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed its dedicated review. Its implementation line reached clean Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`, where real events disproved only the unique-file-terminal premise. Content P `44832ad01d136368c1b61203e9207ca4a521241f` and anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` close that drift; the dedicated auditor returned PASS P0/P1/P2=`0/0/0` for A. A is explicitly merged, implementation is unpaused, and discarded Stage 3 `610d20b` remains outside the parent chain.

## Candidate claim

The plan keeps deterministic discovery, BigInt identity, manifest, Node-version and stream/reporter contracts unchanged. The amended normalizer consumes only event type plus pass `data.file`; duplicate passes build an idempotent seen-file set, any fail at any nesting is fatal, and success requires independent manifest/run-files/seen equality. Name, nesting, details, `test:complete` and reporter text cannot establish truth. Node 20.20.2 and 24.15.0 raw/fast/slow characterization is identical.

The implementation dynamically discovers later tests and never hard-codes 77/557. At the repaired clean pre-review line, Node 20.20.2 and 24.15.0 independently produce the same 78-file manifest hash `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5` and the same dynamic result: 576 tests, 575 pass, 1 expected skip, 0 fail. Package-lock, product/Rust/native/CVN/qualification code, other individual test contents, public inventories and TypeScript default remain protected.

## Governance claim

The new child is the sole test-infrastructure owner. RKP-2 Stage 6 consumes an accepted runner only after independent implementation review, acceptance/archive and explicit integration into a new prerequisite base. Stage 6 remains separately unauthorized.

RKP-2 keeps its 21 technical paths and adds exactly twelve child planning artifacts to its ten coordination paths, producing 22 literal active coordination paths. Content commit P `44832ad01d136368c1b61203e9207ca4a521241f` owns the corrected contract; accepted anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` pins P and freezes `eed4871a..P` as the exact 20-path interval without mutable `HEAD`. The live `P..candidate` pre-review implementation range is child technical 4 plus active lifecycle 11 and stops at `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`.

Post-PASS closeout is distinct: native archive creates exactly 13 archived artifacts including implementation evidence, mechanically replaces the 12 active paths, and yields RKP-2 coordination 23 = historical 10 + archive 13. Active/archive dual authority is forbidden. Only then may exact commits and five hashes be updated and the accepted descendant explicitly integrated into a new, still-unauthorized Stage 6 prerequisite. The two RKP-2 JSONLs remain byte-identical throughout.

## Independent review focus

1. Does root/link traversal reject every link before follow, handle Windows junctions and preserve spaces/Unicode/deep paths?
2. Is the code-unit ordering/dedup/manifest algorithm deterministic and detached?
3. Does the normalizer consume only `test:pass`/`test:fail` plus pass `data.file`, attach synchronously, allow duplicate passes, reject malformed/unknown/partial coverage and require manifest/run-files/seen equality?
4. Do nested fail, interrupted, abort/premature close/no end and reporter flush errors remain nonzero?
5. Does the first observer-selected test/outcome/stream failure survive every later reporter sink/transform failure, while a reporter-only failure remains `runner.reporter-failed`?
6. Do BigInt `(dev,ino)` identity and direct root/entry/repository fixtures reject before `run()`?
7. Are reporter factory, sink factory and transform callback failures separately proven to settle without hanging?
8. Is the Node 20/24 option contract correct and free of unsupported `cwd`/`isolation` options?
9. Does exact anchor A pin content P, freeze `eed4871a..P` as 20 planning paths, define `P..candidate` as 4+11, and preserve 22 active, 13 archive and 23 post-archive sets?
10. Is Stage 4 review-only, with archive/closeout/integration deferred until implementation PASS, and do all Trellis/JSON/JSONL/path/fence/hash/full-suite gates remain truthful?

## Candidate commits and evidence

- merge `b4906ac64a44cc735de7b923818817300d5c70fd` preserves the Stage-2 implementation line and explicitly integrates accepted anchor A;
- correction `b20016882c16906db350feade4811821d55dad93` implements pass-`data.file` seen-set truth and removes the two dead unique-terminal error branches;
- proof `ce9598eca3ad4df30854b8cc9383f4034e2e55a3` adds hard-link, real empty/all-skip, backpressure, dual-version and live `P..candidate` range enforcement;
- bounded review state `04364ecaf6f329bd2a4d3671a75bac7b15d23c49`, precedence repair `f77549ef429dd2611d7f6144c164511599da9129` and branch proof `139f1271b651af0c1b70e151ba9604ef154442d7` close only the returned `0/1/1` findings;
- oracle repair state `dd63ff2677c063bb78686b28a73b92c0f22a9d1b` and ordered-signal proof `adaea920c8f8e92282c8871923d0c9e7ea156eab` close only the returned `0/1/0` governance-oracle finding while all production runner files stay byte-identical to `6dac686d`;
- this final docs/evidence commit adds the eleventh lifecycle path and makes the live range exactly 4 technical + 11 lifecycle.

Focused runner plus workspace-law passes 26/26 on Node 20 and Node 24. A clean LF checkout passes Rust workspace 70/70, fmt/check/clippy/MSRV. The implementation candidate is ready for targeted rereview, but no independent implementation PASS is claimed. Acceptance, archive, closeout, integration and RKP-2 Stage 6 remain later gates.
## Owner acceptance record - exact audited candidate

Dedicated independent implementation rereview task 01a01e48-1934-77b0-821e-a8026cd9e5f7 returned PASS FOR IMPLEMENTATION ACCEPTANCE, P0/P1/P2=0/0/0, for exact technical candidate 8d9a2a4a35c7707fad5398733eb43c08984bea2b. The earlier ordered-signal workspace-law oracle P1 is closed. This lifecycle record does not alter or impersonate that audited implementation commit.

Owner closeout is authorized to use Trellis native archive and then replace the twelve active-child authority paths with the exact thirteen archived successors. RKP-2 Stage 5 remains complete; Stage 6 remains not started and not authorized; TypeScript remains the default runtime. No push, qualification, RKP-3 or default cutover is authorized.
