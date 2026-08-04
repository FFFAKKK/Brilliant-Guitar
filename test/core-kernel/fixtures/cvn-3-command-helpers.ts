import {
  CommandBus,
  type Fraction,
  type KernelEvent,
  type MeasureAnchor,
  type MeasureDefinition,
  type Meter,
  type ScoreDocument,
  type Voice,
} from "../../../src/core-kernel/index";

export function commandEnvelope(
  commandId: string,
  target: unknown,
  payload: unknown,
): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

export function insertMeasureCommand(input: {
  readonly documentId?: string;
  readonly anchor: MeasureAnchor;
  readonly definition: MeasureDefinition;
  readonly contents: readonly {
    readonly partId: string;
    readonly voices: readonly [Voice, ...Voice[]];
  }[];
}): Record<string, unknown> {
  return commandEnvelope(
    "core.measure.insert",
    {
      kind: "document",
      documentId: input.documentId ?? "cvn3-measure-score",
    },
    {
      anchor: input.anchor,
      definition: input.definition,
      contents: input.contents,
    },
  );
}

export function removeMeasureCommand(
  measureId: string,
): Record<string, unknown> {
  return commandEnvelope(
    "core.measure.remove",
    { kind: "measure", measureId },
    {},
  );
}

export function moveMeasureCommand(
  measureId: string,
  anchor: MeasureAnchor,
): Record<string, unknown> {
  return commandEnvelope(
    "core.measure.move",
    { kind: "measure", measureId },
    { anchor },
  );
}

export function setMeasureDefinitionCommand(
  measureId: string,
  meter: Meter,
  pickup:
    | { readonly kind: "none" }
    | { readonly kind: "duration"; readonly duration: Fraction },
): Record<string, unknown> {
  return commandEnvelope(
    "core.measure.set-definition",
    { kind: "measure", measureId },
    { meter, pickup },
  );
}

export function requireBus(document: ScoreDocument): CommandBus {
  const created = CommandBus.create(document);
  if (!created.ok) {
    throw new Error(`expected CVN-3 command bus: ${created.failure.code}`);
  }
  return created.value;
}

export function readDocument(bus: CommandBus): ScoreDocument {
  const read = bus.read();
  if (!read.ok) {
    throw new Error(`expected CVN-3 command read: ${read.failure.code}`);
  }
  return read.value.snapshot.document;
}

export function collectEvents(bus: CommandBus): KernelEvent[] {
  const events: KernelEvent[] = [];
  const subscribed = bus.subscribe((event: KernelEvent) => events.push(event));
  if (subscribed.status !== "subscribed") {
    throw new Error(`expected CVN-3 subscription: ${subscribed.failure.code}`);
  }
  return events;
}

export function measureOrders(document: ScoreDocument): readonly (readonly string[])[] {
  return [
    document.measureDefinitions.map((definition) => definition.id),
    ...document.parts.map((part) =>
      part.measureContents.map((content) => content.measureId),
    ),
  ];
}

export function assertSynchronizedMeasureOrders(document: ScoreDocument): void {
  const [globalOrder, ...partOrders] = measureOrders(document);
  if (
    globalOrder === undefined ||
    partOrders.some(
      (partOrder) =>
        partOrder.length !== globalOrder.length ||
        partOrder.some((measureId, index) => measureId !== globalOrder[index]),
    )
  ) {
    throw new Error("expected synchronized CVN-3 Measure order");
  }
}
