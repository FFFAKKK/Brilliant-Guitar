import type {
  AgentProvidedUserInput,
  AgentRequiredUserInput,
} from "./agent-contracts.ts";
import type { AgentRunRecord } from "./run-controller.ts";

export interface AgentUserInputConsumptionRecord {
  readonly requestId: string;
  readonly requestEventId: string;
  readonly requestedAt: number;
  readonly providedEventId: string;
  readonly providedAt: number;
  readonly requiredInput: AgentRequiredUserInput;
  readonly providedInput: AgentProvidedUserInput;
}

export function projectAgentUserInputConsumptions(
  run: AgentRunRecord,
): readonly AgentUserInputConsumptionRecord[] {
  const pending = new Map<string, Readonly<{
    eventId: string;
    occurredAt: number;
    input: AgentRequiredUserInput;
  }>>();
  const consumptions: AgentUserInputConsumptionRecord[] = [];

  for (const record of run.events) {
    if (record.event.type === "user-input.required") {
      pending.set(record.event.input.requestId, {
        eventId: record.eventId,
        occurredAt: record.occurredAt,
        input: record.event.input,
      });
      continue;
    }
    if (record.event.type !== "user-input.provided") continue;
    const required = pending.get(record.event.input.requestId);
    if (required === undefined) continue;
    consumptions.push(Object.freeze({
      requestId: record.event.input.requestId,
      requestEventId: required.eventId,
      requestedAt: required.occurredAt,
      providedEventId: record.eventId,
      providedAt: record.occurredAt,
      requiredInput: required.input,
      providedInput: record.event.input,
    }));
    pending.delete(record.event.input.requestId);
  }

  return Object.freeze(consumptions);
}

export function getAgentUserInputConsumption(
  run: AgentRunRecord,
  requestId: string,
): AgentUserInputConsumptionRecord | null {
  return projectAgentUserInputConsumptions(run).find(
    (record) => record.requestId === requestId,
  ) ?? null;
}
