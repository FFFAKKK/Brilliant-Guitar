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
  } catch {
    return -1;
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
      const measureCount = measureCountFromToolResult(context.messages);
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
