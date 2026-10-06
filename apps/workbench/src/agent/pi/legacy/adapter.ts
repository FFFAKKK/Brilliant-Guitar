/**
 * Legacy Pi prototype. This module owns the old direct capability execution
 * path and must not be used by new Agent Plugins.
 */
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { CapabilityResult, ScoreSummaryV1 } from "../../../contracts/capability.ts";
import { AgentCapabilityPortError } from "../../capability-port.ts";
import {
  PiAgentInputError,
  type PiAgentError,
  type PiAgentEvent,
  type PiAgentRunInput,
  type PiAgentRunResult,
  type PiAgentTerminalStatus,
} from "./types.ts";

const EMPTY_OBJECT_SCHEMA = Type.Object({});
const TOOL_RESULT_RANGE_BUDGET = 1_000;

function errorFromUnknown(error: unknown, fallbackCode: string): PiAgentError {
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : String(error),
  };
}

function documentPrecondition(input: PiAgentRunInput["workspace"]) {
  if (input.documentId === null || input.documentVersion === null) return null;
  return { documentId: input.documentId, documentVersion: input.documentVersion };
}

function textFromAssistantMessage(message: AgentEvent extends never ? never : Extract<AgentEvent, { type: "message_end" }>["message"]): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("");
}

function isToolCallMessage(message: Extract<AgentEvent, { type: "message_end" }>["message"]): boolean {
  return message.role === "assistant" && message.content.some((item) => item.type === "toolCall");
}

function capabilityFailure(result: CapabilityResult<unknown>): PiAgentError {
  if (result.status === "completed") {
    return { code: "capability-failed", message: "Capability returned no failure details" };
  }
  return {
    code: result.code,
    message: result.message,
  };
}

function createScoreSummaryTool(input: PiAgentRunInput, onFailure: (error: PiAgentError) => void): AgentTool {
  return {
    name: "score.read-summary",
    label: "读取乐谱概要",
    description: "读取当前乐谱的标题、文档版本和小节数量。",
    parameters: EMPTY_OBJECT_SCHEMA,
    execute: async (toolCallId, _params, signal) => {
      if (signal?.aborted || input.signal?.aborted) {
        const error = { code: "aborted", message: "Agent run was aborted" } satisfies PiAgentError;
        onFailure(error);
        return {
          content: [{ type: "text" as const, text: error.message }],
          details: error,
          isError: true,
          terminate: true,
        };
      }
      const request = {
        invocationId: `${input.runId}:${toolCallId}`,
        capabilityId: "score.read-summary",
        contractVersion: 1,
        workspaceId: input.workspace.workspaceId,
        documentPrecondition: documentPrecondition(input.workspace),
        input: {},
      } as const;
      try {
        const result = await input.capabilities.invoke(request, {
          workspace: input.workspace,
          rangeBudget: TOOL_RESULT_RANGE_BUDGET,
        });
        if (result.status !== "completed") {
          const error = capabilityFailure(result);
          onFailure(error);
          return {
            content: [{ type: "text" as const, text: error.message }],
            details: error,
            isError: true,
            terminate: true,
          };
        }
        const summary = result.data as ScoreSummaryV1;
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary) }],
          details: summary,
        };
      } catch (error) {
        const mapped = error instanceof AgentCapabilityPortError
          ? {
              code: error.outcome === "definite-failure" ? "capability-rejected" : "capability-unknown",
              message: error.message,
            }
          : errorFromUnknown(error, "capability-failed");
        onFailure(mapped);
        return {
          content: [{ type: "text" as const, text: mapped.message }],
          details: mapped,
          isError: true,
          terminate: true,
        };
      }
    },
  };
}

function validateInput(input: PiAgentRunInput): void {
  if (!input.runId.trim()) throw new PiAgentInputError("runId must not be empty");
  if (!input.goal.trim()) throw new PiAgentInputError("goal must not be empty");
  if (!input.workspace.workspaceId.trim()) throw new PiAgentInputError("workspaceId must not be empty");
  if ((input.workspace.documentId === null) !== (input.workspace.documentVersion === null)) {
    throw new PiAgentInputError("workspace document identity must be complete or null");
  }
}

