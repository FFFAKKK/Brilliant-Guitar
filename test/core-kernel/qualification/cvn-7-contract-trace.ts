import type { QualificationCaseTraceV1 } from "./cvn-7-qualification-contracts";

const QUALIFICATION_TEST_FILE =
  "test/core-kernel/cvn-7-contract-trace.test.ts" as const;

function trace(
  number: string,
  primaryOwner: string,
  suffix: string,
  decisiveTestFile: string,
  decisiveTestTitle: string,
): QualificationCaseTraceV1 {
  const caseId = `CVN7-Q-FC${number}-${suffix}` as const;
  return Object.freeze({
    contractId: `CVN-FC-${number}`,
    primaryOwner,
    consumerOwner: "CVN-7",
    caseId,
    qualificationTitle: caseId,
    qualificationTestFile: QUALIFICATION_TEST_FILE,
    decisiveTestFile,
    decisiveTestTitle,
  });
}

export const CVN7_CONTRACT_TRACE = Object.freeze([
  trace("001", "Parent", "FINITE-COMPLETION", "test/core-kernel/cvn-7-public-baseline.test.ts", "CVN7-D-FC001 public Core VNext surface is finite and exact"),
  trace("002", "Parent", "VERSION-EVOLUTION", "test/core-kernel/cvn-7-qualification-boundary.test.ts", "CVN7-D-FC002 version evolution remains explicit and bounded"),
  trace("010", "CVN-0", "STRICT-UNKNOWN", "test/core-kernel/public-unknown-guards.test.ts", "UG-T06 public guards reject forged synchronous built-in outcomes"),
  trace("011", "CVN-1", "STATE-RESULT", "test/core-kernel/command-system.test.ts", "CommandBus preserves K1-2 writes and adds only K1-3 read/session entry points"),
  trace("020", "CVN-3", "EXACT-INPUT", "test/core-kernel/cvn-3-strict-input.test.ts", "bounded strict capture rejects hostile shapes without property reads"),
  trace("021", "CVN-3", "EXACT-OUTPUT", "test/core-kernel/cvn-3-document-factory.test.ts", "factory creates the exact one-Measure document without a session"),
  trace("030", "CVN-3", "ANCHOR-TYPES", "test/core-kernel/command-system.test.ts", "public command contracts expose versioned stable targets and anchors"),
  trace("031", "CVN-3", "ANCHOR-RESOLUTION", "test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert resolves target and anchor before final semantic coverage and preserves rejection state"),
  trace("040", "CVN-1", "V1-SIX-COMMANDS", "test/core-kernel/command-spine-characterization.test.ts", "CVN-1 freezes the pre-refactor public command spine trace"),
  trace("041", "Parent", "VNEXT-TWENTY-TWO", "test/core-kernel/cvn-5-public-contracts.test.ts", "CVN-5 adds exactly three Core command descriptors without runtime-root growth"),
  trace("050", "CVN-3", "MEASURE-INSERT", "test/core-kernel/cvn-3-measure-insert-remove.test.ts", "insert canonicalizes shuffled Part payloads, freezes capture, and emits canonical affected facts"),
  trace("051", "CVN-3", "MEASURE-REMOVE", "test/core-kernel/cvn-3-measure-insert-remove.test.ts", "remove deletes and restores the complete Measure aggregate while final-Measure removal is atomic"),
  trace("052", "CVN-3", "MEASURE-MOVE", "test/core-kernel/cvn-3-measure-move-definition.test.ts", "move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority"),
  trace("053", "CVN-3", "MEASURE-DEFINITION", "test/core-kernel/cvn-3-measure-move-definition.test.ts", "set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history"),
  trace("060", "CVN-4", "PART-LIFECYCLE", "test/core-kernel/cvn-4-part-lifecycle.test.ts", "Part insert canonicalizes complete coverage in global Measure order and detaches input"),
  trace("061", "CVN-4", "STAFF-LIFECYCLE", "test/core-kernel/cvn-4-staff-lifecycle.test.ts", "Staff insert adds only the requested Staff and leaves Voices and assignments untouched"),
  trace("062", "CVN-4", "VOICE-LIFECYCLE", "test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice removal owns Event and Note descendants, exact undo, and final-Voice rejection"),
  trace("063", "CVN-4", "EVENT-STAFF", "test/core-kernel/cvn-4-voice-lifecycle.test.ts", "Voice and Event staff replacements preserve semantic and support separation"),
  trace("070", "CVN-4", "OWNERSHIP-CASCADE", "test/core-kernel/cvn-4-transaction-integration.test.ts", "each CVN-4 command preserves encoded undo, redo, replay, and committed event facts"),
  trace("080", "CVN-5", "RANGE-SELECTION", "test/core-kernel/address-range.test.ts", "hierarchical ranges normalize reverse endpoints in musical order"),
  trace("081", "CVN-5", "RANGE-DELETE", "test/core-kernel/range-delete.test.ts", "range delete normalizes reverse global measure endpoints and undo restores exactly"),
  trace("082", "CVN-5", "RANGE-TRANSPOSE", "test/core-kernel/range-transpose-written-pitch.test.ts", "range transpose skips rests, transforms notes, and reports the first invalid note"),
  trace("090", "CVN-5", "BATCH-ENVELOPE-LIMITS", "test/core-kernel/batch-hostile-input-resource.test.ts", "the inclusive 100-child boundary is accepted as one all-no-op batch"),
  trace("091", "CVN-5", "BATCH-ORDER", "test/core-kernel/batch-core-atomicity.test.ts", "effective Core batch commits once and undo/redo use one history entry"),
  trace("092", "CVN-5", "BATCH-FAILURE-INDEX", "test/core-kernel/batch-input-and-failure-attribution.test.ts", "the lowest failing child index wins with exactly one wrapper"),
  trace("093", "CVN-5", "BATCH-HISTORY-REPLAY", "test/core-kernel/batch-history-replay-events.test.ts", "Core replay reroutes a batch as one semantic envelope"),
  trace("100", "CVN-5", "FAILURE-UNION", "test/core-kernel/kernel-failure-adapters.test.ts", "command and history adapters cover every accepted failure code"),
  trace("101", "CVN-5", "FAILURE-PRIORITY", "test/core-kernel/batch-input-and-failure-attribution.test.ts", "outer validation stages precede every child failure"),
  trace("102", "CVN-5", "FAILURE-PRIVACY", "test/core-kernel/core-kernel-integration-boundaries.test.ts", "subscriber failures and hostile report input remain private"),
  trace("110", "CVN-2", "ENTRY-ABI", "test/core-kernel/module-sdk-contracts.test.ts", "definition handles and outer ABIs are exact, opaque, and frozen"),
  trace("111", "CVN-2", "FROZEN-ASSEMBLY", "test/core-kernel/module-catalog-assembly.test.ts", "two synthetic official modules compile into one frozen opaque catalog"),
  trace("112", "CVN-6", "RUNTIME-AUTHORITY", "test/core-kernel/module-transaction-atomicity.test.ts", "one module submit applies ordered Core plus owned-extension effects atomically"),
  trace("120", "CVN-6", "CHANGED-PIPELINE", "test/core-kernel/module-validation-classification.test.ts", "validators complete before classifiers in frozen catalog order"),
  trace("121", "CVN-6", "AVAILABILITY", "test/core-kernel/domain-availability.test.ts", "known absent, incompatible, unknown, and mixed extension states are canonical"),
  trace("122", "CVN-6", "MIGRATION", "test/core-kernel/extension-migration.test.ts", "detached extension migration replaces only the selected block"),
  trace("130", "CVN-7", "NO-DOCUMENT-CAP", "test/core-kernel/cvn-7-fixture-counts.test.ts", "CVN7-D-FC130 qualification fixture sizes do not become document caps"),
  trace("131", "CVN-7", "REPRESENTATIVE-EXACT", "test/core-kernel/cvn-7-fixture-counts.test.ts", "CVN7-D-FC131 representative fixture has exact deterministic counts"),
  trace("132", "CVN-7", "STRESS-EXACT", "test/core-kernel/cvn-7-fixture-counts.test.ts", "CVN7-D-FC132 stress fixture has exact deterministic counts"),
  trace("133", "CVN-7", "SAMPLING-EXACT", "test/core-kernel/cvn-7-qualification-boundary.test.ts", "CVN7-D-FC133 sampling pairs and aggregate rules are exact"),
  trace("134", "CVN-7", "BUDGETS-EXACT", "test/core-kernel/cvn-7-qualification-boundary.test.ts", "CVN7-D-FC134 portable and reference budgets are exact"),
  trace("140", "CVN-7", "COMMAND-MINIMUM-SET", "test/core-kernel/cvn-7-public-baseline.test.ts", "CVN7-D-FC140 all twenty-eight commands map to the fixed minimum case matrix"),
  trace("141", "CVN-7", "BATCH-MATRIX", "test/core-kernel/cvn-7-end-to-end.test.ts", "CVN7-D-FC141 batch qualification matrix is complete"),
  trace("142", "CVN-7", "STRUCTURE-MATRIX", "test/core-kernel/cvn-7-end-to-end.test.ts", "CVN7-D-FC142 structure qualification matrix is complete"),
  trace("143", "CVN-7", "MODULE-MATRIX", "test/core-kernel/cvn-7-end-to-end.test.ts", "CVN7-D-FC143 module qualification matrix is complete"),
] satisfies readonly QualificationCaseTraceV1[]);

export const CVN7_CONTRACT_IDS = Object.freeze(
  CVN7_CONTRACT_TRACE.map((entry) => entry.contractId),
);
