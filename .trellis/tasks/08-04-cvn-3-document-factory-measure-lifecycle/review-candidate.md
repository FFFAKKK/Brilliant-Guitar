# CVN-3 Independent Review Candidate

## Status

- **Review status:** `independent_review_pending`.
- **Review base:** `d936d58195803ef938214948b21e89fe67939090`.
- **Source/test candidate:** `d9500f5a8ac285071586ba8eda380370eafd022f`.
- **Branch/worktree:** `codex/cvn-3-document-factory-measure-lifecycle` /
  `.worktrees/k1-6-core-kernel-integration-gate`.
- **Acceptance boundary:** CVN3-AC001 through CVN3-AC027 have operator
  evidence below. CVN3-AC028 remains unchecked until an independent reviewer
  compares the full diff, reproduces the gates, and records a verdict.

This record is a review package, not an acceptance or archive record.

## Candidate commits

| Role | Commit |
| --- | --- |
| CVN-3 trace projection characterization | `b22f4554a5b0c46f0f9f50cbdd75611a833837b1` |
| bounded capture and shared component codec | `a1bef39ff35f4b13a87bb4fc3e793bc9a216ebcf` |
| deterministic document factory | `a55ed2e20cd209cf6ebfe329b875b7337555b437` |
| four Measure lifecycle commands | `585d3527eae4e663dd11413f096c109fd385ea40` |
| acceptance-matrix test strengthening | `d9500f5a8ac285071586ba8eda380370eafd022f` |

The earlier planning/activation commits `e973794` and `e51f5ef` are included
in the full range for task provenance only. Review all changes from the base,
not merely the final test commit.

## Implemented contract summary

- Adds one public runtime export, `createScoreDocument`, and no other root
  runtime name. The exact surface is **49 runtime exports / 10 catalog commands
  / 10 Registry command descriptors**.
- The static command additions, in order after the preserved six legacy IDs,
  are `core.measure.insert`, `core.measure.remove`, `core.measure.move`, and
  `core.measure.set-definition`.
- Factory construction is session-free, detached/deeply frozen, schema-stable,
  and preserves semantic-invalid versus profile-unsupported classification.
- New command routes use descriptor-first bounded strict capture. Existing six
  command routes retain the legacy input boundary.
- Private Measure bundle effects generate exact reverse effects; live submit,
  authorized gateway, history, replay, dirty/checkpoint, and event behavior
  remain on the accepted CVN-1 transaction spine.
- No public whole-document replacement, persisted schema change, Guitar
  dependency, module-runtime registration API, hot reload, or physical IO was
  added.

## Verification evidence

| Gate | Command / assertion | Result |
| --- | --- | --- |
| Typecheck | `npm.cmd run typecheck` | passed |
| Build | `npm.cmd run build` | passed |
| Measure lifecycle triad | insert/remove, move/definition, transaction integration tests | 22/22 passed |
| Cross-layer focused matrix | plan section 5 command: CVN-3, spine, internals, Registry, public API, forbidden dependency suites | 71/71 passed |
| Full regression | `npm.cmd test` | 233/233 passed |
| CVN-1 characterization | immutable expected fixture SHA-256 | `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9` |
| Additive surface | public-surface fixture | 49 / 10 / 10 exact |
| Strict capture | depth and property boundaries | `64/65`; `1,048,576/1,048,577` exact |
| Source diff hygiene | `git diff --check` on source/test candidate | passed |
| Documentation candidate integrity | Trellis validation, Markdown/JSON/path scan, final diff and protected schema/fixture checks | passed |

The detailed post-documentation gate record is in `task.json` under
`meta.verification`.

## Resource and report facts

| Boundary | Below/at limit | First rejected value | Command/factory outcome |
| --- | --- | --- | --- |
| capture depth | `64` | `65` | `factory.resource-limit-exceeded` or `command.resource-limit-exceeded`, `limitKind: "input-depth"`, `limit: 64`, `actual: 65` |
| captured properties | `1,048,576` | `1,048,577` | `factory.resource-limit-exceeded` or `command.resource-limit-exceeded`, `limitKind: "input-properties"`, `limit: 1048576`, `actual: 1048577` |
| command Issue mapping | exact resource failure | extra/malformed failure record | one allowlisted command Issue with only `limitKind`, `limit`, `actual`; otherwise `report.invalid-input` |

`command.anchor-self-reference` maps as a code-only command Issue. No command
Issue retains raw input, target/anchor IDs, exception text, source path, stack,
or arbitrary extra details.

## Acceptance evidence matrix

