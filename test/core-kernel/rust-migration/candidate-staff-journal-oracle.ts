import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, type Part, type ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export const CANDIDATE_STAFF_JOURNAL_ORACLE_PATH =
  "test/core-kernel/rust-migration/fixtures/candidate-staff-journal-oracle-v1.json";

/**
 * Known legacy TS history gap, not the required Rust history behavior:
 * insert-staff records an inverse remove-staff containing only the public ID.
 * Undo restores the removed Part with two same-ID Staff occurrences, then that
 * inverse cannot identify which occurrence to remove. The real TS undo rejects
 * with history.invariant-violation; redo then rejects with history.empty-redo.
 * The initial/final documents are equal here, so document equality alone must
 * never be interpreted as successful undo/redo. Keep the observed results in
 * the fixture; a Rust identity-based inverse must be evaluated separately.
 */
export const LEGACY_DUPLICATE_STAFF_HISTORY_GAP_LABEL =
  "duplicate-prefix-staff-repaired-by-parent-removal";

interface Scenario {
  readonly label: string;
  readonly document: ScoreDocument;
  readonly commands: readonly unknown[];
}

export interface CandidateStaffJournalOracleCase {
  readonly label: string;
  readonly initialDocumentJson: string;
  readonly commandsJson: readonly string[];
  readonly expected: {
    readonly status: "committed" | "no-op" | "rejected";
    readonly failureJson?: string;
    readonly earlyFailureIndex?: number;
    readonly finalDocumentJson: string;
    readonly submitResultJson: string;
    readonly undoResultJson: string;
    readonly redoResultJson: string;
    readonly undoDocumentJson: string;
    readonly redoDocumentJson: string;
  };
}

const command = (commandId: string, kind: string, id: string, payload: unknown = {}) => ({
  commandVersion: 1,
  commandId,
  target: { kind, [`${kind}Id`]: id },
  payload,
});
const start = { kind: "start" };
const afterStaff = (staffId: string) => ({ kind: "after-staff", staffId });
const staff = (id: string, lineCount = 5) => ({
  id, lineCount, defaultClef: { sign: "G", line: 2 },
});
const insertStaff = (id: string, partId = "part-1", anchor: unknown = start, lineCount = 5) =>
  command("core.staff.insert", "part", partId, { anchor, staff: staff(id, lineCount) });
const removeStaff = (id: string) => command("core.staff.remove", "staff", id);
const staffDefinition = (id: string, lineCount: number) =>
  command("core.staff.set-definition", "staff", id, { lineCount, defaultClef: { sign: "G", line: 2 } });
const moveStaff = (id: string, anchor: unknown) => command("core.staff.move", "staff", id, { anchor });
const voiceStaff = (staffId: string, voiceId = "voice-1") =>
  command("core.voice.set-default-staff", "voice", voiceId, { staffId });
const eventStaff = (staffId: string) => command("core.event.set-staff-assignment", "event", "event-1", {
  assignment: { kind: "staff", staffId },
});
const removePart = (id: string) => command("core.part.remove", "part", id);
const insertPart = (part: Part) => command("core.part.insert", "document", "score-1", { anchor: start, part });

function otherPart(suffix: string): Part {
  const source = createCoreScoreFixture().parts[0]!;
  return {
    ...source,
    id: `part-${suffix}`,
    staves: [{ ...source.staves[0]!, id: `staff-${suffix}` }],
    measureContents: [{
      measureId: "measure-1",
      voices: [{
        id: `voice-${suffix}`,
        defaultStaffId: `staff-${suffix}`,
        sequence: {
          start: { numerator: 0, denominator: 1 },
          events: [{ id: `event-${suffix}`, duration: { base: 1, dots: 0 }, content: { kind: "rest" } }],
        },
      }],
    }],
  };
}

function twoPartDocument(withSpare = false): ScoreDocument {
  const base = createCoreScoreFixture();
  const first = base.parts[0]!;
  return {
    ...base,
    parts: [
      withSpare ? { ...first, staves: [...first.staves, { ...first.staves[0]!, id: "staff-spare" }] } : first,
      otherPart("far"),
    ],
  };
}

