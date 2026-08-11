# CVN-7 File, Test and Evidence Ownership Matrix

## Planning diff

Allowed in the current planning candidate:

- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/**`;
- Core VNext parent `task.json`、`implement.md`、`feature-contract-matrix.md`、`documentation-sync-matrix.md`、durable roadmap；
- Core active spec `backend/index.md` planning-status line；
- optional product parent current-status projection only when original encoding is preserved exactly。

Read-only in planning:

- `src/**`;
- `test/**`;
- `package*.json`;
- `tsconfig.json`;
- archived child contents;
- post-Core PRD/design/handoff.

## Future implementation additions

| File | Unique responsibility |
|---|---|
| `fixtures/cvn-7-qualification-score.ts` | deterministic representative/stress documents and count metadata |
| `fixtures/cvn-7-qualification-modules.ts` | two synthetic official contributions and trace controls |
| `qualification/cvn-7-qualification-contracts.ts` | test-only evidence/runner data contracts |
| `qualification/cvn-7-contract-trace.ts` | 44-row manifest |
| `qualification/cvn-7-worker.ts` | one-action isolated worker |
| `qualification/cvn-7-runner.ts` | coordinator, sampling, evidence assembly |
| `qualification/cvn-7-evidence-validator.ts` | exact evidence validation and recomputation |
| `cvn-7-public-baseline.test.ts` | 28/51/8/34/9/schema/forbidden boundary |
| `cvn-7-contract-trace.test.ts` | contract-set and case-existence checks |
| `cvn-7-end-to-end.test.ts` | full mixed transaction/read/history/replay/migration chain |
| `cvn-7-fixture-counts.test.ts` | exact fixture counts and generator determinism |
| `cvn-7-representative-history.test.ts` | exact 2,000-entry history behavior |
| `cvn-7-qualification-boundary.test.ts` | evidence codec, build/source and scope fences |

No existing test file is edited. Shared helper pressure does not justify modifying accepted fixtures; CVN-7 owns its new fixture files.

## Package boundary

`package.json` may add only `test:cvn7` and `qualify:cvn7`. Key order and all existing scripts/dependencies remain. `package-lock.json` and `tsconfig.json` diff must be empty.

## Evidence ownership

| Artifact | Producer | Validator | Blocking use |
|---|---|---|---|
| `environment.json` | runner | evidence validator | environment applicability |
| build manifests | build probe | evidence validator | reproducibility/A-B identity |
| `contract-trace.json` | trace checker | evidence validator + independent reviewer | 44 FC coverage |
| `functional-matrix.json` | functional workers | evidence validator | behavior gate |
| `representative-fixture.json` | fixture worker | evidence validator | exact counts/history |
| `portable-ab.json` | runner | recomputation | ratio gate |
| `reference-windows.json` | runner | recomputation | absolute budgets |
| `stress.json` | stress workers | equality/RSS validator | deterministic stress |
| `qualification-summary.md` | coordinator then human-reviewed | independent reviewer | final readable verdict |
| `independent-technical-review.md` | independent reviewer | acceptance operator | P0/P1/P2 gate |

## Protected-path result

The intended CVN-7 implementation has zero `src/**` diff. A changed production file is therefore self-evidently outside qualification ownership and triggers owner routing before staging.