/** Runs one isolated Pi-backed Agent and returns only product-level events. */
export async function runPiAgent(input: PiAgentRunInput): Promise<PiAgentRunResult> {
  validateInput(input);
  const events: PiAgentEvent[] = [];
  let terminal: PiAgentRunResult | undefined;
  let answer: string | undefined;
  let failure: PiAgentError | undefined;
  let cancellationRequested = input.signal?.aborted ?? false;

  const emit = async (event: PiAgentEvent): Promise<void> => {
    events.push(event);
    await input.onEvent?.(event);
  };
  const finish = async (status: PiAgentTerminalStatus, error?: PiAgentError): Promise<void> => {
    if (terminal) return;
    const result: PiAgentRunResult = {
      runId: input.runId,
      status,
      ...(answer === undefined ? {} : { answer }),
      ...(error === undefined ? {} : { error }),
      events,
    };
    terminal = result;
    await emit({
      type: "run.finished",
      runId: input.runId,
      status,
      ...(answer === undefined ? {} : { answer }),
      ...(error === undefined ? {} : { error }),
    });
    terminal = { ...result, events };
  };

  let agent: Agent | undefined;
  const abort = () => {
    cancellationRequested = true;
    agent?.abort();
  };
  input.signal?.addEventListener("abort", abort, { once: true });

  try {
    if (cancellationRequested) {
      await finish("aborted", { code: "aborted", message: "Agent run was aborted" });
      return terminal as PiAgentRunResult;
    }

    let toolFailure: PiAgentError | undefined;
    const tool = createScoreSummaryTool(input, (error) => {
      toolFailure = error;
      failure = error;
    });
    agent = new Agent({
      initialState: { model: input.model, tools: [tool] },
      streamFn: input.streamFn,
      beforeToolCall: async (_context, signal) => {
        if (cancellationRequested || signal?.aborted) {
          const error = { code: "aborted", message: "Agent run was aborted" } satisfies PiAgentError;
          toolFailure = error;
          failure = error;
          return { block: true, reason: error.message, terminate: true };
        }
        return undefined;
      },
      finishTurn: async () => {
        if (cancellationRequested || toolFailure !== undefined) return { action: "end" };
        return undefined;
      },
    });
    agent.subscribe(async (event) => {
      if (event.type === "agent_start") {
        await emit({ type: "run.started", runId: input.runId, goal: input.goal });
      } else if (event.type === "tool_execution_start") {
        await emit({
          type: "tool.started",
          runId: input.runId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args,
        });
      } else if (event.type === "tool_execution_end") {
        const status = cancellationRequested
          ? "aborted"
          : event.isError ? "failed" : "completed";
        await emit({
          type: "tool.finished",
          runId: input.runId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status,
          ...(event.isError ? { error: failure ?? { code: "tool-failed", message: "Tool execution failed" } } : { output: event.result?.details }),
        });
      } else if (event.type === "message_end" && !isToolCallMessage(event.message)) {
        const content = textFromAssistantMessage(event.message);
        if (content) {
          answer = content;
          await emit({ type: "assistant.completed", runId: input.runId, content });
        }
      } else if (event.type === "agent_end") {
        if (cancellationRequested) {
          await finish("aborted", { code: "aborted", message: "Agent run was aborted" });
        } else if (failure !== undefined) {
          await finish("failed", failure);
        } else {
          await finish("completed");
        }
      }
    });
    await agent.prompt(input.goal);
    await agent.waitForIdle();
  } catch (error) {
    const mapped = cancellationRequested
      ? { code: "aborted", message: "Agent run was aborted" }
      : errorFromUnknown(error, "agent-failed");
    failure = mapped;
    await finish(cancellationRequested ? "aborted" : "failed", mapped);
  } finally {
    input.signal?.removeEventListener("abort", abort);
  }

  if (!terminal) await finish(cancellationRequested ? "aborted" : failure ? "failed" : "completed", failure);
  return terminal as PiAgentRunResult;
}

export type { PiAgentEvent, PiAgentRunInput, PiAgentRunResult } from "./types.ts";
