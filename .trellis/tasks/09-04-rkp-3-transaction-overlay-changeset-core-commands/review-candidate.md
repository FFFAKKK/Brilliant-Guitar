# Review Candidate — RKP-3

## C10 result — 2026-09-04

The bounded direct implementation review inspected the frozen C9 candidate
`bfb02ca07fa987b1d1ab00b3c8e21c6fda3a30cd`. It found one P2 defect: failures
raised by final transaction invariants or commit preflight discarded the
detached attempted-work metrics and returned a zeroed metric record.

The repair commit is
`3ca82f1fcf68070e6c775d0848839864dbc87c71` (tree
`327ab84bb7c355e560c6cb4071d04a5e473e4b3a`). It preserves attempt metrics on
both failure exits and adds a zero-delta final-batch regression. Targeted
rereview and the complete gates leave P0/P1/P2 at `0/0/0`.

This was a direct Codex inline review under the active execution mode. It is
not represented as a separate-session independent review. The technical PASS
permits only a separate owner acceptance/archive decision; it does not itself
authorize lifecycle closeout or RKP-4.

## Original decision request

The requested review input was the commit containing the original version of
this file, resolved from
`codex/rkp-3-transaction-overlay-changeset-planning` immediately before C10.

## Immutable comparison points

- Accepted RKP-2 base:
  `6d0956c970f4414cb61e0f3d7148672a6e635032`.
- Reviewed RKP-3 planning authority:
  `78660bb63e249f7bbfec848b9b19e16d7dc55c25`.
- Initial RKP-3 technical source:
  `0861f40b90599aa48a9859d385590175f8af2bbd`.
- Initial technical source tree:
  `ba17b7de734885d73f6816743adc9a97bb3f7d00`.
- Post-review technical source:
  `3ca82f1fcf68070e6c775d0848839864dbc87c71`.
- Post-review technical source tree:
  `327ab84bb7c355e560c6cb4071d04a5e473e4b3a`.
- Candidate path delta from planning: exactly 36 tracked paths, all within the
  literal C0-C9 allowlist.

## Review scope

Inspect the implementation rather than re-running every historical audit:

1. Overlay/ChangeSet locality, stable logical addresses, inverse order, and
   complete commit-plan index deltas.
2. Checked revision, expected no-op/failure ordering, atomic batch visibility,
   rejection zero delta, and one live adoption.
3. Exact semantics of the 28 handlers, with focused attention on aggregate
   insert/remove/move and range commands.
4. Capacity accounting and invariance of local/range work against unrelated
   document size.
5. Native request/response caps, mutex/panic/handle cleanup, detachment, and
   the exact three private exports.
6. Honest oracle projection, predecessor compatibility, protected-path zero
   delta, unchanged dependency graph, and TypeScript remaining default.

Do not review RKP-4 history/events/replay, official qualification, public API
cutover, plugin migration, or support policy; those are outside RKP-3.

## Expected verdict boundary

- Any P0/P1/P2 finding returns a narrowly scoped repair and targeted rereview.
- P0/P1/P2 `0/0/0` permits only a separate owner acceptance/archive decision.
- This candidate does not authorize acceptance, archive, RKP-4, qualification,
  runtime cutover, or push.

The operator's bounded C9 stage review remains recorded separately. C10 did
not inherit its verdict: it reread the scoped implementation, found and
repaired the metrics defect above, and then reran the targeted and complete
gates.
