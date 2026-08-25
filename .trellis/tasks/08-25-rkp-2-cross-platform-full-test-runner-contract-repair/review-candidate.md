# Review Candidate — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current checkpoint

`IMPLEMENTATION IN PROGRESS — STAGE 1 NOT STARTED`.

Planning head `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` passed targeted independent rereview at P0/P1/P2=`0/0/0` in auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. The user authorized this repair implementation only. This activation claims no implementation candidate, Stage 6 readiness, acceptance/archive/integration, qualification, push, RKP-3 or default-runtime cutover.

The first independent review of exact candidate `c43a34e7d02a57cfd90de506cf97787ff5571a9e` returned P0/P1/P2=`0/3/0`; the bounded planning repair at `cc82ba168ed45b8c3e0182ea8e1370b1474f1155` is the accepted implementation authority.

## Candidate claim

The plan replaces environment-dependent quoted-glob discovery with a single deterministic test-infrastructure owner using official stable `node:test` `run({ files })`. It freezes root/traversal/link/file/order/dedup/resource boundaries, BigInt `(dev,ino)` hard-link rejection, immutable manifest count/hash, exact files-array equality, a cross-version `test:pass`/`test:fail` normalizer, separate structured observation/reporting and complete end/flush propagation. It supports Node 20.20.2 and 24.15.0 by using their common `files`/`concurrency` options and verified default process isolation from repo CWD.

The plan dynamically discovers later tests and never hard-codes 77/557. The 77-file, 557-discovered, 556-pass, 1-expected-skip, 0-fail result is only the current evidence baseline. Package-lock, product/Rust/native/CVN/qualification code, existing individual test contents, public inventories and TypeScript default remain protected.

## Governance claim

The new child is the sole test-infrastructure owner. RKP-2 Stage 6 consumes an accepted runner only after independent implementation review, acceptance/archive and explicit integration into a new prerequisite base. Stage 6 remains separately unauthorized.

RKP-2 keeps its 21 technical paths and adds exactly twelve child planning artifacts to its ten coordination paths, producing 22 literal active coordination paths. The real planning range remains exactly 20 paths. The future pre-review implementation range is child technical 4 plus active lifecycle 11 and stops at `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`.

Post-PASS closeout is distinct: native archive creates exactly 13 archived artifacts including implementation evidence, mechanically replaces the 12 active paths, and yields RKP-2 coordination 23 = historical 10 + archive 13. Active/archive dual authority is forbidden. Only then may exact commits and five hashes be updated and the accepted descendant explicitly integrated into a new, still-unauthorized Stage 6 prerequisite. The two RKP-2 JSONLs remain byte-identical throughout.

## Independent review focus

1. Does root/link traversal reject every link before follow, handle Windows junctions and preserve spaces/Unicode/deep paths?
2. Is the code-unit ordering/dedup/manifest algorithm deterministic and detached?
3. Does the normalizer consume only `test:pass`/`test:fail` plus nesting/file/name, reject wrong/private fields, attach synchronously and require exact top-level manifest outcomes?
4. Do nested fail, interrupted, abort/premature close/no end and reporter flush errors remain nonzero?
5. Does BigInt `(dev,ino)` identity reject real hard-link aliases and unavailable identity before `run()`?
6. Is the Node 20/24 option contract correct and free of unsupported `cwd`/`isolation` options?
7. Do focused tests cover all hostile/partial/version/shell-entry cases without a production fault hook?
8. Are the 20 planning, 4+11 candidate, 22 active, 13 archive and 23 post-archive sets literal and mechanically disjoint by phase?
9. Is Stage 4 review-only, with archive/closeout/integration deferred until implementation PASS and reversible to the frozen baselines?
10. Are all Trellis/JSON/JSONL/path/fence/hash/full-suite gates specified and planning status truthful?

## Required implementation output

After all four stages and gates, mark only `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. Independent implementation PASS, acceptance, archive, closeout, integration and RKP-2 Stage 6 remain later gates.
