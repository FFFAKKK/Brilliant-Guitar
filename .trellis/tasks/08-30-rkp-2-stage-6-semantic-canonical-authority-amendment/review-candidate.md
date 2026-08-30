# Review Candidate — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Status

**FIFTH E2 BOUNDED REPAIR CANDIDATE — TARGETED INDEPENDENT IMPLEMENTATION REREVIEW PENDING**

The bounded repair planning authority `eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7` passed independent planning review at `P0/P1/P2=0/0/0`. A0 and E1R2 are complete and independently rereviewed PASS. Historical E2 audits `2050f38689d0fcec8820ee8ef97925c5403e8a9e`, `c7aa242b359401f76cd05944404cfc686854bec4`, `27b65197c3c236577e6882fac712659931cacfb6`, and `911e2858583ccd8cc032d2bea241ef372e9522f9` returned `1/4/0`, `1/3/0`, `0/3/0`, and `0/3/0`. The fourth repair `e61db6c634b7163ed8637cf6110995b366f3919e` is historical. The fifth audit `4356b07c5dd5d6b865210ba26e8416330487f3bd` returned `P0/P1/P2=0/1/0`; technical commit `bcd7c7f2adda3d16c53bb0e533500f7ead0c0d1b` is the current candidate. It preserves the frozen 180,000ms PowerShell workload deadline and 205,000ms Node outer guard, makes taskkill helper errors wait for actual close or a bounded helper-reap guard, and makes PowerShell accept taskkill reaping only after the second `WaitForExit` result. Focused worker gates passed on current Node and Node 20.20.2 with `18` pass, `1` explicit real-stress skip, and `0` fail; workspace-law is `11/8/3`, where the only failures are the three preserved historical unaccepted-child gates. E3, S6.2, S6.3, archive, integration, cutover, qualification, RKP-3, and push remain unauthorized.

## Review focus

1. Confirm the raw/canonical drift was repaired as an evidence assertion defect, not a Foundation/Contracts/product defect.
2. Confirm the implemented seam has one export, two strict decodes, and two Rust canonical encodes, with no duplicated persistent metric.
3. Confirm `semanticEqual` and `canonicalBytesEqual` have the exact distinct meanings documented here.
4. Confirm raw and Rust canonical SHA anchors retain distinct diagnostic roles.
5. Confirm E1R2-A made no repository writes and E1R2-B is the first small, test-only noncanonical regression without stress duplication or E2 start.
6. Confirm the exact four technical paths, six lifecycle paths, fifteen-path planning diff, parent ownership, original immutable hashes, and all protected paths.

## Required result

The current gate is the dedicated independent fifth E2 bounded-repair implementation rereview of `bcd7c7f2adda3d16c53bb0e533500f7ead0c0d1b`. It cannot authorize E3, S6.2 or S6.3.
