# CVN-7 Contract Traceability Plan

The future trace manifest uses the following exact case IDs. Every row has two distinct references:

1. `qualificationTitle` is an exact Node test title in `test/core-kernel/cvn-7-contract-trace.test.ts`; it is identical to the stable case ID and proves that the manifest row, owner and decisive reference are internally consistent.
2. `decisiveEvidence` is an exact repository-relative test path plus an exact test title. Existing titles stay unchanged. Titles prefixed `CVN7-D-` are fixed here and must be created verbatim in the named new CVN-7 source.

The trace checker scans source text and requires both titles to occur exactly once in their declared files. The full accepted suite executes existing decisive tests; `test:cvn7` executes every new `CVN7-Q-*` and `CVN7-D-*` case. A trace assertion never substitutes for its decisive behavior test.

| FC | Primary owner | Stable case ID and exact `qualificationTitle` | Exact `decisiveEvidence` (`path :: title`) |
|---|---|---|---|
| 001 | Parent | `CVN7-Q-FC001-FINITE-COMPLETION` | `test/core-kernel/cvn-7-public-baseline.test.ts :: CVN7-D-FC001 public Core VNext surface is finite and exact` |
| 002 | Parent | `CVN7-Q-FC002-VERSION-EVOLUTION` | `test/core-kernel/cvn-7-qualification-boundary.test.ts :: CVN7-D-FC002 version evolution remains explicit and bounded` |
| 010 | CVN-0 | `CVN7-Q-FC010-STRICT-UNKNOWN` | `test/core-kernel/public-unknown-guards.test.ts :: UG-T06 public guards reject forged synchronous built-in outcomes` |
| 011 | CVN-1 | `CVN7-Q-FC011-STATE-RESULT` | `test/core-kernel/command-system.test.ts :: CommandBus preserves K1-2 writes and adds only K1-3 read/session entry points` |
| 020 | CVN-3 | `CVN7-Q-FC020-EXACT-INPUT` | `test/core-kernel/cvn-3-strict-input.test.ts :: bounded strict capture rejects hostile shapes without property reads` |
| 021 | CVN-3 | `CVN7-Q-FC021-EXACT-OUTPUT` | `test/core-kernel/cvn-3-document-factory.test.ts :: factory creates the exact one-Measure document without a session` |
| 030 | CVN-3 | `CVN7-Q-FC030-ANCHOR-TYPES` | `test/core-kernel/command-system.test.ts :: public command contracts expose versioned stable targets and anchors` |
| 031 | CVN-3 | `CVN7-Q-FC031-ANCHOR-RESOLUTION` | `test/core-kernel/cvn-3-measure-insert-remove.test.ts :: insert resolves target and anchor before final semantic coverage and preserves rejection state` |
| 040 | CVN-1 | `CVN7-Q-FC040-V1-SIX-COMMANDS` | `test/core-kernel/command-spine-characterization.test.ts :: CVN-1 freezes the pre-refactor public command spine trace` |
| 041 | Parent | `CVN7-Q-FC041-VNEXT-TWENTY-TWO` | `test/core-kernel/cvn-5-public-contracts.test.ts :: CVN-5 adds exactly three Core command descriptors without runtime-root growth` |
| 050 | CVN-3 | `CVN7-Q-FC050-MEASURE-INSERT` | `test/core-kernel/cvn-3-measure-insert-remove.test.ts :: insert canonicalizes shuffled Part payloads, freezes capture, and emits canonical affected facts` |
| 051 | CVN-3 | `CVN7-Q-FC051-MEASURE-REMOVE` | `test/core-kernel/cvn-3-measure-insert-remove.test.ts :: remove deletes and restores the complete Measure aggregate while final-Measure removal is atomic` |
| 052 | CVN-3 | `CVN7-Q-FC052-MEASURE-MOVE` | `test/core-kernel/cvn-3-measure-move-definition.test.ts :: move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority` |
| 053 | CVN-3 | `CVN7-Q-FC053-MEASURE-DEFINITION` | `test/core-kernel/cvn-3-measure-move-definition.test.ts :: set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history` |
| 060 | CVN-4 | `CVN7-Q-FC060-PART-LIFECYCLE` | `test/core-kernel/cvn-4-part-lifecycle.test.ts :: Part insert canonicalizes complete coverage in global Measure order and detaches input` |
| 061 | CVN-4 | `CVN7-Q-FC061-STAFF-LIFECYCLE` | `test/core-kernel/cvn-4-staff-lifecycle.test.ts :: Staff insert adds only the requested Staff and leaves Voices and assignments untouched` |
| 062 | CVN-4 | `CVN7-Q-FC062-VOICE-LIFECYCLE` | `test/core-kernel/cvn-4-voice-lifecycle.test.ts :: Voice removal owns Event and Note descendants, exact undo, and final-Voice rejection` |
| 063 | CVN-4 | `CVN7-Q-FC063-EVENT-STAFF` | `test/core-kernel/cvn-4-voice-lifecycle.test.ts :: Voice and Event staff replacements preserve semantic and support separation` |
| 070 | CVN-4 | `CVN7-Q-FC070-OWNERSHIP-CASCADE` | `test/core-kernel/cvn-4-transaction-integration.test.ts :: each CVN-4 command preserves encoded undo, redo, replay, and committed event facts` |
| 080 | CVN-5 | `CVN7-Q-FC080-RANGE-SELECTION` | `test/core-kernel/address-range.test.ts :: hierarchical ranges normalize reverse endpoints in musical order` |
| 081 | CVN-5 | `CVN7-Q-FC081-RANGE-DELETE` | `test/core-kernel/range-delete.test.ts :: range delete normalizes reverse global measure endpoints and undo restores exactly` |
| 082 | CVN-5 | `CVN7-Q-FC082-RANGE-TRANSPOSE` | `test/core-kernel/range-transpose-written-pitch.test.ts :: range transpose skips rests, transforms notes, and reports the first invalid note` |
| 090 | CVN-5 | `CVN7-Q-FC090-BATCH-ENVELOPE-LIMITS` | `test/core-kernel/batch-hostile-input-resource.test.ts :: the inclusive 100-child boundary is accepted as one all-no-op batch` |
| 091 | CVN-5 | `CVN7-Q-FC091-BATCH-ORDER` | `test/core-kernel/batch-core-atomicity.test.ts :: effective Core batch commits once and undo/redo use one history entry` |
| 092 | CVN-5 | `CVN7-Q-FC092-BATCH-FAILURE-INDEX` | `test/core-kernel/batch-input-and-failure-attribution.test.ts :: the lowest failing child index wins with exactly one wrapper` |
| 093 | CVN-5 | `CVN7-Q-FC093-BATCH-HISTORY-REPLAY` | `test/core-kernel/batch-history-replay-events.test.ts :: Core replay reroutes a batch as one semantic envelope` |
| 100 | CVN-5 | `CVN7-Q-FC100-FAILURE-UNION` | `test/core-kernel/kernel-failure-adapters.test.ts :: command and history adapters cover every accepted failure code` |
| 101 | CVN-5 | `CVN7-Q-FC101-FAILURE-PRIORITY` | `test/core-kernel/batch-input-and-failure-attribution.test.ts :: outer validation stages precede every child failure` |
| 102 | CVN-5 | `CVN7-Q-FC102-FAILURE-PRIVACY` | `test/core-kernel/core-kernel-integration-boundaries.test.ts :: subscriber failures and hostile report input remain private` |
| 110 | CVN-2 | `CVN7-Q-FC110-ENTRY-ABI` | `test/core-kernel/module-sdk-contracts.test.ts :: definition handles and outer ABIs are exact, opaque, and frozen` |
| 111 | CVN-2 | `CVN7-Q-FC111-FROZEN-ASSEMBLY` | `test/core-kernel/module-catalog-assembly.test.ts :: two synthetic official modules compile into one frozen opaque catalog` |
| 112 | CVN-6 | `CVN7-Q-FC112-RUNTIME-AUTHORITY` | `test/core-kernel/module-transaction-atomicity.test.ts :: one module submit applies ordered Core plus owned-extension effects atomically` |
| 120 | CVN-6 | `CVN7-Q-FC120-CHANGED-PIPELINE` | `test/core-kernel/module-validation-classification.test.ts :: validators complete before classifiers in frozen catalog order` |
| 121 | CVN-6 | `CVN7-Q-FC121-AVAILABILITY` | `test/core-kernel/domain-availability.test.ts :: known absent, incompatible, unknown, and mixed extension states are canonical` |
| 122 | CVN-6 | `CVN7-Q-FC122-MIGRATION` | `test/core-kernel/extension-migration.test.ts :: detached extension migration replaces only the selected block` |
| 130 | CVN-7 | `CVN7-Q-FC130-NO-DOCUMENT-CAP` | `test/core-kernel/cvn-7-fixture-counts.test.ts :: CVN7-D-FC130 qualification fixture sizes do not become document caps` |
| 131 | CVN-7 | `CVN7-Q-FC131-REPRESENTATIVE-EXACT` | `test/core-kernel/cvn-7-fixture-counts.test.ts :: CVN7-D-FC131 representative fixture has exact deterministic counts` |
| 132 | CVN-7 | `CVN7-Q-FC132-STRESS-EXACT` | `test/core-kernel/cvn-7-fixture-counts.test.ts :: CVN7-D-FC132 stress fixture has exact deterministic counts` |
| 133 | CVN-7 | `CVN7-Q-FC133-SAMPLING-EXACT` | `test/core-kernel/cvn-7-qualification-boundary.test.ts :: CVN7-D-FC133 sampling pairs and aggregate rules are exact` |
| 134 | CVN-7 | `CVN7-Q-FC134-BUDGETS-EXACT` | `test/core-kernel/cvn-7-qualification-boundary.test.ts :: CVN7-D-FC134 portable and reference budgets are exact` |
| 140 | CVN-7 | `CVN7-Q-FC140-COMMAND-MINIMUM-SET` | `test/core-kernel/cvn-7-public-baseline.test.ts :: CVN7-D-FC140 all twenty-eight commands map to the fixed minimum case matrix` |
| 141 | CVN-7 | `CVN7-Q-FC141-BATCH-MATRIX` | `test/core-kernel/cvn-7-end-to-end.test.ts :: CVN7-D-FC141 batch qualification matrix is complete` |
| 142 | CVN-7 | `CVN7-Q-FC142-STRUCTURE-MATRIX` | `test/core-kernel/cvn-7-end-to-end.test.ts :: CVN7-D-FC142 structure qualification matrix is complete` |
| 143 | CVN-7 | `CVN7-Q-FC143-MODULE-MATRIX` | `test/core-kernel/cvn-7-end-to-end.test.ts :: CVN7-D-FC143 module qualification matrix is complete` |

## Manifest rules

- FC IDs are stored as full strings, e.g. `CVN-FC-001`.
- `caseId` and `qualificationTitle` are identical to the exact unique `CVN7-Q-*` strings above.
- `qualificationTestFile` is always the repository-relative `test/core-kernel/cvn-7-contract-trace.test.ts`.
- `decisiveTestFile` and `decisiveTestTitle` are stored separately; neither field accepts a glob, directory, suite nickname, `existing`, `validator`, `full suite` or another placeholder.
- The implementation creates all planned `CVN7-D-*` titles verbatim before the trace checker may pass.
- Existing test titles remain unchanged and are referenced verbatim.
- The trace checker validates the exact 44-row parent heading set, unique owners/case IDs, file existence and exactly one source occurrence for each qualification and decisive title.
- The runner records execution success for both the full accepted suite and `test:cvn7`; source presence alone is insufficient acceptance evidence.
