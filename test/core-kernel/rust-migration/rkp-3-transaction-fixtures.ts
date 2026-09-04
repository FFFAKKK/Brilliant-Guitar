import type {
  BatchCommand,
  CoreCommandEnvelope,
  SetMetadataCommand,
} from "../../../src/core-kernel/commands/contracts";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";

export const RKP3_CORE_COMMAND_IDS = Object.freeze(
  CORE_COMMAND_DEFINITIONS.map(({ commandId }) => commandId),
);

export interface Rkp3Stage3SubmitRequestV1 {
  readonly apiVersion: 1;
  readonly command: CoreCommandEnvelope;
}

export function createRkp3Stage3SubmitRequest(
  command: CoreCommandEnvelope,
): Rkp3Stage3SubmitRequestV1 {
  return { apiVersion: 1, command };
}

export function createRkp3SetMetadataCommand(
  documentId = "score-1",
  title = "RKP-3 metadata",
): SetMetadataCommand {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId },
    payload: {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
}

export function createRkp3BatchCommand(
  commands: readonly [unknown, ...unknown[]],
  documentId = "score-1",
): BatchCommand {
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId },
    payload: { commands },
  };
}

export function createRkp3AtLimitBatchCommand(): BatchCommand {
  const leaf = createRkp3SetMetadataCommand();
  const commands = Array.from({ length: 100 }, () => structuredClone(leaf));
  const first = commands[0];
  if (first === undefined) throw new Error("at-limit batch fixture is empty");
  return createRkp3BatchCommand([first, ...commands.slice(1)]);
}

export function createRkp3OverLimitBatchPayload(): {
  readonly commands: readonly unknown[];
} {
  const leaf = createRkp3SetMetadataCommand();
  return {
    commands: Array.from({ length: 101 }, () => structuredClone(leaf)),
  };
}

export function createRkp3ScaleDocument(measureCount: number): unknown {
  if (!Number.isSafeInteger(measureCount) || measureCount < 1 || measureCount > 512) {
    throw new RangeError("RKP-3 scale measure count must be in 1..512");
  }
  const measureDefinitions = Array.from({ length: measureCount }, (_, index) => ({
    id: `scale-measure-${index}`,
    meter: { numerator: 4, denominator: 4 },
  }));
  const measureContents = Array.from({ length: measureCount }, (_, index) => ({
    measureId: `scale-measure-${index}`,
    voices: [
      {
        id: `scale-voice-${index}`,
        defaultStaffId: "scale-staff",
        sequence: {
          start: { numerator: 0, denominator: 1 },
          events:
            index === 0
              ? [
                  {
                    id: "scale-event-0",
                    duration: { base: 4, dots: 0 },
                    content: {
                      kind: "notes",
                      notes: [
                        {
                          id: "scale-note-0",
                          writtenPitch: { step: "C", alter: 0, octave: 4 },
                        },
                      ],
                    },
                  },
                ]
              : [],
        },
      },
    ],
  }));
  return {
    schemaVersion: "brilliant-score-1",
    id: "rkp3-scale",
    metadata: {
      title: "RKP-3 scale",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 120 },
    },
    measureDefinitions,
    parts: [
      {
        id: "scale-part",
        name: "Scale",
        instrument: {
          name: "Piano",
          writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
        },
        staves: [
          {
            id: "scale-staff",
            lineCount: 5,
            defaultClef: { sign: "G", line: 2 },
          },
        ],
        measureContents,
      },
    ],
    extensions: [],
  };
}
