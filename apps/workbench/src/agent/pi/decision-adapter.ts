import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type TSchema } from "typebox";
import type { AgentDecision, AgentToolCall } from "../agent-contracts.ts";
import {
  createFirstPartyAgentPlugin,
  type AgentPluginDecisionObserver,
  type AgentPluginPort,
  type AgentPluginRequest,
} from "../agent-plugin-contract.ts";
import type { AgentProviderStreamEventPayload } from "../provider-stream.ts";
import type { PiAgentModel, PiAgentStreamFn } from "./types.ts";

const EMPTY_OBJECT_SCHEMA = Type.Object({});

export interface PiDecisionPluginOptions {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly model: PiAgentModel;
  readonly streamFn: PiAgentStreamFn;
}

function assistantText(event: Extract<AgentEvent, { type: "message_end" }>): string {
  if (event.message.role !== "assistant") return "";
  return event.message.content
    .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("");
}

function toolCalls(
  event: Extract<AgentEvent, { type: "message_end" }>,
  toolset: AgentPluginRequest["toolset"],
): AgentToolCall[] {
  if (event.message.role !== "assistant") return [];
  const calls: AgentToolCall[] = [];
  for (const item of event.message.content) {
    if (item.type !== "toolCall") continue;
    const descriptor = toolset.toolDescriptors.find((candidate) => candidate.id === item.name);
    if (descriptor === undefined) throw new Error(`Pi returned an unknown tool: ${item.name}`);
    calls.push({
      callId: item.id,
      capabilityId: item.name,
      contractVersion: descriptor.contractVersion,
      input: item.arguments,
    });
  }
  return calls;
}

function createDecisionTools(toolset: AgentPluginRequest["toolset"]): AgentTool[] {
  return toolset.toolDescriptors.map((descriptor) => ({
    name: descriptor.id,
    label: descriptor.name,
    description: descriptor.description,
    parameters: typeof descriptor.inputSchema === "object" && descriptor.inputSchema !== null
      ? descriptor.inputSchema as TSchema
      : EMPTY_OBJECT_SCHEMA,
    execute: async () => ({
      content: [{ type: "text" as const, text: "Tool execution is owned by AgentRunController." }],
      details: null,
      isError: true,
      terminate: true,
    }),
  }));
}

function promptFor(request: AgentPluginRequest): string {
  const context = request.context.contextItems.map((item) => ({
    kind: item.kind,
    sourceId: item.sourceId,
    content: item.content,
  }));
  return JSON.stringify({ goal: request.goal, context });
}

/**
 * Pi-backed Agent Plugin. Pi decides; AgentRunController executes.
 * The adapter deliberately has no AgentCapabilityPort dependency.
 */
export function createPiDecisionPlugin(options: PiDecisionPluginOptions): AgentPluginPort {
  const decide = async (
      request: AgentPluginRequest,
      signal?: AbortSignal | null,
      observer?: AgentPluginDecisionObserver | null,
    ): Promise<AgentDecision> => {
      if (signal?.aborted) throw new DOMException("Agent decision was cancelled", "AbortError");
      let decision: AgentDecision | null = null;
      let answer: string | null = null;
      let providerError: Error | null = null;
      let terminalEventEmitted = false;
      let sequence = 0;
      const emit = (event: AgentProviderStreamEventPayload): void => {
        observer?.({ ...event, runId: request.runId, turnId: request.turnId, sequence: ++sequence });
      };
      let agent: Agent | null = null;
      const abort = (): void => agent?.abort();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        agent = new Agent({
          initialState: {
            model: options.model,
            tools: createDecisionTools(request.toolset),
          },
          streamFn: options.streamFn,
          beforeToolCall: async () => ({
            block: true,
            reason: "Tool execution is owned by AgentRunController.",
            terminate: true,
          }),
          finishTurn: async () => ({ action: "end" as const }),
        });
        agent.subscribe((event) => {
          if (event.type === "agent_start") emit({ type: "response.started" });
          if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            emit({ type: "response.text-delta", delta: event.assistantMessageEvent.delta });
          }
          if (event.type === "message_end") {
            if (event.message.role === "assistant") {
              if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
                providerError = new Error(event.message.errorMessage ?? `Pi response ${event.message.stopReason}`);
                return;
              }
              const calls = toolCalls(event, request.toolset);
              if (calls.length > 0) {
                decision = { kind: "tool-calls", calls };
                return;
              }
              const text = assistantText(event);
              if (text.length > 0) answer = text;
            }
          }
          if (event.type === "agent_end") {
            if (signal?.aborted) {
              emit({ type: "response.failed", code: "aborted" });
            } else if (providerError !== null) {
              emit({ type: "response.failed", code: "provider-failed" });
            } else if (decision !== null || answer !== null) {
              emit({ type: "response.completed" });
            } else {
              providerError = new Error("Pi completed without an assistant decision");
              emit({ type: "response.failed", code: "provider-failed" });
            }
            terminalEventEmitted = true;
          }
        });
        await agent.prompt(promptFor(request));
        await agent.waitForIdle();
        if (signal?.aborted) throw new DOMException("Agent decision was cancelled", "AbortError");
        if (providerError !== null) throw providerError;
        if (decision !== null) return decision;
        if (answer === null) throw new Error("Pi completed without an assistant decision");
        return { kind: "finish", reason: "completed", text: answer };
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Agent decision was cancelled", "AbortError");
        if (!terminalEventEmitted) {
          emit({ type: "response.failed", code: error instanceof Error ? error.name : "agent-failed" });
        }
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    };
  return createFirstPartyAgentPlugin({
    id: options.id,
    version: options.version,
    label: options.label,
    decide,
  });
}
