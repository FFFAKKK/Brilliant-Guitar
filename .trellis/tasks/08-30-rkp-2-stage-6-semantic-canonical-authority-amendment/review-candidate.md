# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**E2 BOUNDED REPAIR CANDIDATE — TARGETED INDEPENDENT IMPLEMENTATION REREVIEW PENDING**

The bounded repair planning authority `eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7` passed independent planning review at `P0/P1/P2=0/0/0`. A0, E1R2-A, E1R2-B, and E1R2-C are complete; the atomic technical head is `db7ab2a4080c78335cccc484a32ea9baa0957a9b`. The targeted independent E1R2 implementation rereview passed at `ca670fdfba250c1590b6e6d387eaef185211cb8a` with `P0/P1/P2=0/0/0`. Historical E2 audit head `2050f38689d0fcec8820ee8ef97925c5403e8a9e` returned `P0/P1/P2=1/4/0`; the bounded repair `b328786289323d8de725f777d2bd55eaa2732b74` is now the candidate for targeted independent E2 implementation rereview. E3, S6.2, S6.3, archive, integration, cutover, qualification, RKP-3, and push remain unauthorized.

## Review focus

1. Confirm the raw/canonical drift was repaired as an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the implemented seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm E1R2-A made no repository writes and E1R2-B is the first small, test-only noncanonical regression without stress duplication or E2 start.
6. Confirm the exact two technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

The current gate is the dedicated independent E2 bounded-repair implementation rereview of `b328786289323d8de725f777d2bd55eaa2732b74`. It cannot authorize E3, S6.2 or S6.3.
