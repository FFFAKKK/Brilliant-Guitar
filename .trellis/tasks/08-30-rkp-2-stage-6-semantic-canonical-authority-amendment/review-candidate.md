# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**READY FOR TARGETED INDEPENDENT PLANNING REREVIEW**

This is a docs-only bounded repair on planning candidate `5ef997350a4a7c992be4d73f724e2d95b850d773`. Its first independent planning audit returned `P0/P1/P2=0/1/0` for exactly one finding: E1R2-A incorrectly required a no-write run of a noncanonical small request that does not exist until E1R2-B. The repair makes E1R2-A an accepted authority/source characterization and defers the first regression addition/run to the atomic E1R2-B commit. It is not an implementation candidate, does not authorize `task.py start`, and does not claim a PASS.

## Review focus

1. Confirm the raw/canonical drift is an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the planned seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm E1R2-A is executable without repository writes or a nonexistent fixture, and that E1R2-B is the first small, test-only noncanonical regression without stress duplication or E2 start.
6. Confirm the exact two technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

An independent reviewer may return only a planning result. Even a PASS does not start A0/E1R2, E2, E3, S6.2, or S6.3 without separate user authorization.
