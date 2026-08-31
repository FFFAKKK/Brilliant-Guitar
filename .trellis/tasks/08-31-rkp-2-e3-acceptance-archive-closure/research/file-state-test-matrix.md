# File, State, Test and Rollback Matrix

## Planning candidate

Expected delta from `f27daf7`:

- 11 new closure planning artifacts;
- one immediate-parent `task.json` child/planning projection;
- total 12 paths;
- production/protected delta zero.

## Future technical allowlist

| Path | Purpose | Rollback |
|---|---|---|
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | Add archive resolver, exact record, P1-P4 projections and negative fixtures | Revert technical commit |

No second test or production file is allowed.

## Future lifecycle allowlist

| Owner | Mutable files/action |
|---|---|
| closure task | `task.json`, `operator-handoff.md`, `review-candidate.md`; native whole-task archive |
| target acceptance task | `task.json`, `operator-handoff.md`, `review-candidate.md`; native whole-task archive |
| E3 law parent | `task.json`, `operator-handoff.md`, `review-candidate.md` |
| Stage 6 parent | `task.json`, `operator-handoff.md`, `review-candidate.md` |

The remaining eight Markdown/JSONL/research artifacts in each archived task move byte-identically through native archive.

## State assertions

| Assertion | P1 | P2 | P3 | P4 |
|---|---:|---:|---:|---:|
| target active | yes | yes | no | no |
| target archived/completed | no | no | yes | yes |
| closure active | yes | yes | yes | no |
| closure archived/completed | no | no | no | yes |
| source `f27daf7` audit record exact | yes | yes | yes | yes |
| closure implementation review passed | no | no | no | yes |
| S6.2/S6.3 | false | false | false | false |
| TypeScript default | yes | yes | yes | yes |

## Test matrix

### Positive

- exact 334-byte canonical record and digest;
- active-only and archive-only 11-file task resolution;
- P1 transition;
- P2 accepted active target;
- P3 archived target plus active closure;
- P4 both archived and no live child;
- exact no-rename 40-path P3 and P4 sets;
- focused historical `11/8/3` classification;
- full `611/606/3/2` classification with stress skipped.

### Negative

- record missing/extra/reordered/wrong field;
- wrong bytes/digest;
- duplicate structured owner;
- active+archive duplicate or neither location;
- ten/twelve artifact manifest;
- wrong A/M/D status;
- target archive before exact PASS/authorization;
- closure archive before independent implementation PASS;
- parent child/reference mismatch;
- mutation of old 323-byte record;
- S6.2/S6.3, integration, qualification, Rust default, push, or RKP-3 drift.

## Validation evidence required

- five relevant Trellis validations;
- all JSON/JSONL parse and referenced paths unique/existing;
- parent child reference exactly once;
- Markdown fence balance;
- `git diff --check`;
- typecheck and build;
- dual-Node focused classification;
- dynamic full runner classification;
- exact no-rename path/status projection;
- production/protected zero delta;
- source and candidate worktrees clean;
- E3 stress command absent from execution log.

## Rollback order

Always reverse lifecycle order: parent projection, native archive, acceptance sync, technical law, activation. Reverting a native archive commit restores the active directory; manual moves are excluded.
