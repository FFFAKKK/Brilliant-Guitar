# Batch Pipeline and Failure Matrix

## Fixed stage order

| Stage | Owner | Work | Callback guarantee on failure |
|---:|---|---|---|
| 0 | accepted CVN-6 availability | cached writable/incompatible/unavailable preflight | all decode/handler/validator/classifier calls `0` |
| 1 | outer route | envelope version, command ID, document target | child calls `0` |
| 2 | outer strict codec | exact payload, dense array, 0/101, capture budgets | child calls `0` |
| 3 | child `i` route/decode | nested detection, child ID/version/target/payload | only earlier children may have temporary effects |
| 4 | child `i` preparer/effects | ordered effects, ownership, cumulative effects/affected caps | later child callbacks `0` |
| 5 | Core semantic | validate final candidate once | module validator/classifier `0` |
| 6 | compatibility/validation | recompute availability; validators once | classifier `0` on rejection/contract error |
| 7 | Core profile/classification | Core profile once; classifiers once | no adoption |
| 8 | canonical aggregate | issues/facts/addresses and caps | no adoption |
| 9 | CVN-1 owner | capacity, adoption, history, dirty, event | subscriber failure isolated post-commit |

The apparent parent ambiguity is closed as follows: stage 2 never globally scans child semantic IDs. Nested detection occurs at stage 3 for each child, preserving lowest-index attribution.

## Top-level versus wrapped failures

| Condition | Location |
|---|---|
| read-only/incompatible availability | top-level |
| outer envelope/version/ID/target | top-level |
| outer payload/commands shape, sparse, empty, 101, capture depth/properties | top-level |
| child unknown/version/target/payload/owner/anchor/preparer/effect | `command.batch-child-rejected(i, inner)` |
| nested child batch | wrapper with inner `command.batch-nested` |
| cumulative effects/affected cap first crossed by child `i` | wrapper at `i` |
| final Core semantic | top-level |
| final compatibility/validator/profile/classifier/facts/aggregate issue cap | top-level |
| version/history/event capacity | top-level |
| coordinator invariant failure | top-level internal failure, privacy allowlisted |

The wrapper depth is exactly zero or one. The inner union excludes `command.batch-child-rejected`.

## Input boundary matrix

| Case | Expected result | Child traversal |
|---|---|---:|
| commands length 0 | `command.batch-empty` | 0 |
| length 1 | accepted if child succeeds | 1 |
| length 100 | accepted if all children succeed | 100 |
| length 101 | `batch-children` resource failure, actual 101 | 0 |
| sparse within 1..100 | `command.invalid-envelope` | 0 |
| depth 64 | accepted boundary | normal |
| depth 65 | accepted strict input-limit failure | 0 semantic child callbacks |
| properties 1,048,576 | accepted boundary | normal |
| properties 1,048,577 | accepted strict input-limit failure | 0 semantic child callbacks |
| getter, Proxy `get`, iterator, coercion or user method | deterministic invalid input; those entry points are invoked `0` times | 0 semantic child callbacks |
| Proxy `ownKeys` / `getPrototypeOf` / `getOwnPropertyDescriptor` reflection | accepted primordial descriptor-first inspection may observe these traps; a throw or malformed reflection result collapses to the stable invalid-input result | Proxy `get` and semantic child callbacks remain `0` |

For a 100-child fixture, inject the first child-local failure separately at indices `0`, `50`, and `99`. Each result exposes that exact zero-based `failedCommandIndex`; no later child route/preparer/effect callback runs.

## Atomic behavior matrix

| Children | Final document | Result |
|---|---|---|
| all zero-effect | equal | no-op; version/history/event delta 0 |
| one or more effective | changed | one commit/history/outer event |
| effective then exact cancellation | equal | still one commit/history/outer event |
| intermediate semantic invalid, final valid | valid | one commit |
| any child local rejection | temporary candidate discarded | state exactly unchanged |
| all children apply, final semantic reject | temporary candidate discarded | state exactly unchanged |

## Assessment ordering closure

The parent phrase “child index then Core/module order” applies only to child preparation/effects/affected facts and failure attribution. The final assessment is computed once from the final candidate:

1. Core semantic result/profile;
2. module validators in frozen catalog order;
3. module classifiers in the same frozen order;
4. accepted CVN-6 canonical issue/fact ordering.

No per-child public assessment is emitted and no new batch assessment type is created.

## Required two-module fixture

Reuse the accepted CVN-6 public contribution contract to construct two neutral fixtures in CVN-5-owned test files:

- `fixture.score-domain`: score-owned extension namespace;
- `fixture.part-domain`: Part-owned extension namespace.

The integrated batch contains at least one Core range child and one command from each fixture across the matrix. Each child still belongs to one contribution. This is sequential explicit batch coordination, not cross-module ownership or a new contribution ABI.

Each fixture command retains the accepted CVN-6 two-effect shape: one allowed WrittenPitch replacement plus one replace/remove operation for its own declared score- or Part-owned `ExtensionBlock` namespace. The batch coordinator observes only accepted owned effects and never converts one fixture's definition into the other fixture's ownership.

Required call-count assertions:

- availability rejection: child route/preparer/effect/validator/classifier `0/0/0/0/0`;
- child `i` rejection: no later child route/preparer/effect; final validator/classifier `0/0`;
- final Core rejection: module validator/classifier `0/0`;
- validator issue output: later applicable validators continue once, classifiers follow accepted CVN-6 rule;
- validator throw/Promise-like/malformed: later callbacks stop and classifiers `0`;
- successful or no-op batch: each applicable final validator/classifier exactly `1/1`, not multiplied by child count;
- undo/redo: child preparers `0`, each applicable final validator/classifier `1/1`;
- replay: child routes/preparers rerun once per semantic child, final validators/classifiers `1/1`.
