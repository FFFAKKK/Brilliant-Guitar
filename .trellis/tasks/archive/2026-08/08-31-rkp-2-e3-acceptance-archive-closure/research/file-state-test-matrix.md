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

For the target, “remaining eight” means all artifacts except `task.json`, `implement.jsonl`, and `check.jsonl`. Those three form the exact successor projection below. For the closure task, both JSONL files are already archive-safe in the repaired planning authority and all 11 artifacts move without pre-archive content rewriting except normal lifecycle fields in `task.json`.

## Exact target JSONL successor

`implement.jsonl` becomes exactly:

```jsonl
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/prd.md","reason":"Consume accepted E3 law and archive-closeout requirements from the stable parent."}
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/design.md","reason":"Consume the archive-aware lifecycle design from the stable parent."}
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/task.json","reason":"Use the audited E3 law candidate and its current pending lifecycle as the transition owner."}
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/research/final-state-projection-contract.md","reason":"Preserve the exact historical 8+1+12 projection and protocol identity."}
{"file":".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json","reason":"Project the Stage 6 review result while keeping S6.2/S6.3 and later gates false."}
{"file":".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json","reason":"Keep RKP-2 paused before S6.2 and TypeScript default."}
{"file":".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json","reason":"Preserve Rust-parent cutover, qualification, push and RKP-3 gates."}
{"file":"test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts","reason":"Implement the exact historical candidate and audit-bound acceptance-state law."}
```

LF-normalized SHA-256: `d3fb185b510bc384e8234e7c179c66a9a47323c86acbfa39de565b60d50913c3`.

`check.jsonl` becomes exactly:

```jsonl
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/operator-handoff.md","reason":"Check the stable parent handoff records the exact accepted target and archive boundary."}
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/task.json","reason":"Check the canonical audit record has one owner and the audited candidate remains exact."}
{"file":".trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json","reason":"Check Stage 6 references rather than duplicates the audit record."}
{"file":".trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment/task.json","reason":"Check the historical task does not reclaim live E3 ownership."}
{"file":".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json","reason":"Check S6.2/S6.3 remain false and TypeScript remains default."}
{"file":".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json","reason":"Check qualification, cutover, push and RKP-3 remain false."}
{"file":"test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts","reason":"Check exact 21-path history, 18-path transition, audit record and negative fixtures."}
{"file":".trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/review-candidate.md","reason":"Check the stable parent review record preserves all implementation and later-gate exclusions."}
```

LF-normalized SHA-256: `f500d9871a1e877874c0d962ce2a2c086897aa23f02f5127532d648b776b24fe`.

The target `task.json` successor changes only these two stored hashes plus normal review/acceptance/archive lifecycle fields. Historical `f27daf7` task/JSONL blobs remain immutable.

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
- active self-reference survives in either archived JSONL;
- successor JSONL/hash differs from the exact pair;
- local month/date differs or time is `23:50:00` or later;
- wrong A/M/D status;
- target archive before exact PASS/authorization;
- closure archive before independent implementation PASS;
- parent child/reference mismatch;
- mutation of old 323-byte record;
- S6.2/S6.3, integration, qualification, Rust default, push, or RKP-3 drift.

## Validation evidence required

- five relevant Trellis validations;
- all JSON/JSONL parse and referenced paths unique/existing;
- all JSONL references still exist immediately after both native archives;
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

Before either native archive, clock mismatch is a pre-mutation return to planning repair, not a rollback case, because no file move or Git change may have occurred.
