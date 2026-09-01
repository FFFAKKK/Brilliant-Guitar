# Current E3 Workspace Law Gap Audit

## Verdict

`RETURN FOR BOUNDED PLANNING REPAIR`，P0/P1/P2=`0/1/0`。

The E3 workload and evidence succeeded. The remaining defect is a workspace-law time-projection error, not a Rust/product regression and not an invalid E3 fixture.

## Live source state

- Worktree: `.worktrees/rkp-2-stage-6-semantic-canonical-authority-amendment`
- HEAD: `4ad23773e9c9e1081667a4eccb84cc464b85bc89`
- Tree: `9dbcef77fbcc258e4fe96fdfb2b28839f095d610`
- Dirty paths: exactly the original eight E3 evidence/lifecycle paths.
- Technical dirty paths: zero.

## Fresh E3 result

| Field | Value |
| --- | ---: |
| measures | 400 |
| parts | 16 |
| voices | 12,800 |
| events | 102,400 |
| notes | 51,200 |
| extensions | 18 |
| protocol SHA-256 | `64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862` |
| Rust workload | 12,964,590 us |
| wall elapsed | 14,077,309 us |
| peak working set | 821,886,976 bytes |
| exit / timeout / partial | `0 / false / false` |

## Live test evidence

Command:

```powershell
npm run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
```

Result on the preserved E3 source state:

```text
tests 11
pass 7
fail 4
```

Known historical failures:

1. `implementation changes stay inside the literal RKP-2 allowlists`
2. `part owner repair stays anchored to its accepted six-path wire contract`
3. `Stage 6 hostile and resource evidence consumes the existing private Rust seams`

Incremental E3-only failure:

```text
Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts
```

Its actual-minus-expected paths are:

```text
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/research/implementation-evidence.md
```

All five are explicitly inside the original E3 eight-path lifecycle allowlist.

## Root cause anchors

- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts:281-288` defines an E2-era six-path lifecycle set.
- `:680-691` projects E1R2 history to live `HEAD` and unions dirty/staged/untracked.
- `:694-706` projects E2 history to live `HEAD` and unions dirty/staged/untracked.
- `:1185-1199` asserts those live projections against historical E2 sets.
- `:1231` and `:1254-1257` correctly keep the 08-30 child out of E3 ownership; this part remains unchanged.

## Smallest sufficient repair

1. Freeze historical E2 at `4ad23773...`.
2. Add a separate live E3 final-state projection.
3. Assert the exact original eight E3 paths, one technical law file and this task's exact governance paths as disjoint sets.
4. Prove the fourth failure closes while the three historical failures remain visible.

No second technical file is justified by the evidence.
