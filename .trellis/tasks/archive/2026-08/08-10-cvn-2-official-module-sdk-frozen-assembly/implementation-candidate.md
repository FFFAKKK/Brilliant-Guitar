# CVN-2 Implementation Candidate Evidence

## State

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-2-official-module-sdk-frozen-assembly`
- Branch: `codex/cvn-2-official-module-sdk-frozen-assembly`
- Activation/base HEAD: `faaf424cf370bbf055ad2cf9862e472a50edc22f`
- Accepted source/test candidate: `e203136a0e6d995d543dbe615be27dc4ca38d6c1`
- Task status: `in_progress`
- Candidate form: committed after the exact reviewed tree passed independent re-review
- Independent implementation review: PASS, P0/P1/P2=`0/0/0`
- Archive: pending as the next separate lifecycle action

## Implemented boundary

- Internal `KernelErrorBase<Code>` shared by the unchanged Core error branch and the SDK module error branch.
- Separate official-module SDK entry with exactly 8 runtime exports and 34 type exports.
- Exact command/effect/contribution/registration builders with opaque branded handles and private callback bindings.
- Full-manifest, all-or-nothing frozen catalog compilation with private assembly identity and state.
- Existing Registry failure vocabulary, deterministic normalization and exact CVN-2 resource limits.
- Safe Registry identifiers use a finite ASCII scanner and do not dispatch through mutable RegExp methods.
- Dense-array index lookup uses a captured numeric conversion function, and contribution limits use an explicit internal counter rather than `Set.prototype.size`.
- Catalog compilation uses global CVN2-R009 passes: all selectable shapes, identities, module policy, uniqueness, commands, Requirements, effects, and final callback/freeze checks complete stage-by-stage before the next stage begins.
- Stage 1 captures every exact-owner entry, or the wrong-owner candidates used when no exact entry exists, including complete nested descriptor structure. Core fixed declarations, Domain registration identity, selected-entry existence and owner checks begin only in Stage 2.
- Application Core root adds only the four approved shared type exports and has zero runtime-key additions.
- CVN-6 runtime execution, Session/bus/gateway/replay integration, dynamic registration and Guitar-owned behavior remain absent.

## Decisive verification

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run build` | pass |
| SDK/catalog focused matrix | 54/54 |
| `npm.cmd test` | 350/350 |
| recursive Core forbidden-dependency test | 3/3 |
| GD-0 markdown public-contract verifier | 6 archived fences + 1 active fence, 0 diagnostics |
| GD-0 real-Core TypeScript fixture | pass |
| Trellis child validation | implement 9 / check 11, pass |
| Trellis parent validation | implement 3 / check 3, pass |
| Trellis product validation | implement 0 / check 0, pass |
| protected paths versus base | equal |
| `git diff --check` | pass |
| callback counters after success/failure/limit cases | all six categories remain 0 |

## Exact qualification facts

- Application runtime export list: unchanged.
- SDK export counts: runtime `8`, type `34`.
- Contribution ABI: exactly 9 own enumerable fields.
- Registration ABI: exactly 4 own enumerable fields.
- Catalog handle: frozen, method-free, private WeakMap state only.
- Resource edges:
  - modules `64` accepted / `65` rejected;
  - contributions `256` accepted / `257` rejected;
  - commands `4096` accepted / `4097` rejected;
  - effects `4096` accepted / `4097` rejected;
  - namespaces `1024` accepted / `1025` rejected;
  - versions per requirement `256` accepted / `257` rejected.
- CVN-1 characterization source SHA-256: `623B18822ABD479ED3BF7EEE02C6E214877EEF38D243001075D46D8BDE857819`.
- CVN-3 surface source SHA-256: `456D5ACC4AEF8F346B62053A7849F877C2A0D57C2DE172C56CE28F9D03D0473C`.

## Review handoff

The primordial repairs and the global stage 1-8 pipeline remain present. The
fourth bounded repair moves Core declaration and Domain registration identity
checks into Stage 2, while Stage 1 now captures complete nested structure for
every entry that can participate in exact or wrong-owner selection. Regressions
prove malformed nested contribution data precedes Domain registration identity,
Core declaration parity, and owner mismatch, in addition to the earlier global
stage combinations; every path invokes zero callbacks. Targeted independent
re-review compared the candidate against base
`faaf424cf370bbf055ad2cf9862e472a50edc22f`, independently reproduced seven
stage-priority/decoy cases, and passed with P0/P1/P2=`0/0/0`. The exact reviewed
tree is committed at `e203136a0e6d995d543dbe615be27dc4ca38d6c1`.
Acceptance metadata is recorded separately; archive remains the next lifecycle
action.
