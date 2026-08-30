# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**READY FOR INDEPENDENT PLANNING REVIEW**

This is a docs-only planning candidate based on `d14d73117e03822a52fd19c55f3024cb2b73ef45`. It is not an implementation candidate, does not authorize `task.py start`, and does not claim a technical PASS.

## Review focus

1. Confirm the raw/canonical drift is an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the planned seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm the noncanonical regression is small, test-only, and does not duplicate the stress fixture or start E2.
6. Confirm the exact two technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

An independent reviewer may return only a planning result. Even a PASS does not start A0/E1R2, E2, E3, S6.2, or S6.3 without separate user authorization.
