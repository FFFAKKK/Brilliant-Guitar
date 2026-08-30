# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**READY FOR INDEPENDENT IMPLEMENTATION REVIEW**

The bounded repair planning authority `eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7` passed independent planning review at `P0/P1/P2=0/0/0`. A0, E1R2-A, E1R2-B, and E1R2-C are complete; the atomic technical head is `db7ab2a4080c78335cccc484a32ea9baa0957a9b`. Fresh detached Node 24.15.0 and Node 20.20.2 full runs agree on the 79-file manifest SHA-256 `afbd0246012b61c3670b31cc01180c4a90586e30ac3ff177d91cddfc2eb09357` and `592/588/1/3` tests/pass/skip/fail; those three failures are the preserved historical workspace-law fail-closed children, not E1R2. This candidate awaits independent implementation review and does not authorize E2, E3, S6.2, S6.3, archive, integration, cutover, qualification, RKP-3, or push.

## Review focus

1. Confirm the raw/canonical drift was repaired as an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the implemented seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm E1R2-A made no repository writes and E1R2-B is the first small, test-only noncanonical regression without stress duplication or E2 start.
6. Confirm the exact two technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

The next gate is E1R2-D, a dedicated independent implementation audit. Its PASS may request, but cannot itself authorize, a separate E2 user authorization.
