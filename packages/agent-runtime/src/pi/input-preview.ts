import { createInitialSystemMessage, getCurrentSystemMessage, getCurrentTools, normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { Api, Model, TranscriptContext } from "@earendil-works/pi-ai";
import type { AgentProviderRequest } from "../runtime/provider.ts";
import type { AgentModelContentBlockV1, AgentModelMessageV1, AgentModelStreamRequestV1 } from "../contracts/agent-model-stream.ts";
import { createAgentModelStreamRequestV1 } from "../contracts/agent-model-stream.ts";
import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { AgentInputPreviewPort } from "../contracts/tool-feedback-admission.ts";
import { MODEL_INPUT_OUTPUT_RESERVE } from "../contracts/model-input-policy.ts";
import { budgetModelInput } from "./model-input-budget.ts";
import { projectPiJsonObject as jsonObject, projectPiJsonValue as jsonValue } from "./json-values.ts";
import { PI_BASE_INSTRUCTIONS, projectPiInput } from "./input-projection.ts";
import { piToolParameters } from "./tool-parameters.ts";

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: "text"; text: string } =>
      typeof item === "object" && item !== null
      && (item as { type?: unknown }).type === "text"
      && typeof (item as { text?: unknown }).text === "string")
    .map((item) => item.text)
    .join("");
}

function systemContent(context: TranscriptContext): string {
  const system = getCurrentSystemMessage(context.messages);
  if (system === undefined) return "";
  const sections = Object.entries(system.sections ?? {})
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `${name}:\n${value}`);
  return [textFromContent(system.content), ...sections].filter(Boolean).join("\n\n");
}

function projectMessages(context: TranscriptContext): readonly AgentModelMessageV1[] {
  const messages: AgentModelMessageV1[] = [];
  const system = systemContent(context);
  if (system.length > 0) messages.push({ role: "system", content: system });
  for (const message of context.messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      const content = textFromContent(message.content);
      if (content.length > 0) messages.push({ role: "user", content });
      continue;
    }
    if (message.role === "assistant") {
      const content: AgentModelContentBlockV1[] = [];
      for (const item of message.content) {
        if (item.type === "text" && item.text.length > 0) {
          content.push({ type: "text", text: item.text });
        } else if (item.type === "toolCall") {
          content.push({ type: "tool-call", callId: item.id, name: item.name,
            arguments: jsonObject(item.arguments) });
        }
      }
      if (content.length > 0) messages.push({ role: "assistant", content });
      continue;
    }
    messages.push({ role: "tool", toolCallId: message.toolCallId, toolName: message.toolName,
      content: textFromContent(message.content), isError: message.isError });
  }
  return messages;
}

function projectTools(
  context: TranscriptContext,
  request: AgentProviderRequest,
): AgentModelStreamRequestV1["tools"] {
  const allowed = new Map(request.toolset.toolDescriptors.map((tool) => [tool.id, tool]));
  const transcriptTools = getCurrentTools(context.messages);
  const source = transcriptTools.length > 0 ? transcriptTools : request.toolset.toolDescriptors.map((tool) => ({
    name: tool.id, description: tool.description, parameters: tool.inputSchema,
  }));
  return source.map((tool) => {
    if (allowed.get(tool.name) === undefined) throw new Error(`Pi transcript contains an unknown tool: ${tool.name}`);
    return { name: tool.name, description: tool.description, parameters: jsonValue(tool.parameters) };
  });
}

function createRequest(request: AgentProviderRequest, selection: AgentProviderSelection,
  context: TranscriptContext): AgentModelStreamRequestV1 {
  return createAgentModelStreamRequestV1(selection.providerId, selection.modelId, request.runId, request.turnId,
    projectMessages(context), projectTools(context, request), { timeoutMs: 45_000, maxOutputTokens: MODEL_INPUT_OUTPUT_RESERVE });
}

/** Shared, pure projection. No Agent instance, transport, diagnostics or capability port. */
export function projectPiModelInput(request: AgentProviderRequest, selection: AgentProviderSelection, model: Model<Api>, transcript?: TranscriptContext) {
  const projected = projectPiInput(request, model);
  const system = createInitialSystemMessage(PI_BASE_INSTRUCTIONS, request.toolset.toolDescriptors.map((tool) => ({
    name: tool.id, description: tool.description, parameters: piToolParameters(tool.inputSchema),
  })));
  const context: TranscriptContext = transcript ?? normalizeContext({ messages: [...(system ? [system] : []), ...projected.history,
    ...(projected.continueFromTools ? [] : [{ role: "user" as const, content: projected.prompt, timestamp: 0 }])] });
  return budgetModelInput(createRequest(request, selection, context), request, model.api, (filtered) => {
    const input = projectPiInput(filtered, model);
    return projectMessages({ ...context, messages: [...context.messages.filter((message) => message.role === "system"), ...input.history,
      ...(input.continueFromTools ? [] : [{ role: "user" as const, content: input.prompt, timestamp: 0 }])] });
  });
}

export function createPiInputPreview(selection: AgentProviderSelection, model: Model<Api>): AgentInputPreviewPort {
  return Object.freeze({ preview(request: AgentProviderRequest) {
    const input = projectPiModelInput(request, selection, model);
    return Object.freeze({ schemaVersion: 1 as const, runId: request.runId, turnId: request.turnId,
      status: input.diagnostic.status, estimator: input.diagnostic.estimator,
      estimatedInputTokens: input.diagnostic.estimatedInputTokens, inputTokenBudget: input.diagnostic.inputTokenBudget,
      requestBytes: null, requestByteBudget: null });
  } });
}
