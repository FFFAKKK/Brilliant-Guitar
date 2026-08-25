# Review Candidate — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current checkpoint

`RETURNED FOR BOUNDED IMPLEMENTATION REPAIR — P0/P1/P2=0/1/1`.

Planning head `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed targeted independent rereview at P0/P1/P2=`0/0/0` in auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user authorized this repair implementation only. This activation claims no implementation candidate, Stage 6 readiness, acceptance/archive/integration, qualification, push, RKP-3 or default-runtime cutover.

Dedicated implementation review of exact candidate `15c84a1929d1365ebf466088e896fd5309a4fa57` returned P0/P1/P2=`0/1/1`. Candidate readiness is withdrawn while the bounded repair preserves the first observer-selected failure over later reporter failure and adds direct evidence for the already implemented fail-closed branches. Targeted implementation rereview remains pending.

Planning head `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed its dedicated review. Its implementation line reached clean Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`, where real events disproved only the unique-file-terminal premise. Content P `44832ad01d136368c1b61203e9207ca4a521241f` and anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` close that drift; the dedicated auditor returned PASS P0/P1/P2=`0/0/0` for A. A is explicitly merged, implementation is unpaused, and discarded Stage 3 `610d20b` remains outside the parent chain.

## Candidate claim

The plan keeps deterministic discovery, BigInt identity, manifest, Node-version and stream/reporter contracts unchanged. The amended normalizer consumes only event type plus pass `data.file`; duplicate passes build an idempotent seen-file set, any fail at any nesting is fatal, and success requires independent manifest/run-files/seen equality. Name, nesting, details, `test:complete` and reporter text cannot establish truth. Node 20.20.2 and 24.15.0 raw/fast/slow characterization is identical.

The implementation dynamically discovers later tests and never hard-codes 77/557. At the clean pre-review line, Node 20.20.2 and 24.15.0 independently produce the same 78-file manifest hash `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5` and the same dynamic result: 573 tests, 572 pass, 1 expected skip, 0 fail. Package-lock, product/Rust/native/CVN/qualification code, other individual test contents, public inventories and TypeScript default remain protected.

## Governance claim

The new child is the sole test-infrastructure owner. RKP-2 Stage 6 consumes an accepted runner only after independent implementation review, acceptance/archive and explicit integration into a new prerequisite base. Stage 6 remains separately unauthorized.

RKP-2 keeps its 21 technical paths and adds exactly twelve child planning artifacts to its ten coordination paths, producing 22 literal active coordination paths. Content commit P `44832ad01d136368c1b61203e9207ca4a521241f` owns the corrected contract; accepted anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` pins P and freezes `eed4871a..P` as the exact 20-path interval without mutable `HEAD`. The live `P..candidate` pre-review implementation range is child technical 4 plus active lifecycle 11 and stops at `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`.

Post-PASS closeout is distinct: native archive creates exactly 13 archived artifacts including implementation evidence, mechanically replaces the 12 active paths, and yields RKP-2 coordination 23 = historical 10 + archive 13. Active/archive dual authority is forbidden. Only then may exact commits and five hashes be updated and the accepted descendant explicitly integrated into a new, still-unauthorized Stage 6 prerequisite. The two RKP-2 JSONLs remain byte-identical throughout.

## Independent review focus

1. Does root/link traversal reject every link before follow, handle Windows junctions and preserve spaces/Unicode/deep paths?
2. Is the code-unit ordering/dedup/manifest algorithm deterministic and detached?
3. Does the normalizer consume only `test:pass`/`test:fail` plus pass `data.file`, attach synchronously, allow duplicate passes, reject malformed/unknown/partial coverage and require manifest/run-files/seen equality?
4. Do nested fail, interrupted, abort/premature close/no end and reporter flush errors remain nonzero?
5. Does BigInt `(dev,ino)` identity reject real hard-link aliases and unavailable identity before `run()`?
6. Is the Node 20/24 option contract correct and free of unsupported `cwd`/`isolation` options?
7. Do focused tests cover all hostile/partial/version/shell-entry cases without a production fault hook?
8. Does exact anchor A pin content P, freeze `eed4871a..P` as 20 planning paths, define `P..candidate` as 4+11, and preserve 22 active, 13 archive and 23 post-archive sets?
9. Is Stage 4 review-only, with archive/closeout/integration deferred until implementation PASS and reversible to the frozen baselines?
10. Are all Trellis/JSON/JSONL/path/fence/hash/full-suite gates specified and planning status truthful?

## Candidate commits and evidence

- merge `b4906ac64a44cc735de7b923818817300d5c70fd` preserves the Stage-2 implementation line and explicitly integrates accepted anchor A;
- correction `b20016882c16906db350feade4811821d55dad93` implements pass-`data.file` seen-set truth and removes the two dead unique-terminal error branches;
- proof `ce9598eca3ad4df30854b8cc9383f4034e2e55a3` adds hard-link, real empty/all-skip, backpressure, dual-version and live `P..candidate` range enforcement;
- this final docs/evidence commit adds the eleventh lifecycle path and makes the live range exactly 4 technical + 11 lifecycle.

Focused runner plus workspace-law passes 23/23 on Node 20 and Node 24. A clean LF checkout passes Rust workspace 70/70, fmt/check/clippy/MSRV. The implementation candidate is ready, but no independent implementation PASS is claimed. Acceptance, archive, closeout, integration and RKP-2 Stage 6 remain later gates.
