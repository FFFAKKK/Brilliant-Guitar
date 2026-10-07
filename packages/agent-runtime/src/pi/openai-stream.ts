import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { getCurrentSystemMessage, getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  JsonObject,
  JsonValue,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
  Usage,
} from "@earendil-works/pi-ai";
import type { AgentProviderRequest } from "../runtime/provider.ts";
import type { AgentModelProviderHostPort } from "../runtime/provider-host.ts";
import type {
  AgentModelContentBlockV1,
  AgentModelMessageV1,
  AgentModelStreamEnvelopeV1,
  AgentModelStreamEventV1,
  AgentModelStreamRequestV1,
} from "../contracts/agent-model-stream.ts";
import { createAgentModelStreamRequestV1, isAgentModelStreamEnvelopeV1 } from "../contracts/agent-model-stream.ts";
import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { PiAgentStreamFn } from "./types.ts";

const ZERO_USAGE: Usage = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  // Zero means unknown/not reported until the product has a price catalog.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

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

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) output[key] = jsonValue(item);
    return output;
  }
  throw new Error("模型流包含不可序列化的 JSON 值");
}

function jsonObject(value: Record<string, unknown>): JsonObject {
  const projected = jsonValue(value);
  if (typeof projected !== "object" || projected === null || Array.isArray(projected)) {
    throw new Error("模型工具参数必须是 JSON 对象");
  }
  return projected as JsonObject;
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

function modelFor(selection: AgentProviderSelection): Model<Api> {
  return {
    id: selection.modelId, name: selection.modelId, api: "openai-responses", provider: "openai",
    baseUrl: "https://api.openai.com/v1", input: ["text"], reasoning: false,
    contextWindow: 128_000, maxTokens: 8_192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function usageFromEnvelope(envelope: AgentModelStreamEnvelopeV1): Usage {
  if (envelope.usage === null) return ZERO_USAGE;
  return { ...ZERO_USAGE, input: envelope.usage.inputTokens, output: envelope.usage.outputTokens,
    totalTokens: envelope.usage.totalTokens };
}

function assistantMessage(model: Model<Api>, envelope: AgentModelStreamEnvelopeV1): AssistantMessage {
  const content: AssistantMessage["content"] = envelope.output.map((block) => block.type === "text"
    ? { type: "text", text: block.text }
    : { type: "toolCall", id: block.callId, name: block.name,
      arguments: jsonObject(block.arguments) });
  return { role: "assistant", content, api: model.api, provider: model.provider, model: model.id,
    responseId: envelope.providerRequestId, usage: usageFromEnvelope(envelope),
    stopReason: envelope.output.some((block) => block.type === "tool-call") ? "toolUse" : "stop",
    timestamp: Date.now() };
}

function errorMessage(model: Model<Api>, reason: "error" | "aborted", error: unknown): AssistantMessage {
  return { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
    usage: ZERO_USAGE, stopReason: reason, errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now() };
}

type StreamState = { lastSequence: number; terminal: "completed" | "failed" | null };

function acceptEvent(
  state: StreamState | null,
  event: AgentModelStreamEventV1,
  request: AgentModelStreamRequestV1,
): StreamState {
  if (event.runId !== request.runId || event.turnId !== request.turnId) throw new Error("原始模型流事件身份不匹配");
  if (state === null) {
    if (event.type !== "response.started" || event.sequence !== 1) {
      throw new Error("原始模型流必须从 sequence 1 的 started 事件开始");
    }
    return { lastSequence: 1, terminal: null };
  }
  if (state.terminal !== null) throw new Error("原始模型流在终态后仍有事件");
  if (event.sequence !== state.lastSequence + 1) throw new Error("原始模型流事件序号不连续");
  if (event.type === "response.started") throw new Error("原始模型流重复 started");
  return { lastSequence: event.sequence,
    terminal: event.type === "response.completed" ? "completed" : event.type === "response.failed" ? "failed" : null };
}

function appendFinalBlocks(
  partial: AssistantMessage,
  envelope: AgentModelStreamEnvelopeV1,
  stream: AssistantMessageEventStream,
): void {
  const streamedContent = partial.content;
  partial.content = [];
  const seenCalls = new Set<string>();
  for (const block of envelope.output) {
    const index = partial.content.length;
    if (block.type === "text") {
      partial.content.push({ type: "text", text: block.text });
      if (streamedContent[index]?.type !== "text") stream.push({ type: "text_start", contentIndex: index, partial });
      stream.push({ type: "text_end", contentIndex: index, content: block.text, partial });
      continue;
    }
    if (seenCalls.has(block.callId)) throw new Error(`模型返回了重复的工具调用 ID: ${block.callId}`);
    seenCalls.add(block.callId);
    const callArguments = jsonObject(block.arguments);
    partial.content.push({ type: "toolCall", id: block.callId, name: block.name, arguments: callArguments });
    stream.push({ type: "toolcall_start", contentIndex: index, partial });
    stream.push({ type: "toolcall_delta", contentIndex: index, delta: JSON.stringify(callArguments), partial });
    stream.push({ type: "toolcall_end", contentIndex: index,
      toolCall: { type: "toolCall", id: block.callId, name: block.name, arguments: callArguments }, partial });
  }
}

function liveStream(
  model: Model<Api>, request: AgentModelStreamRequestV1, host: AgentModelProviderHostPort,
  signal: AbortSignal | null | undefined,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const partial: AssistantMessage = { role: "assistant", content: [], api: model.api, provider: model.provider,
    model: model.id, usage: ZERO_USAGE, stopReason: "pending", timestamp: Date.now() };
  let state: StreamState | null = null;
  let settled = false;
  const finish = (message: AssistantMessage, reason: "error" | "aborted" | "done"): void => {
    if (settled) return;
    settled = true;
    if (reason === "done") stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message });
    else stream.push({ type: "error", reason, error: message });
    stream.end(message);
  };
  const abort = (): void => finish(errorMessage(model, "aborted", "模型流已取消"), "aborted");
  if (signal?.aborted) { abort(); return stream; }
  stream.push({ type: "start", partial });
  signal?.addEventListener("abort", abort, { once: true });
  const observer = (event: AgentModelStreamEventV1): void => {
    if (settled) return;
    try {
      state = acceptEvent(state, event, request);
      if (event.type === "response.usage") {
        partial.usage = { ...ZERO_USAGE, input: event.inputTokens, output: event.outputTokens,
          totalTokens: event.totalTokens };
      }
      if (event.type === "response.text-delta") {
        const first = partial.content[0];
        if (first === undefined || first.type !== "text") {
          partial.content.unshift({ type: "text", text: "" });
          stream.push({ type: "text_start", contentIndex: 0, partial });
        }
        const text = partial.content[0];
        if (text?.type !== "text") throw new Error("文本增量 partial 无效");
        text.text += event.delta;
        stream.push({ type: "text_delta", contentIndex: 0, delta: event.delta, partial });
      }
      if (event.type === "response.failed") throw new Error(`模型流失败: ${event.code}`);
    } catch (error) { finish(errorMessage(model, "error", error), "error"); }
  };
  void host.streamAgentModel!(request, signal ?? null, observer).then((envelope) => {
    if (settled) return;
    if (state?.terminal !== "completed") throw new Error("原始模型流没有完整 completed 终态");
    if (!isAgentModelStreamEnvelopeV1(envelope)
      || envelope.providerId !== request.providerId || envelope.modelId !== request.modelId) {
      throw new Error("原始模型流完成结果无效");
    }
    if (envelope.output.length === 0) throw new Error("原始模型流没有输出内容");
    const allowedTools = new Set(request.tools.map((tool) => tool.name));
    for (const block of envelope.output) {
      if (block.type === "tool-call" && !allowedTools.has(block.name)) {
        throw new Error(`模型返回了未声明的工具: ${block.name}`);
      }
    }
    const message = assistantMessage(model, envelope);
    appendFinalBlocks(partial, envelope, stream);
    partial.usage = message.usage;
    if (message.responseId !== undefined) partial.responseId = message.responseId;
    partial.stopReason = message.stopReason;
    finish(message, "done");
  }).catch((error) => finish(errorMessage(model, signal?.aborted ? "aborted" : "error", error), signal?.aborted ? "aborted" : "error"))
    .finally(() => signal?.removeEventListener("abort", abort));
  return stream;
}

function createRequest(request: AgentProviderRequest, selection: AgentProviderSelection,
  context: TranscriptContext): AgentModelStreamRequestV1 {
  return createAgentModelStreamRequestV1(selection.providerId, selection.modelId, request.runId, request.turnId,
    projectMessages(context), projectTools(context, request), { timeoutMs: 45_000, maxOutputTokens: 1_500 });
}

export function createHostPiStreamFn(host: AgentModelProviderHostPort, request: AgentProviderRequest,
  selection: AgentProviderSelection, model: Model<Api> = modelFor(selection)): PiAgentStreamFn {
  return (_streamModel, context, options?: SimpleStreamOptions) => {
    if (options?.signal?.aborted) {
      const stream = createAssistantMessageEventStream();
      const message = errorMessage(model, "aborted", "模型流已取消");
      stream.push({ type: "error", reason: "aborted", error: message }); stream.end(message); return stream;
    }
    if (host.streamAgentModel === undefined) {
      const stream = createAssistantMessageEventStream();
      const message = errorMessage(model, "error", "当前宿主不支持原始模型流");
      stream.push({ type: "error", reason: "error", error: message }); stream.end(message); return stream;
    }
    try { return liveStream(model, createRequest(request, selection, context), host, options?.signal); }
    catch (error) {
      const stream = createAssistantMessageEventStream();
      const message = errorMessage(model, "error", error);
      stream.push({ type: "error", reason: "error", error: message }); stream.end(message); return stream;
    }
  };
}

export function createOpenAiPiModel(selection: AgentProviderSelection): Model<Api> { return modelFor(selection); }

/** Compatibility name for the original official OpenAI composition. */
export const createOpenAiPiStreamFn = createHostPiStreamFn;
