# Private Scale Evidence Seam Repair — Targeted Planning Rereview Candidate

## Requested verdict

`READY FOR FINAL TARGETED INDEPENDENT PLANNING REREVIEW`

The first candidate `df686882efa30f489da138d2730acbdd4fb9cd30` received P0/P1/P2=`0/2/0`. This bounded repair closes only:

1. implementation-time planning authority mutability;
2. unresolved private libtest, owner-probe, sentinel, process and failure-protocol decisions.

No implementation, start, acceptance, archive, integration, push, Stage 6 S6.2, cutover, qualification or RKP-3 is claimed.

The first bounded repair candidate `176fd3670d3015631fc1553a59cc8e4d3a941221` received a second targeted result P0/P1/P2=`0/1/0`. This second repair changes only two related contract details: the probe now follows the real private APIs, and termination/reap are secondary statuses rather than unreachable primary codes.

## P1-1 closure

Nine named planning files are immutable after this commit. Their LF-normalized UTF-8 SHA-256 digests are recorded in `task.json.meta.immutable_planning_authority` and must be mechanically recomputed during every E0-E3 gate. The mutable lifecycle allowlist is exactly eight named paths. The future technical allowlist remains exactly five. A changed immutable digest, sixth technical path or ninth lifecycle path fails closed.

## P1-2 closure

- Exact libtest: `indices::tests::rkp2_stage_6_private_scale_evidence_v1`.
- Exact env: `BRILLIANT_RKP2_SCALE_REQUEST_V1`.
- Exact Cargo command/artifact predicate and exact execution argv are frozen.
- Exact two-step owner probe snapshots `store.metrics`, calls real `store.lookup_entity(&stable_id)`, snapshots again, then uses a fresh `Rkp2StoreMetrics::default()` with `store.indices.lookup_owner(entity, &mut owner_probe_metrics)`. Separate `entityProbe`/`ownerProbe` records prove the exact deltas and stay outside import/rebuild totals.
- Exact Rust/process prefixes, internal success shape, final success/rejection shapes, numeric ranges and forbidden fields are frozen.
- A closed sixteen-code primary failure/details union and exact first-failure precedence are frozen. Termination/reap live only in `terminationStatus`/`reapStatus`; cleanup uses `cleanupStatus`; none replaces an earlier primary.
- PowerShell parameter types/values, exact `pwsh` call, temporary env, hidden child, per-poll refresh/RSS/caps, timeout/tree termination/reap, redirect flush and cleanup are frozen.
- E1 has no stress request; E2 owns sole fixture/request generation and first real run; E3 uses a fresh request for evidence freeze.

## Invariants retained

Single fixture owner, exact `102400` Events / `51200` Notes / `18` Extensions, bytes `15013904/15013932`, frozen counters, five technical paths, S6.1 retained, S6.2/S6.3 false, TypeScript default and candidate workspace-law `6/9` fail-closed state remain unchanged.

## Review focus

1. all nine hash inputs and eight mutable paths are exact and non-overlapping;
2. Cargo predicate yields exactly one Windows libtest and no filename heuristic;
3. owner probe matches the real method signatures, produces two distinct records and cannot double-count entity lookup;
4. internal/final shapes and all failure details contain no open field;
5. cap/timeout remain primary through termination/reap failure, clean-path cleanup alone maps to `process.cleanup-failed`, and every rejection has zero partial evidence;
6. the PowerShell timer excludes compilation and process cleanup is bounded;
7. E1/E2/E3 request/evidence ownership is executable without a sixth technical path;
8. parent projections keep S6.1 and pause S6.2/S6.3.
