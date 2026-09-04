# Operator Handoff — RKP-3

## C0 activation — 2026-09-04

The owner replied `继续` to the explicit RKP-3 implementation-activation
question. This authorizes C0 through C9 implementation and candidate freeze
only. It does not authorize owner acceptance, archive, RKP-4, qualification,
default-runtime cutover, or push.

### Immutable entry state

- Accepted RKP-2 base commit:
  `6d0956c970f4414cb61e0f3d7148672a6e635032`.
- Accepted RKP-2 base tree:
  `c3beb887b9a81e95e21e3a29fa67a4cc36e496b3`.
- Reviewed RKP-3 planning commit:
  `78660bb63e249f7bbfec848b9b19e16d7dc55c25`.
- Reviewed RKP-3 planning tree:
  `ad1d752ad1b53d994b30cf6f9dcc533508e13cc7`.
- Branch: `codex/rkp-3-transaction-overlay-changeset-planning`.
- Worktree: `.worktrees/rkp-3-transaction-overlay-changeset-planning`.
- Task: `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands`.
- The source RKP-2 worktree is clean.
- The seven-crate list and every Cargo manifest/lock byte equal the accepted
  base. TypeScript remains the default runtime.

### Frozen planning artifact hashes

All hashes are SHA-256 over the tracked working-tree bytes at planning commit
`78660bb`.

| Artifact | SHA-256 |
| --- | --- |
| `prd.md` | `337ffd0dbb3ad4feb9d66fcff00ae2d6cba66986facea8643dec3b9c79d7e5ec` |
| `design.md` | `2dcb73035e4feda7869b1d47f49ec51ea7c0b69695aa21692331732b3f430b82` |
| `implement.md` | `ae932bd2947839a7523bcc792dbe0395febd39f16b941c19c176e8dde7822b5c` |
| `research/authority-and-runtime-gap.md` | `531b16f0e83e5ec801f0c8118639121a64217e517895cda370c832f72e2f9bd4` |
| `research/changeset-overlay-and-capacity-decision.md` | `d040d71974dc17af2a0a3a4b725321f0c1a1bb1840cb9dccb70158e1e0c2d49d` |
| `research/file-test-and-rollback-matrix.md` | `aeda62c11de1b66f5bfee8a237f8e1deb93199c775812b63d921721c99db32e8` |
| `research/planning-self-audit.md` | `732b30bb5f864e8da7314d0599cb4668ce4669046f05721fd3e506009e79bee8` |

### Frozen compatibility inputs

| Input | SHA-256 |
| --- | --- |
| `test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json` | `3814ed1da21f8de7135a71ab3e4b0a1ba888a76e6163ed1868756353005dabf7` |
| `test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl` | `9761691b07082f5434126f2048f91ad415f91418799ec6bf316c2ae4d2fb9cb2` |
| `test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json` | `7059cb088d064d4d4450bd23830ac6bce0259070d6e08ce54b5b3d4c4e0cde05` |
| `Cargo.toml` | `3cf04d6838c9af0ae72ad96477c544fc61f8a5e82993240a738c3405460a9e59` |
| `Cargo.lock` | `8e50b676c46f075e25665d923fac1fd4159cecf0864605aac38f8bd6b1d880f3` |

### Current execution state

- Trellis task status is `in_progress`.
- The parent has this task as its sole current/active implementation child and
  no current planning child.
- C0 coordination is complete; C1 strict command contracts and checked
  document revision is the next implementation step.
- No production Rust or TypeScript source changed in C0.
- Any cap-compatibility proof failure in C2 returns the task to planning.

## C9 implementation candidate freeze — 2026-09-04

RKP-3 C1 through C9 are implemented on technical source commit
`0861f40b90599aa48a9859d385590175f8af2bbd` (tree
`ba17b7de734885d73f6816743adc9a97bb3f7d00`). The review target is the commit
that contains this handoff, `review-candidate.md`, and
`research/implementation-evidence.md`; resolve that commit from the branch
before starting C10.

### Delivered private surface