| Acceptance | Primary evidence |
| --- | --- |
| CVN3-AC001 | `cvn-3-document-factory.test.ts` — `factory creates the exact one-Measure document without a session` |
| CVN3-AC002 | `cvn-3-document-factory.test.ts` — `factory preserves decoded order and creates semantic-valid unsupported multi-Part scores` |
| CVN3-AC003 | `cvn-3-document-factory.test.ts` — `factory maps exact shape, tuple, sparse, version, and safe-integer failures to invalid input` |
| CVN3-AC004 | `cvn-3-document-factory.test.ts` — `factory separates sorted semantic diagnostics from profile classification` |
| CVN3-AC005 | `cvn-3-document-factory.test.ts` — `factory is deterministic, alias-isolated, deeply frozen, and does not invoke hostile hooks` |
| CVN3-AC006 | `cvn-3-document-factory.test.ts` hostile fixture; `cvn-3-strict-input.test.ts` hostile/cross-Realm/primordial cases |
| CVN3-AC007 | `cvn-3-document-factory.test.ts` and `cvn-3-strict-input.test.ts` exact resource-boundary tests |
| CVN3-AC008 | `command-internals.test.ts` static catalog test; `cvn-3-public-surface.test.ts` exact fixture |
| CVN3-AC009 | `cvn-3-measure-insert-remove.test.ts` — `insert canonicalizes shuffled Part payloads...` |
| CVN3-AC010 | `cvn-3-measure-insert-remove.test.ts` — `insert resolves target and anchor before final semantic coverage and preserves rejection state` |
| CVN3-AC011 | `cvn-3-measure-insert-remove.test.ts` — `insert undo, redo, replay...`; transaction checkpoint matrix |
| CVN3-AC012 | `cvn-3-measure-insert-remove.test.ts` — `remove deletes and restores the complete Measure aggregate...` |
| CVN3-AC013 | `cvn-3-measure-insert-remove.test.ts` remove history/replay assertions |
| CVN3-AC014 | `cvn-3-measure-insert-remove.test.ts` final-Measure rejection and zero-event assertions |
| CVN3-AC015 | `cvn-3-measure-move-definition.test.ts` start/backward and `move forward after a later Measure...` tests |
| CVN3-AC016 | `cvn-3-measure-move-definition.test.ts` self/missing target/missing anchor assertions |
| CVN3-AC017 | `cvn-3-measure-move-definition.test.ts` shuffled no-op normalization and exact undo test |
| CVN3-AC018 | `cvn-3-measure-move-definition.test.ts` move history/replay/affected assertions |
| CVN3-AC019 | `cvn-3-measure-move-definition.test.ts` meter/pickup add/remove/no-op assertions |
| CVN3-AC020 | `cvn-3-measure-move-definition.test.ts` semantic rollback assertions |
| CVN3-AC021 | `cvn-3-measure-move-definition.test.ts` profile classification and history/replay assertions |
| CVN3-AC022 | `cvn-3-transaction-integration.test.ts` per-command exact input, Proxy, mutation, extension, and checkpoint cases |
| CVN3-AC023 | `cvn-3-transaction-integration.test.ts` — `new Measure commands enforce bounded descriptor capture and map resource failures`; `kernel-failure-adapters.test.ts` |
| CVN3-AC024 | `cvn-3-transaction-integration.test.ts` direct/authorized parity and denial-before-mutation cases |
| CVN3-AC025 | `command-spine-characterization.test.ts` CVN-1 projection/SHA assertions; `cvn-3-public-surface.test.ts` |
| CVN3-AC026 | typecheck/build/focused/full/diff/Trellis gates in this record and task metadata |
| CVN3-AC027 | `public-api-boundary.test.ts`, `forbidden-dependency-boundary.test.ts`, schema diff and protected-fixture checks |
| CVN3-AC028 | **pending independent review** |

## Parent-contract crosswalk

| Parent contract | CVN-3 evidence |
| --- | --- |
| CVN-FC-010 | AC006, AC007, AC023 — strict capture and bounded resource behavior |
| CVN-FC-011 | AC011, AC013, AC018, AC021, AC022 — transaction/history/replay parity |
| CVN-FC-020 | AC001–AC004 — deterministic factory shape and construction |
| CVN-FC-021 | AC001–AC007 — factory validation, freeze, hostile input, resources |
| CVN-FC-030 | AC009, AC015, AC016 — stable Measure targeting/anchors |
| CVN-FC-031 | AC015–AC018 — synchronized order and inverse effects |
| CVN-FC-041 | AC008, AC025 — exact catalog/Registry surface |
| CVN-FC-050 | AC009–AC011 — insert aggregate/inverse behavior |
| CVN-FC-051 | AC012–AC014 — remove aggregate and final-Measure guard |
| CVN-FC-052 | AC015–AC018 — move/order behavior |
| CVN-FC-053 | AC019–AC021 — definition/pickup behavior |
| CVN-FC-100 | AC016, AC023 — closed failures and privacy-safe Issue facts |
| CVN-FC-101 | AC010, AC014, AC016, AC020, AC023 — resolution priority and atomic failure |
| CVN-FC-102 | AC023, AC024 — report/gateway boundary preservation |
| CVN-FC-140 | AC022–AC024 — per-command cross-cutting behavior |
| CVN-FC-142 | AC001–AC021 — factory and Measure lifecycle behavioral coverage |

## Scope and private-boundary audit notes

- `strict-input-capture.ts` is a private common capture mechanism. It replaces
  no public codec signature and provides the exact hostile-input/resource
  contract for the factory and four new command routes.
- `score-component-codec.ts` factors existing component decoding from
  `decode-score-document.ts`; characterization, codec, and full regression
  tests protect unchanged public decode behavior.
- `measure-command-adapters.ts` and Measure bundle effects are private command
  internals. The root public API exposes neither adapters nor effects/history
  entries/capture utilities.
- `src/core-kernel/domain/score-document.ts` has no diff from the review base;
  `brilliant-score-1` remains the sole persisted schema version.
- The immutable CVN-1 expected JSON fixture is byte-preserved; only the
  projection helper/test adds the declared CVN-3 descriptors when measuring the
  current additive surface.

## Remaining independent-review gate

The reviewer must use the base and source/test candidate above, inspect the
complete range, rerun the focused/full commands independently, and record any
P0/P1/P2 finding or a pass verdict. In particular, review strict capture
primordials/Proxy paths, every Measure effect/inverse, shuffled-order undo,
last-Measure and sequence rollback equality, history/replay/event/dirty/
checkpoint parity, Registry/report allowlists, and CVN-1 projection integrity.

No operator-reported unresolved implementation finding is recorded here; that
is not a substitute for the required independent verdict.
