import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { cloneCvn4ScoreFixture } from "../fixtures/cvn-4-score";

export const CANDIDATE_RANGE_JOURNAL_ORACLE_PATH =
  "test/core-kernel/rust-migration/fixtures/candidate-range-journal-oracle-v1.json";
const command = (commandId: string, payload: unknown) => ({
  commandVersion: 1, commandId,
  target: { kind: "document", documentId: "cvn4-score" }, payload,
});
const measure = (index: number) => ({ kind: "measure", measureId: `cvn4-measure-${index}` });
const partMeasure = (index: number) => ({ kind: "part-measure", partId: "cvn4-part-a", measureId: `cvn4-measure-${index}` });
const event = (suffix: string) => ({ kind: "voice-event", voiceId: "cvn4-voice-a-1-primary", eventId: `cvn4-event-a-1-${suffix}` });
const measures = (start: number, end = start) => ({ kind: "measure-range", start: measure(start), end: measure(end) });
const partMeasures = (start: number, end = start) => ({ kind: "part-measure-range", start: partMeasure(start), end: partMeasure(end) });
const events = (start: string, end = start) => ({ kind: "voice-event-range", start: event(start), end: event(end) });
const remove = (range: unknown) => command("core.range.delete", { range });
const transpose = (range: unknown, zero = false) => command("core.range.transpose-written-pitch", {
  range, transposition: { diatonicSteps: zero ? 0 : 1, chromaticSemitones: zero ? 0 : 2 },
});
function documentJson(bus: CommandBus): string {
  const read = bus.read();
  if (!read.ok) throw new Error("range oracle must remain readable");
  return JSON.stringify(read.value.snapshot.document);
}
export function buildCandidateRangeJournalOracle() {
  const scenarios = [
    { label: "delete-measure-range", commands: [remove(measures(2))] },
    { label: "delete-part-measure-range", commands: [remove(partMeasures(1, 2))] },
    { label: "delete-voice-event-range", commands: [remove(events("notes"))] },
    { label: "transpose-measure-range", commands: [transpose(measures(1))] },
    { label: "transpose-part-measure-range", commands: [transpose(partMeasures(1, 2))] },
    { label: "transpose-voice-event-range", commands: [transpose(events("notes", "rest"))] },
    { label: "reverse-endpoints-preserve-local-content-order", commands: [remove(partMeasures(2, 1))] },
    { label: "rest-only-and-zero-transposition-noop", commands: [transpose(measures(2)), transpose(measures(1), true)] },
  ];
  return {
    schemaVersion: 1, source: "TypeScript CommandBus.submit(batch), undo, redo",
    cases: scenarios.map((scenario) => {
      const initialDocumentJson = JSON.stringify(cloneCvn4ScoreFixture());
      const created = CommandBus.create(JSON.parse(initialDocumentJson) as ScoreDocument);
      if (!created.ok) throw new Error(`invalid initial document: ${scenario.label}`);
      const bus = created.value;
      const submitted = bus.submit(command("core.transaction.batch", { commands: scenario.commands }));
      const finalDocumentJson = documentJson(bus);
      const undone = bus.undo();
      const undoDocumentJson = documentJson(bus);
      const redone = bus.redo();
      return {
        label: scenario.label, initialDocumentJson, commandsJson: scenario.commands.map((value) => JSON.stringify(value)),
        expected: { status: submitted.status, submitResultJson: JSON.stringify(submitted), finalDocumentJson,
          undoResultJson: JSON.stringify(undone), undoDocumentJson,
          redoResultJson: JSON.stringify(redone), redoDocumentJson: documentJson(bus) },
      };
    }),
  };
}
export function writeCandidateRangeJournalOracle(): void {
  writeFileSync(resolve(CANDIDATE_RANGE_JOURNAL_ORACLE_PATH), `${JSON.stringify(buildCandidateRangeJournalOracle())}\n`, "utf8");
}
if (require.main === module && process.argv[2] === "--write") writeCandidateRangeJournalOracle();