function scenarios(): readonly Scenario[] {
  const prefixId = "prefix-\ud800";
  return [
    {
      label: "prefix-insert-definition-move-remove",
      document: createCoreScoreFixture(),
      commands: [
        insertStaff(prefixId), staffDefinition(prefixId, 6),
        insertStaff("prefix-aux"), moveStaff(prefixId, start), removeStaff("prefix-aux"),
      ],
    },
    {
      label: "prefix-remove-and-reinsert-same-id",
      document: createCoreScoreFixture(),
      commands: [insertStaff("reused"), removeStaff("reused"), insertStaff("reused", "part-1", afterStaff("staff-1"), 6)],
    },
    {
      label: "effective-staff-journal-net-zero",
      document: createCoreScoreFixture(),
      commands: [insertStaff("temporary"), staffDefinition("staff-1", 6), removeStaff("temporary"), staffDefinition("staff-1", 5)],
    },
    {
      label: "empty-prefix-staff-repaired-by-parent-removal",
      document: createCoreScoreFixture(),
      commands: [insertPart(otherPart("temporary")), insertStaff("", "part-temporary"), removePart("part-temporary")],
    },
    {
      label: LEGACY_DUPLICATE_STAFF_HISTORY_GAP_LABEL,
      document: createCoreScoreFixture(),
      commands: [insertPart(otherPart("temporary")), insertStaff("staff-temporary", "part-temporary"), removePart("part-temporary")],
    },
    {
      label: "duplicate-staff-target-ambiguity",
      document: createCoreScoreFixture(),
      commands: [insertStaff("staff-1"), staffDefinition("staff-1", 6)],
    },
    {
      label: "staff-anchor-must-belong-to-target-part",
      document: twoPartDocument(),
      commands: [insertStaff("local-prefix"), moveStaff("local-prefix", afterStaff("staff-far"))],
    },
    {
      label: "far-part-invalid-reference-does-not-block-local-removal",
      document: twoPartDocument(true),
      commands: [voiceStaff("staff-spare", "voice-far"), removeStaff("staff-spare"), voiceStaff("staff-far", "voice-far")],
    },
    {
      label: "current-prefix-voice-reference-blocks-staff-removal",
      document: createCoreScoreFixture(),
      commands: [insertStaff("referenced-prefix"), voiceStaff("referenced-prefix"), removeStaff("referenced-prefix")],
    },
    {
      label: "current-prefix-event-reference-blocks-staff-removal",
      document: createCoreScoreFixture(),
      commands: [insertStaff("event-prefix"), eventStaff("event-prefix"), removeStaff("event-prefix")],
    },
  ];
}

function documentJson(bus: CommandBus): string {
  const read = bus.read();
  if (!read.ok) throw new Error("TS staff oracle must remain readable");
  return JSON.stringify(read.value.snapshot.document);
}

function observe(scenario: Scenario): CandidateStaffJournalOracleCase {
  const initialDocumentJson = JSON.stringify(scenario.document);
  const commandsJson = scenario.commands.map((value) => JSON.stringify(value));
  // Exercise only the independent TypeScript CommandBus. Rust code/results do
  // not participate in generating any expectation, including failure indices.
  const created = CommandBus.create(JSON.parse(initialDocumentJson) as ScoreDocument);
  if (!created.ok) throw new Error(`invalid TS oracle initial document: ${scenario.label}`);
  const bus = created.value;
  const submitted = bus.submit(command("core.transaction.batch", "document", scenario.document.id, {
    commands: commandsJson.map((value) => JSON.parse(value) as unknown),
  }));
  const finalDocumentJson = documentJson(bus);
  const undone = bus.undo();
  const undoDocumentJson = documentJson(bus);
  const redone = bus.redo();
  const redoDocumentJson = documentJson(bus);
  const failure = submitted.status === "rejected" ? submitted.failure : undefined;
  return {
    label: scenario.label,
    initialDocumentJson,
    commandsJson,
    expected: {
      status: submitted.status,
      ...(failure === undefined ? {} : { failureJson: JSON.stringify(failure) }),
      ...(failure?.code === "command.batch-child-rejected" ? { earlyFailureIndex: failure.failedCommandIndex } : {}),
      finalDocumentJson,
      submitResultJson: JSON.stringify(submitted),
      undoResultJson: JSON.stringify(undone),
      redoResultJson: JSON.stringify(redone),
      undoDocumentJson,
      redoDocumentJson,
    },
  };
}

export function buildCandidateStaffJournalOracle() {
  return {
    schemaVersion: 1 as const,
    source: "TypeScript CommandBus.submit(batch), undo, redo" as const,
    cases: scenarios().map(observe),
  };
}

export function writeCandidateStaffJournalOracle(): void {
  writeFileSync(resolve(CANDIDATE_STAFF_JOURNAL_ORACLE_PATH), `${JSON.stringify(buildCandidateStaffJournalOracle())}\n`, "utf8");
}

if (require.main === module && process.argv[2] === "--write") writeCandidateStaffJournalOracle();
