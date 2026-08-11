# CVN-7 Contract Traceability Plan

The future trace manifest uses the following exact case IDs. Existing-test references are supporting evidence; every row also receives a CVN-7 trace assertion.

| FC | Primary owner | Stable qualification case ID | Decisive file |
|---|---|---|---|
| 001 | Parent | `CVN7-Q-FC001-FINITE-COMPLETION` | `cvn-7-public-baseline.test.ts` |
| 002 | Parent | `CVN7-Q-FC002-VERSION-EVOLUTION` | `cvn-7-qualification-boundary.test.ts` |
| 010 | CVN-0 | `CVN7-Q-FC010-STRICT-UNKNOWN` | existing `public-unknown-guards.test.ts` |
| 011 | CVN-1 | `CVN7-Q-FC011-STATE-RESULT` | existing `command-system.test.ts` |
| 020 | Parent/commands | `CVN7-Q-FC020-EXACT-INPUT` | existing strict-input/public-contract suites |
| 021 | Parent/commands | `CVN7-Q-FC021-EXACT-OUTPUT` | `cvn-7-end-to-end.test.ts` |
| 030 | Parent/commands | `CVN7-Q-FC030-ANCHOR-TYPES` | existing lifecycle tests |
| 031 | Parent/commands | `CVN7-Q-FC031-ANCHOR-RESOLUTION` | existing lifecycle tests |
| 040 | CVN-1 | `CVN7-Q-FC040-V1-SIX-COMMANDS` | existing `command-spine-characterization.test.ts` |
| 041 | Parent | `CVN7-Q-FC041-VNEXT-TWENTY-TWO` | `cvn-7-public-baseline.test.ts` |
| 050 | CVN-3 | `CVN7-Q-FC050-MEASURE-INSERT` | existing `cvn-3-measure-insert-remove.test.ts` |
| 051 | CVN-3 | `CVN7-Q-FC051-MEASURE-REMOVE` | existing `cvn-3-measure-insert-remove.test.ts` |
| 052 | CVN-3 | `CVN7-Q-FC052-MEASURE-MOVE` | existing `cvn-3-measure-move-definition.test.ts` |
| 053 | CVN-3 | `CVN7-Q-FC053-MEASURE-DEFINITION` | existing `cvn-3-measure-move-definition.test.ts` |
| 060 | CVN-4 | `CVN7-Q-FC060-PART-LIFECYCLE` | existing `cvn-4-part-lifecycle.test.ts` |
| 061 | CVN-4 | `CVN7-Q-FC061-STAFF-LIFECYCLE` | existing `cvn-4-staff-lifecycle.test.ts` |
| 062 | CVN-4 | `CVN7-Q-FC062-VOICE-LIFECYCLE` | existing `cvn-4-voice-lifecycle.test.ts` |
| 063 | CVN-4 | `CVN7-Q-FC063-EVENT-STAFF` | existing `cvn-4-transaction-integration.test.ts` |
| 070 | CVN-4 | `CVN7-Q-FC070-OWNERSHIP-CASCADE` | existing CVN-3/4 transaction tests |
| 080 | CVN-5 | `CVN7-Q-FC080-RANGE-SELECTION` | existing `address-range.test.ts` |
| 081 | CVN-5 | `CVN7-Q-FC081-RANGE-DELETE` | existing `range-delete.test.ts` |
| 082 | CVN-5 | `CVN7-Q-FC082-RANGE-TRANSPOSE` | existing `range-transpose-written-pitch.test.ts` |
| 090 | CVN-5 | `CVN7-Q-FC090-BATCH-ENVELOPE-LIMITS` | existing `batch-hostile-input-resource.test.ts` |
| 091 | CVN-5 | `CVN7-Q-FC091-BATCH-ORDER` | existing `batch-core-atomicity.test.ts` |
| 092 | CVN-5 | `CVN7-Q-FC092-BATCH-FAILURE-INDEX` | existing `batch-input-and-failure-attribution.test.ts` |
| 093 | CVN-5 | `CVN7-Q-FC093-BATCH-HISTORY-REPLAY` | existing `batch-history-replay-events.test.ts` |
| 100 | CVN-5 | `CVN7-Q-FC100-FAILURE-UNION` | existing `cvn-5-public-contracts.test.ts` |
| 101 | CVN-5 | `CVN7-Q-FC101-FAILURE-PRIORITY` | existing batch/range rejection suites |
| 102 | CVN-5 | `CVN7-Q-FC102-FAILURE-PRIVACY` | existing `integrated-public-boundary.test.ts` |
| 110 | CVN-2 | `CVN7-Q-FC110-ENTRY-ABI` | existing `module-sdk-contracts.test.ts` |
| 111 | CVN-2 | `CVN7-Q-FC111-FROZEN-ASSEMBLY` | existing module catalog suites |
| 112 | CVN-6 | `CVN7-Q-FC112-RUNTIME-AUTHORITY` | existing `module-transaction-atomicity.test.ts` |
| 120 | CVN-6 | `CVN7-Q-FC120-CHANGED-PIPELINE` | existing `module-validation-classification.test.ts` |
| 121 | CVN-6 | `CVN7-Q-FC121-AVAILABILITY` | existing `domain-availability.test.ts` |
| 122 | CVN-6 | `CVN7-Q-FC122-MIGRATION` | existing `extension-migration.test.ts` |
| 130 | CVN-7 | `CVN7-Q-FC130-NO-DOCUMENT-CAP` | `cvn-7-fixture-counts.test.ts` + stress evidence |
| 131 | CVN-7 | `CVN7-Q-FC131-REPRESENTATIVE-EXACT` | `cvn-7-fixture-counts.test.ts` |
| 132 | CVN-7 | `CVN7-Q-FC132-STRESS-EXACT` | `stress.json` validator |
| 133 | CVN-7 | `CVN7-Q-FC133-SAMPLING-EXACT` | `cvn-7-qualification-boundary.test.ts` |
| 134 | CVN-7 | `CVN7-Q-FC134-BUDGETS-EXACT` | portable/reference evidence validator |
| 140 | CVN-7 | `CVN7-Q-FC140-COMMAND-MINIMUM-SET` | 44-row trace + full suite |
| 141 | CVN-7 | `CVN7-Q-FC141-BATCH-MATRIX` | existing six CVN-5 batch suites + end-to-end |
| 142 | CVN-7 | `CVN7-Q-FC142-STRUCTURE-MATRIX` | existing CVN-3/4 suites + end-to-end |
| 143 | CVN-7 | `CVN7-Q-FC143-MODULE-MATRIX` | existing CVN-2/6 suites + end-to-end |

## Manifest rules

- FC IDs are stored as full strings, e.g. `CVN-FC-001`.
- Case IDs above are exact and unique.
- For a row referencing several existing suites, implementation resolves at least one exact test title per required bullet and records all selected titles.
- `testFile` paths are repository-relative and must exist.
- New test case titles begin with the stable case ID.
- Existing test titles remain unchanged; trace metadata references them verbatim.
- Parent matrix heading set and trace manifest set are compared at test runtime.
