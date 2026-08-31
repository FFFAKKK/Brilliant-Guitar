# File, State and Test Matrix

## 1. Planning allowlist

```text
.trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure/**  (11 files)
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json
```

Planning total: 12 paths. The Stage 6 operator handoff and review candidate remain unchanged until implementation activation.

## 2. Future technical allowlist

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Count: 1.

## 3. Future lifecycle allowlist

| Owner | Files |
| --- | --- |
| closure | `task.json`, `operator-handoff.md`, `review-candidate.md` |
| target law | `task.json`, `operator-handoff.md`, `review-candidate.md`, `implement.jsonl`, `check.jsonl` |
| Stage 6 | `task.json`, `operator-handoff.md`, `review-candidate.md` |

Count: 11. The two target JSONL files are context-manifest lifecycle projections only; no target PRD/design/implementation/research authority changes.

## 4. Protected zero-delta paths

- `src/**`;
- `crates/**` and Cargo files;
- package/tsconfig/build config;
- E3 evidence and TEMP artifacts;
- `.trellis/spec/**`;
- RKP-2 parent and Rust remediation parent;
- all task files outside the explicit planning or future lifecycle allowlists.

## 5. Lifecycle matrix

| Assertion | Q0 | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- | --- |
| target active | yes | yes | yes | no | no |
| target archive | no | no | no | yes | yes |
| target completed | no | no | no | yes | yes |
| target archive authorized | no | no | yes | historical yes | historical yes |
| closure active | yes | yes | yes | yes | no |
| closure archive | no | no | no | no | yes |
| closure status | planning | in_progress | in_progress | in_progress | completed |
| closure Q3 review | not started | not started | pending | pending | passed record |
| Stage 6 planning child | closure | null | null | null | null |
| Stage 6 implementation child | target | closure | closure | closure | null |
| Stage 6 next gate | planning review | Q1T | target archive preflight | Q3 review | Stage 6 owner decision |

## 6. Exact Git projection

| State | A | M | D | Total |
| --- | ---: | ---: | ---: | ---: |
| planning | 11 | 1 | 0 | 12 |
| Q2 | 11 | 9 | 0 | 20 |
| Q3 | 23 | 4 | 12 | 39 |
| Q4 | 23 | 4 | 12 | 39 |

All comparisons use base `c73e213...` and `--no-renames`.

## 7. Test matrix

| Area | Positive | Negative |
| --- | --- | --- |
| resolver | one exact root | both/neither roots |
| manifests | target 12, closure 11 | wrong count or substituted file |
| phases | exact Q0–Q4 | skipped/reordered state |
| paths | exact A/M/D | rename collapse, extra/missing path |
| target record | 323 bytes + exact hash | field/order/bytes/hash drift |
| Q3 record | one closure owner | duplicate or fake pending values |
| archive clock | exact month/date/time | mismatch reaches move |
| JSONL | Q2 removes six enumerated target self-refs; active/archive-successor refs exist | residual active prefix, changed non-self row, unregistered digest |
| Q4 atomicity | Stage 6 terminal projection and closure move share one archive commit | committed active-childless or archived-still-referenced intermediate state |
| Stage 6 | Q4 childless/active | early S6.2/S6.3 or parent archive |
| runtime gates | TypeScript default | Rust default/cutover/qualification |
| evidence | byte-semantic unchanged | E3 mutation or rerun |

## 8. Validation matrix

- Trellis: closure, target, Stage 6, RKP-2, Rust parent;
- JSON: all task JSONs parse;
- JSONL: every line parses, exists and is unique per file;
- Markdown fences: balanced;
- Git: diff check, exact path set, parent child count one;
- TypeScript: typecheck and build;
- planning focused: Node supported and 20.20.2 exact `11/7/4` with three historical plus one planned gap;
- planning full: exact `611/605/4/2`;
- future Q1T focused/full targets: `11/8/3` and `611/606/3/2`;
- protected delta: zero;
- status: clean and staged empty.

## 9. Rollback matrix

| Current state | First rollback |
| --- | --- |
| Q1 | revert activation |
| Q1T | revert technical, then activation |
| Q2 | revert owner acceptance, then technical/activation |
| Q3 | revert Stage 6 projection, native target archive, acceptance |
| Q4 | revert the single native closure archive/Stage 6 terminal commit to audited Q3 |

Manual move is never a rollback mechanism.
