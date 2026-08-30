# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**A0 ACTIVATED — E1R2 IN PROGRESS; NOT YET AN IMPLEMENTATION CANDIDATE**

The bounded repair candidate `eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7` passed its independent planning review at `P0/P1/P2=0/0/0`. The native A0 activation is complete, and the user has authorized A0/E1R2 only. E1R2-A remains a no-write authority/source characterization; E1R2-B is the first regression-producing technical stage. This is not yet an implementation candidate and does not authorize E2, E3, S6.2, S6.3, archive, integration, cutover, qualification, RKP-3, or push.

## Review focus

1. Confirm the raw/canonical drift is an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the planned seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm E1R2-A is executable without repository writes or a nonexistent fixture, and that E1R2-B is the first small, test-only noncanonical regression without stress duplication or E2 start.
6. Confirm the exact two technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

The next independent review is E1R2-D after E1R2-B/C. Its PASS may request, but cannot itself authorize, a separate E2 user authorization.
