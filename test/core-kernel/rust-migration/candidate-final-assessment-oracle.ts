import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, type Part, type ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export const CANDIDATE_FINAL_ASSESSMENT_ORACLE_PATH =
  "test/core-kernel/rust-migration/fixtures/candidate-final-assessment-oracle-v1.json";

export interface CandidateFinalAssessmentOracleCase {
  readonly label: string;
  readonly initialDocumentJson: string;
  readonly commandsJson: readonly string[];
  readonly expected: {
    readonly status: "committed" | "no-op" | "rejected";
    readonly submitResultJson: string;
    readonly failureJson?: string;
    readonly earlyFailureIndex?: number;
    readonly finalDocumentJson: string;
  };
}

const command = (commandId: string, kind: string, id: string, payload: unknown = {}) => ({
  commandVersion: 1, commandId, target: { kind, [`${kind}Id`]: id }, payload,
});
const start = { kind: "start" };
const insertPart = (part: Part) => command("core.part.insert", "document", "score-1", { anchor: start, part });
const removePart = (id: string) => command("core.part.remove", "part", id);
const staff = (id: string, lineCount = 5): Part["staves"][number] => ({ id, lineCount, defaultClef: { sign: "G", line: 2 } });
const insertStaff = (id: string) => command("core.staff.insert", "part", "part-1", { anchor: start, staff: staff(id) });
const metadata = (title: string, bpm = 120) => command("core.document.set-metadata", "document", "score-1", {
  metadata: { ...createCoreScoreFixture().metadata, title, tempo: { bpm } },
});
const voiceStaff = (staffId: string) => command("core.voice.set-default-staff", "voice", "voice-1", { staffId });
const eventStaff = (staffId: string) => command("core.event.set-staff-assignment", "event", "event-1", {
  assignment: { kind: "staff", staffId },
});

function part(suffix: string, options: { emptyStaff?: boolean; badMusic?: boolean; missingStaff?: boolean } = {}): Part {
  const source = createCoreScoreFixture().parts[0]!;
  return {
    ...source, id: `part-${suffix}`, name: `Part ${suffix}`,
    staves: [{ ...source.staves[0]!, id: options.emptyStaff ? "" : `staff-${suffix}`, lineCount: options.badMusic ? 0 : 5 }],
    measureContents: [{ measureId: "measure-1", voices: [{
      id: `voice-${suffix}`, defaultStaffId: options.missingStaff ? "missing-\ud800" : `staff-${suffix}`,
      sequence: { start: { numerator: 0, denominator: 1 }, events: [{
        id: `event-${suffix}`, duration: { base: 1, dots: 0 },
        content: { kind: "notes", notes: [{ id: `note-${suffix}`, writtenPitch: {
          step: "C", alter: 0, octave: options.badMusic ? 100 : 4,
        } }] },
      }] },
    }] }],
  };
}

function scenarios(): readonly { label: string; commands: readonly unknown[] }[] {
  const missing = { ...part("missing"), measureContents: [] };
  const repeated = part("repeated");
  const repeatedCoverage = { ...repeated, measureContents: [
    repeated.measureContents[0]!, { measureId: "measure-1", voices: [] },
  ] };
  const invalid = part("invalid-\ud800", { emptyStaff: true, badMusic: true, missingStaff: true });
  return [
    { label: "empty-nested-staff-and-missing-reference", commands: [insertPart(part("empty", { emptyStaff: true }))] },
    { label: "duplicate-inserted-before-old-staff", commands: [insertStaff("staff-1")] },
    { label: "empty-part-and-cross-kind-duplicate", commands: [insertPart({ ...part("cross"), id: "", staves: [staff("event-1")] })] },
    { label: "missing-measure-coverage", commands: [insertPart(missing)] },
    { label: "repeated-and-unknown-measure-coverage", commands: [insertPart({ ...repeatedCoverage, measureContents: [
      ...repeatedCoverage.measureContents, { measureId: "unknown-\udfff", voices: [] },
    ] })] },
    { label: "raw-voice-and-event-missing-staff", commands: [voiceStaff(""), eventStaff("missing-\ud800")] },
    { label: "tempo-staff-pitch-cross-fault-order", commands: [metadata("bad-\ud800", 0), insertPart(invalid)] },
    { label: "typed-prefix-before-invalid-final", commands: [metadata("prefix-\ud800"), insertPart(invalid)] },
    { label: "typed-prefix-invalid-part-later-repaired", commands: [metadata("prefix-\ud800"), insertPart(invalid), removePart(invalid.id)] },
    { label: "invalid-part-removal-committed-net-zero", commands: [insertPart(invalid), removePart(invalid.id)] },
    { label: "unpaired-staff-crud-move-final-valid", commands: [
      insertStaff("staff-\ud800"),
      command("core.staff.set-definition", "staff", "staff-\ud800", { lineCount: 6, defaultClef: { sign: "G", line: 2 } }),
      command("core.staff.move", "staff", "staff-\ud800", { anchor: { kind: "after-staff", staffId: "staff-1" } }),
      insertStaff("temporary"), command("core.staff.remove", "staff", "temporary"),
    ] },
    { label: "duplicate-target-child-failure-precedes-final-faults", commands: [
      metadata("bad-tempo", 0), insertStaff("staff-1"),
      command("core.staff.set-definition", "staff", "staff-1", { lineCount: 6, defaultClef: { sign: "G", line: 2 } }),
    ] },
  ];
}

export function buildCandidateFinalAssessmentOracle() {
  const cases: CandidateFinalAssessmentOracleCase[] = scenarios().map(({ label, commands }) => {
    const initialDocumentJson = JSON.stringify(createCoreScoreFixture());
    const commandsJson = commands.map((value) => JSON.stringify(value));
    // Expectations come exclusively from the real TypeScript public batch path.
    // Inner JSON strings retain isolated UTF-16 units in the outer fixture.
    const created = CommandBus.create(JSON.parse(initialDocumentJson) as ScoreDocument);
    if (!created.ok) throw new Error(`invalid initial document: ${label}`);
    const bus = created.value;
    const submitted = bus.submit(command("core.transaction.batch", "document", "score-1", {
      commands: commandsJson.map((value) => JSON.parse(value) as unknown),
    }));
    const read = bus.read();
    if (!read.ok) throw new Error(`unreadable oracle result: ${label}`);
    const failure = submitted.status === "rejected" ? submitted.failure : undefined;
    return { label, initialDocumentJson, commandsJson, expected: {
      status: submitted.status, submitResultJson: JSON.stringify(submitted),
      ...(failure === undefined ? {} : { failureJson: JSON.stringify(failure) }),
      ...(failure?.code === "command.batch-child-rejected" ? { earlyFailureIndex: failure.failedCommandIndex } : {}),
      finalDocumentJson: JSON.stringify(read.value.snapshot.document),
    } };
  });
  return { schemaVersion: 1 as const, source: "TypeScript CommandBus.submit(batch)" as const, cases };
}

export function writeCandidateFinalAssessmentOracle(): void {
  writeFileSync(resolve(CANDIDATE_FINAL_ASSESSMENT_ORACLE_PATH), `${JSON.stringify(buildCandidateFinalAssessmentOracle())}\n`, "utf8");
}

if (require.main === module && process.argv[2] === "--write") writeCandidateFinalAssessmentOracle();
