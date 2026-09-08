import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, type MeasureDefinition, type ScoreDocument, type Voice } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export const CANDIDATE_MEASURE_JOURNAL_ORACLE_PATH =
  "test/core-kernel/rust-migration/fixtures/candidate-measure-journal-oracle-v1.json";

const command = (commandId: string, kind: string, id: string, payload: unknown = {}) => ({
  commandVersion: 1, commandId, target: { kind, [`${kind}Id`]: id }, payload,
});
const start = { kind: "start" };
const after = (measureId: string) => ({ kind: "after-measure", measureId });
const definition = (id: string): MeasureDefinition => ({ id, meter: { numerator: 4, denominator: 4 } });
const voice = (part: number, measure: number): Voice => ({
  id: `voice-${part}-${measure}`, defaultStaffId: `staff-${part}`,
  sequence: { start: { numerator: 0, denominator: 1 }, events: [{
    id: `event-${part}-${measure}`, duration: { base: 1, dots: 0 },
    content: { kind: "notes", notes: [{ id: `note-${part}-${measure}`, writtenPitch: { step: "C", alter: 0, octave: 4 } }] },
  }] },
});
function document(aligned = false, count = 3): ScoreDocument {
  const base = createCoreScoreFixture();
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  return {
    ...base, measureDefinitions: ids.map((index) => definition(`measure-${index}`)),
    parts: [1, 2].map((part) => ({
      ...base.parts[0]!, id: `part-${part}`,
      staves: [{ ...base.parts[0]!.staves[0]!, id: `staff-${part}` }],
      measureContents: (aligned || count === 1 ? ids : part === 1 ? [3, 1, 2] : [2, 3, 1])
        .map((measure) => ({ measureId: `measure-${measure}`, voices: [voice(part, measure)] })),
    })),
  };
}
const insert = (measure: number, anchor: unknown) => command("core.measure.insert", "document", "score-1", {
  anchor, definition: definition(`measure-${measure}`),
  contents: [2, 1].map((part) => ({ partId: `part-${part}`, voices: [voice(part, measure)] })),
});
const remove = (measure: number) => command("core.measure.remove", "measure", `measure-${measure}`);
const move = (measure: number, anchor: unknown) => command("core.measure.move", "measure", `measure-${measure}`, { anchor });

function documentJson(bus: CommandBus): string {
  const read = bus.read();
  if (!read.ok) throw new Error("measure oracle must remain readable");
  return JSON.stringify(read.value.snapshot.document);
}

export function buildCandidateMeasureJournalOracle() {
  const scenarios = [
    { label: "insert-normalizes-independent-part-orders", document: document(), commands: [insert(4, after("measure-1"))] },
    { label: "remove-normalizes-independent-part-orders", document: document(), commands: [remove(2)] },
    { label: "move-normalizes-independent-part-orders", document: document(), commands: [move(3, start)] },
    { label: "global-noop-repairs-local-order", document: document(), commands: [move(2, after("measure-1"))] },
    { label: "true-noop", document: document(true), commands: [move(2, after("measure-1"))] },
    { label: "last-measure-remove-and-same-id-rebirth", document: document(true, 1), commands: [remove(1), insert(1, start)] },
  ];
  return {
    schemaVersion: 1,
    source: "TypeScript CommandBus.submit(batch), undo, redo",
    cases: scenarios.map((scenario) => {
      const initialDocumentJson = JSON.stringify(scenario.document);
      const created = CommandBus.create(JSON.parse(initialDocumentJson) as ScoreDocument);
      if (!created.ok) throw new Error(`invalid initial document: ${scenario.label}`);
      const bus = created.value;
      const submitted = bus.submit(command("core.transaction.batch", "document", scenario.document.id, { commands: scenario.commands }));
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
export function writeCandidateMeasureJournalOracle(): void {
  writeFileSync(resolve(CANDIDATE_MEASURE_JOURNAL_ORACLE_PATH), `${JSON.stringify(buildCandidateMeasureJournalOracle())}\n`, "utf8");
}
if (require.main === module && process.argv[2] === "--write") writeCandidateMeasureJournalOracle();
