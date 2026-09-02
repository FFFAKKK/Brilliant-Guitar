# RKP-2 Stage 6 tracked-byte/EOL prerequisite implementation evidence

## Current outcome

`I0 STOPPED`; I1, I2 and I3 were not started. The task remains `in_progress`, the active implementation-child pointers remain unchanged, `e3_execution_count=0`, and no S6.2 evidence or qualification artifact was created.

The mandatory pre-I1 Rust verifier rejected the exact audited patch model. This is an audited-planning ownership mismatch, not a Rust implementation failure and not permission to weaken the verifier.

## Frozen activation source

- A0/I0 source commit: `13a3a6a923f6af6744ef4aa60291a622f3dff989`
- source tree: `1cfbecf6934702d1ba34ed03c2e6bf0f6d3e94f0`
- branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`
- activation subject: `docs(rkp-2): activate EOL portability prerequisite`
- reviewed planning HEAD: `f39c72bfba28664b1772bf19855d74c765005f14`
- planning audit: `01a06123-b6c9-78a0-8216-9c8f1d53a061`, P0/P1/P2=`0/0/0`

## Valid partial I0 evidence

- Node executable/version: `D:\nvm4w\nodejs\node.exe`, `v24.15.0`
- compiled focused test: `dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js`, 260445 bytes, SHA-256 `55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961`
- focused control: 11 total / 7 pass / 4 fail / 0 skip
- full control with the same existing native artifact: 611 total / 605 pass / 4 fail / 2 skip
- full-test manifest: 80 paths, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`
- deterministic technical patch: 4890 bytes, SHA-256 `d991d45ed00f42f31f7dada849bc5e7a114d04f6fb680cd6836f26df4718d209`
- expected-transition V1/V2 synthetic committed trees changed only the one new evidence file between variants and produced byte-identical four-signature records
- no expected-transition signature differed from the committed I0 control record; the earlier uncommitted-worktree observation was discarded as invalid

## Decisive verifier rejection

The accepted design requires the metrics hunk to be contained by the named function `rkp2_stage_6_private_scale_evidence_v1`. At `I0_SOURCE_HEAD`:

- that ignored function starts at `indices.rs:1924` and closes at `indices.rs:1938`;
- the real owner `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores` starts at `indices.rs:2024`;
- the deterministic patch changes the metrics source inspection at `indices.rs:2055`;
- therefore the hunk range is outside the audited allowed function.

The same source also contradicts the design statement that the metrics inspection is inside the ignored large test: the ignored function ends before the non-ignored metrics test begins.

Verifier source at rejection: 22266 bytes, SHA-256 `43aa2e7870d0894bf59770d88a6d098815b2975a3f38e9f6d3a920220941a230`.

Decisive error:

```text
AssertionError [ERR_ASSERTION]: crates/brilliant-kernel-runtime/src/indices.rs: hunk is outside one permitted function
hunk: old 2055,1; new 2055,2
audited rkp2_stage_6_private_scale_evidence_v1 range: old 1924-1938; new 1924-1938
```

## Required planning repair before any I1 retry

The smallest repair is docs-only and must be independently re-audited:

1. replace the incorrect allowed owner with `indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores` everywhere the six-function reconstruction contract is authoritative;
2. correct the ignored/non-ignored ownership description without changing the technical four-file patch;
3. regenerate and pass all five verifier self-tests at a new clean reviewed planning HEAD;
4. obtain new explicit implementation authorization against that new audited planning object.

No technical file was edited or committed in this stopped run.
