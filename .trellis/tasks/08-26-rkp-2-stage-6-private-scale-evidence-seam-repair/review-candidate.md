# Private Scale Evidence Seam Repair — Targeted Planning Rereview Candidate

## Requested verdict

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`

The first candidate `df686882efa30f489da138d2730acbdd4fb9cd30` received P0/P1/P2=`0/2/0`. This bounded repair closes only:

1. implementation-time planning authority mutability;
2. unresolved private libtest, owner-probe, sentinel, process and failure-protocol decisions.

No implementation, start, acceptance, archive, integration, push, Stage 6 S6.2, cutover, qualification or RKP-3 is claimed.

## P1-1 closure

Nine named planning files are immutable after this commit. Their LF-normalized UTF-8 SHA-256 digests are recorded in `task.json.meta.immutable_planning_authority` and must be mechanically recomputed during every E0-E3 gate. The mutable lifecycle allowlist is exactly eight named paths. The future technical allowlist remains exactly five. A changed immutable digest, sixth technical path or ninth lifecycle path fails closed.

## P1-2 closure

- Exact libtest: `indices::tests::rkp2_stage_6_private_scale_evidence_v1`.
- Exact env: `BRILLIANT_RKP2_SCALE_REQUEST_V1`.
- Exact Cargo command/artifact predicate and exact execution argv are frozen.
- Exact two-step owner probe resolves Event `cvn7-e-00-0000-0-0` once and directly queries private `DerivedIndices` for Voice `cvn7-v-00-0000-0`; deltas are `1/1/0` and separate from import/rebuild totals.
- Exact Rust/process prefixes, internal success shape, final success/rejection shapes, numeric ranges and forbidden fields are frozen.
- A closed 18-code failure/details union and exact first-failure precedence are frozen; later cleanup cannot replace the primary.
- PowerShell parameter types/values, exact `pwsh` call, temporary env, hidden child, per-poll refresh/RSS/caps, timeout/tree termination/reap, redirect flush and cleanup are frozen.
- E1 has no stress request; E2 owns sole fixture/request generation and first real run; E3 uses a fresh request for evidence freeze.

## Invariants retained

Single fixture owner, exact `102400` Events / `51200` Notes / `18` Extensions, bytes `15013904/15013932`, frozen counters, five technical paths, S6.1 retained, S6.2/S6.3 false, TypeScript default and candidate workspace-law `6/9` fail-closed state remain unchanged.

## Review focus

1. all nine hash inputs and eight mutable paths are exact and non-overlapping;
2. Cargo predicate yields exactly one Windows libtest and no filename heuristic;
3. owner probe cannot double-count entity lookup;
4. internal/final shapes and all failure details contain no open field;
5. precedence and cleanup semantics preserve the first failure and zero partial evidence;
6. the PowerShell timer excludes compilation and process cleanup is bounded;
7. E1/E2/E3 request/evidence ownership is executable without a sixth technical path;
8. parent projections keep S6.1 and pause S6.2/S6.3.
