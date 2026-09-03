# E2 blocker and dedicated audit evidence

## Source records

- S6.2 operator task: `01a060ad-7b6a-7a53-abca-f902913d06be`.
- S6.2 dedicated implementation/blocker auditor: `01a060d4-9bdb-7b71-b8be-868ff5685d9e`.
- S6.2 planning HEAD: `02ef4af24bc3708e8e31d052f9cd69e81b955797`.
- Activation commit: `5c709b80ff5a7a9836a46f665685d37a5694630c`.
- E1 candidate: `c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b`.
- E1 tree: `b6687e879a5814a68ee523bf02b9a40839e6c3f3`.

## Operator result

The operator completed A0 and E1, then stopped at the first E2 Cargo failure:

- focused Node classifier: `11 tests / 8 pass / 3 historical failures / 0 skipped`;
- full Node classifier: `611 / 606 / 3 / 2`;
- manifest: 80 files, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`;
- worktree clean;
- E3 executions: zero;
- no `implementation-evidence.md` and no E4 candidate.

The failed command was:

```text
C:\Users\ATOM\.cargo\bin\cargo.exe +1.97.1 test --workspace --all-targets --locked
```

`fmt` and Rust 1.97.1 workspace `check` passed before the failure.

## Dedicated audit verdict

`RETURN`, P0/P1/P2=`0/2/1`.

### P1-1

The native test failure is a checkout-byte/test-portability prerequisite defect:

- system Git uses `core.autocrlf=true`;
- no `.gitattributes` entry governs the affected Rust or workload paths;
- repository blobs are LF while the clean working tree is CRLF;
- four non-ignored `include_str!` source-shape assertions use LF-only delimiters;
- a fifth LF-sensitive metrics extraction is inside the non-ignored `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores`; it happened to pass because the missing delimiter left an unbounded suffix, while the ignored scale test contains no permitted edit;
- normalization in memory makes all five checks operate correctly.

The auditor classified the root cause as `B` with accompanying planning gap `D`, not Rust product logic defect `C` and not S6.2 worker defect `A`.

### P1-2

The E1 Workspace Law implementation does not yet mechanically prove its evidence provenance contract. It checks ancestorhood and freshness booleans, but does not yet require a strict source-before-evidence commit, exact source-to-evidence diff, evidence absence at source or archived sentinel non-reuse. This remains successor S6.2 ownership and is deliberately excluded from the EOL prerequisite.

### P2-1

The diagnostic S6.2 `operator-handoff.md` still said E1 had not started. The new S6.2 planning task must replace that stale projection; this prerequisite does not modify the old branch.

## Audit disposition

- Preserve the E1 worker/test logic conceptually.
- Do not call `c3c4d198...` an accepted evidence source.
- Do not reuse its working-tree raw hashes.
- Do not run E3.
- Create and independently audit the tracked-byte/EOL prerequisite.
- After integration, create a new S6.2 plan and close the provenance P1 there.

## Prerequisite planning audit history

Dedicated planning auditor `01a06123-b6c9-78a0-8216-9c8f1d53a061` returned:

1. `538abbdaee079aaf5df800f09d192fbb777174d9`: P0/P1/P2=`0/2/0`; the product-region proof allowed a suffix bypass and Node failures were frozen only by title/count.
2. `ad56a0307bd2ef429a2693e6235f7a77a4c71ece`: P0/P1/P2=`0/2/0`; the Rust suffix bypass was closed, but the Node programmatic-runner event shape was incorrect and all-four-signatures-equal contradicted the planned path changes.
3. `5d08d5c1f7442b6105e95348ba2220c209c80e5b`: P0/P1/P2=`0/1/0`; the two Node repairs were confirmed executable, but task meta still authorized the whole child directory while PRD/design/implement required six literal candidate coordination paths.

4. `f39c72bfba28664b1772bf19855d74c765005f14`: P0/P1/P2=`0/0/0`; implementation was authorized separately and created clean A0 `13a3a6a923f6af6744ef4aa60291a622f3dff989`.

That attempt stopped in I0 at `fa756bb3755ab4f9dcc8bc1b5e5ada571102927f`, before I1 and with zero technical-file delta. The mandatory verifier proved that the planned metrics hunk at `indices.rs:2055` is owned by `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores` (starting at line 2024), not by the already closed ignored function `rkp2_stage_6_private_scale_evidence_v1` (lines 1924-1938). Replaying the corrected owner during planning repair also proved that the old verifier's lexical fixture expected line `14` although its matched module close is line `13`, and its unrelated-hunk negative named nonexistent `fn fixture`; the repaired contract uses line `13` plus the real unique unpermitted function `indices_cover_entity_owner_content_extension_and_core_references` without weakening lexical coverage. The committed V1/V2 expected lanes were content-insensitive and all four expected signatures equalled control; this is valid evidence that equality/inequality must not be presumed. The current bounded repair corrects only these executable planning facts, invalidates reuse of the old A0/temp lanes, and requires a new dedicated planning rereview plus new user authorization.