- An indexed transaction overlay with copy-on-first-write order handling.
- An ordered, reversible eleven-operation `ChangeSet` using stable logical
  addresses; physical handles remain commit-plan internals.
- Checked-revision submit, one atomic store/index adoption, discard-only
  rejection, exact batch visibility, and all 28 Core command routes.
- Exactly three private native exports: create, read, and Stage-3 submit.
  TypeScript remains the application default.

### Candidate evidence

- Rust 1.97.1 format/check/test/Clippy passed; workspace test result is 136
  passed, 1 ignored, 0 failed. Rust 1.88.0 workspace check passed.
- TypeScript typecheck and build passed.
- RKP-1 Node bridge `9/9`, RKP-1 workspace `6/6`, RKP-2 combined `19/19`,
  and RKP-3 combined `20/20` passed.
- Clean full suite: 631 discovered, 629 passed, 0 failed, 2 intentional skips.
- Source and staged native addon SHA-256 are both
  `0e7b561a5dd6a80cbc3ebd2cb434b9226a3ca0166067e908812b022291ce5371`.
- Frozen oracle, scenario, and qualification hashes remain byte-identical to
  C0. Cargo manifests and the seven-crate graph remain unchanged.
- Local-edit and single-event range counters are invariant between 4- and
  256-measure documents; all four global-work counters and
  `entitiesVisited` are zero.

### Bounded stage review

The operator reviewed only C9-critical compatibility and safety boundaries.
The review repaired the historical RKP-2 checkout anchor, removed a forbidden
Clippy allow by relocating tests, and preserved the prior explicit napi macro
count while keeping the runtime Stage-3 export exact. The post-repair full
suite is green; no remaining P0/P1/P2 blocker was found in this bounded review.
This is not the dedicated independent C10 implementation review.

### Next gate

C10 is a fresh, read-only implementation review of the frozen candidate.
Acceptance, archive, RKP-4 creation, official qualification, runtime cutover,
and push remain unauthorized. Any P0/P1/P2 finding returns only its bounded
repair; otherwise the owner receives a separate acceptance/archive decision.

## C10 direct implementation review — 2026-09-04

The direct inline review inspected only the frozen RKP-3 topics. It found one
P2: final-invariant and commit-preflight rejections zeroed the response's
detached attempted-work metrics even though the design requires failed
transactions to report attempted work without changing committed metrics.

Commit `3ca82f1fcf68070e6c775d0848839864dbc87c71` repairs both exits and adds the
final-invalid-batch zero-delta regression. The post-repair technical source
tree is `327ab84bb7c355e560c6cb4071d04a5e473e4b3a`. Rust workspace tests are now
137 passed, 1 ignored, 0 failed; all format/check/Clippy/MSRV gates pass. The
focused Node gates remain `9/9`, `6/6`, `19/19`, and `20/20`; the clean full
suite is 631 discovered, 629 passed, 0 failed, 2 intentional skips. Source and
staged native addon SHA-256 are both
`970d8987076786d50dfea6b5c4969ad3d16a5a043741eeba3bf1daa85da72002`.

Targeted rereview leaves P0/P1/P2 at `0/0/0`. This was an inline main-session
review and is not claimed as a separate-session independent review. The next
gate is the owner's acceptance/archive authorization decision. RKP-4,
qualification, default-runtime cutover, and push remain unauthorized; the
default runtime remains TypeScript.

## Owner acceptance and native archive — 2026-09-04

The owner replied `那继续吧` after the next step was explicitly identified as
accepting and archiving RKP-3 and synchronizing the parent. The accepted audited
technical source is `3ca82f1fcf68070e6c775d0848839864dbc87c71`; the C10 record is
`88d96574e4b6f58d92bef8f849176e72667fdb3b`; and archive compatibility is
`560fd89d32026cdc41c3cf0df65285e99e015456`.

The task is archived under
`.trellis/tasks/archive/2026-09/09-04-rkp-3-transaction-overlay-changeset-core-commands`.
The parent has no current implementation child. TypeScript remains default,
while RKP-4 planning, qualification, runtime cutover, and push remain separate
unauthorized gates.
