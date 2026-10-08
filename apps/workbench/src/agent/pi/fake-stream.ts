import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { PiAgentModel, PiAgentStreamFn } from "./types.ts";

export interface ScoreSummaryFakeStream {
  readonly model: PiAgentModel;
  readonly streamFn: PiAgentStreamFn;
  readonly callCount: () => number;
}

function lastToolResult(messages: readonly AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "toolResult" && message.toolName === "score.read-summary") return message;
  }
  return undefined;
}

function measureCountFromToolResult(messages: readonly AgentMessage[]): number {
  const result = lastToolResult(messages);
  const text = result?.content.find((item) => item.type === "text");
  if (!text || text.type !== "text") return -1;
  try {
    const parsed: unknown = JSON.parse(text.text);
    if (typeof parsed === "object" && parsed !== null && "measureCount" in parsed
      && typeof parsed.measureCount === "number") return parsed.measureCount;
    // Controller replay includes invocation/source metadata around the actual result.
    if (typeof parsed === "object" && parsed !== null && "data" in parsed
      && typeof parsed.data === "object" && parsed.data !== null && "measureCount" in parsed.data
      && typeof parsed.data.measureCount === "number") return parsed.data.measureCount;
  } catch {
    return -1;
  }
  return -1;
}

function measureCountFromContextPrompt(messages: readonly AgentMessage[]): number {
  const findMeasureCount = (value: unknown): number | null => {
    if (typeof value !== "object" || value === null) return null;
    if (!Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.measureCount === "number") return candidate.measureCount;
      for (const child of Object.values(candidate)) {
        const found = findMeasureCount(child);
        if (found !== null) return found;
      }
      return null;
    }
    for (const child of value) {
      const found = findMeasureCount(child);
      if (found !== null) return found;
    }
    return null;
  };
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    try {
      const content = typeof message.content === "string"
        ? message.content
        : message.content
          .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
          .map((item) => item.text)
          .join("");
      const parsed: unknown = JSON.parse(content);
      const count = findMeasureCount(parsed);
      if (count !== null) return count;
    } catch {
      // The ordinary goal prompt is not a serialized context envelope.
    }
  }
  return -1;
}

/**
 * A deterministic two-turn model: request the real score summary first, then
 * read that tool result from the transcript before composing the answer.
 */
export function createScoreSummaryFakeStream(): ScoreSummaryFakeStream {
  const faux = createFauxCore({
    api: "fake-chat",
    provider: "fake",
    models: [{ id: "fake-score-model", name: "Fake score model" }],
  });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("score.read-summary", {}, { id: "score-summary-call" }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const measureCount = Math.max(
        measureCountFromToolResult(context.messages),
        measureCountFromContextPrompt(context.messages),
      );
      return fauxAssistantMessage(
        `当前乐谱共有 ${measureCount} 个小节。`,
        { stopReason: "stop" },
      );
    },
  ]);
  return {
    model: faux.getModel() as PiAgentModel,
    streamFn: faux.streamSimple as PiAgentStreamFn,
    callCount: () => faux.state.callCount,
  };
}
