# Review Candidate — RKP-2 Cross-platform Full Test Runner Contract Repair

## Verdict requested

`PLANNING REVIEW REQUIRED` for the exact docs/test-governance-only candidate based on `eed4871a86191783d539b7d4097be3627e98e4a0`.

This candidate claims only planning completeness. It does not claim implementation, independent PASS, Stage 6 readiness, acceptance/archive, qualification, push, RKP-3 or default-runtime cutover.

## Candidate claim

The plan replaces environment-dependent quoted-glob discovery with a single deterministic test-infrastructure owner using official stable `node:test` `run({ files })`. It freezes root/traversal/link/file/order/dedup/resource boundaries, immutable manifest count/hash, exact files-array equality, stable reporting and complete exit propagation. It supports Node 20.20.2 and 24.15.0 by using their common `files`/`concurrency` options and verified default process isolation from repo CWD.

The plan dynamically discovers later tests and never hard-codes 77/557. The 77-file, 557-discovered, 556-pass, 1-expected-skip, 0-fail result is only the current evidence baseline. Package-lock, product/Rust/native/CVN/qualification code, existing individual test contents, public inventories and TypeScript default remain protected.

## Governance claim

The new child is the sole test-infrastructure owner. RKP-2 Stage 6 consumes an accepted runner only after independent implementation review, acceptance/archive and explicit integration into a new prerequisite base. Stage 6 remains separately unauthorized.

RKP-2 keeps its 21 technical paths and adds exactly twelve child planning artifacts to its ten coordination paths, producing 22 literal coordination paths. The existing two JSONL successor files remain byte-identical. Five LF-normalized content hashes freeze the final RKP-2 JSONLs/design/implement/matrix; no wildcard or task-directory exemption is introduced.

## Independent review focus

1. Does root/link traversal reject every link before follow, handle Windows junctions and preserve spaces/Unicode/deep paths?
2. Is the code-unit ordering/dedup/manifest algorithm deterministic and detached?
3. Is actual `run()` input exactly the manifest projection, with missing/partial top-level file outcomes detectable?
4. Are failure, cancellation, runner, stream and reporter errors guaranteed nonzero only after reporter completion?
5. Is the Node 20/24 option contract correct and free of unsupported `cwd`/`isolation` options?
6. Do focused tests cover all hostile/partial/version/shell-entry cases without a production fault hook?
7. Are technical/lifecycle allowlists literal, package-lock excluded and protected paths zero-delta?
8. Is there exactly one owner, with RKP-2 Stage 6 blocked and separately authorized?
9. Are all Trellis/JSON/JSONL/path/fence/hash/full-suite gates specified and planning status truthful?

## Required output

Return `PASS` only at P0/P1/P2=`0/0/0`; otherwise return a bounded planning repair. Implementation remains forbidden until the owner receives the independent verdict and separately authorizes activation.
