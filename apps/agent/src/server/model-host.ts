import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { Context, JsonObject, JsonValue, Model, Usage } from "@earendil-works/pi-ai";
import { Type, type TSchema } from "typebox";
import type { AgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import type { AgentModelProviderHostPort } from "@brilliant-guitar/agent-runtime/runtime/provider-host";
import type { AgentModelOutputBlockV1, AgentModelStreamEventV1 } from "@brilliant-guitar/agent-runtime/contracts/agent-model-stream";
import { isAgentModelStreamEnvelopeV1 } from "@brilliant-guitar/agent-runtime/contracts/agent-model-stream";

const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
type EventPayload<T = AgentModelStreamEventV1> = T extends AgentModelStreamEventV1 ? Omit<T, "runId" | "turnId" | "sequence"> : never;

function jsonObject(value: unknown): JsonObject {
  const valid = (item: unknown): item is JsonValue => item === null || typeof item === "string" || typeof item === "boolean"
    || (typeof item === "number" && Number.isFinite(item)) || (Array.isArray(item) ? item.every(valid)
      : typeof item === "object" && item !== null && Object.values(item).every(valid));
  if (typeof value !== "object" || value === null || Array.isArray(value) || !valid(value)) throw new Error("工具参数必须为 JSON 对象");
  return value as JsonObject;
}

export function createCompletionsModel(configuration: AgentModelConfiguration): Model<"openai-completions"> {
  return { id: configuration.modelId, name: configuration.modelId, provider: configuration.providerId, api: "openai-completions", baseUrl: configuration.baseUrl,
    reasoning: false, input: ["text"], contextWindow: 32768, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: "max_tokens" } };
}

/** Host-only transport: Pi decodes the model stream; no tool execution lives here. */
export function createCompletionsModelHost(configuration: AgentModelConfiguration, apiKey: string): AgentModelProviderHostPort {
  const model = createCompletionsModel(configuration);
  return {
    async readAgentProviderCredentialStatus(providerId) {
      return { providerId, present: Boolean(apiKey), status: apiKey ? "configured" : "missing", message: apiKey ? "凭据已配置" : "请填写密钥" };
    },
    async streamAgentModel(request, signal, observer) {
      if (!apiKey || request.schemaVersion !== 1 || request.providerId !== configuration.providerId || request.modelId !== configuration.modelId
        || !Number.isSafeInteger(request.limits.timeoutMs) || request.limits.timeoutMs <= 0
        || !Number.isSafeInteger(request.limits.maxOutputTokens) || request.limits.maxOutputTokens <= 0) throw new Error("模型请求身份或配置无效");
      const aliases = new Map(request.tools.map((tool, index) => [tool.name, `tool_${index + 1}`]));
      const names = new Map([...aliases].map(([canonical, alias]) => [alias, canonical]));
      const nameFor = (canonical: string): string => {
        const alias = aliases.get(canonical);
        if (!alias) throw new Error("模型请求包含未声明工具");
        return alias;
      };
      const messages: Context["messages"] = request.messages.filter((message) => message.role !== "system").map((message) => {
        if (message.role === "user") return { role: "user" as const, content: message.content, timestamp: Date.now() };
        if (message.role === "tool") return { role: "toolResult" as const, toolCallId: message.toolCallId, toolName: nameFor(message.toolName), content: [{ type: "text" as const, text: message.content }], isError: message.isError, timestamp: Date.now() };
        if (message.role === "assistant") return { role: "assistant" as const, content: message.content.map((block) => block.type === "text" ? block : { type: "toolCall" as const, id: block.callId, name: nameFor(block.name), arguments: jsonObject(block.arguments) }), api: model.api, provider: model.provider, model: model.id, usage: ZERO_USAGE, stopReason: "stop" as const, timestamp: Date.now() };
        throw new Error("模型消息格式无效");
      });
      const context = normalizeContext({
        systemPrompt: request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n"),
        messages,
        tools: request.tools.map((tool) => ({ name: nameFor(tool.name), description: tool.description, parameters: typeof tool.parameters === "object" && tool.parameters !== null ? tool.parameters as TSchema : Type.Object({}) })),
      });
      const timeout = AbortSignal.timeout(request.limits.timeoutMs);
      const transportAbort = new AbortController();
      const operationSignal = AbortSignal.any([...(signal ? [signal] : []), timeout, transportAbort.signal]);
      const toolJson = new Map<number, string>();
      let outputCharacters = 0;
      let sequence = 0;
      let terminal = false;
      const emit = (payload: EventPayload): void => {
        observer?.({ ...payload, runId: request.runId, turnId: request.turnId, sequence: ++sequence });
      };
      try {
        emit({ type: "response.started" });
        if (operationSignal.aborted) throw new Error("模型流已取消");
        const stream = streamSimple(model, context, {
          apiKey, signal: operationSignal, maxTokens: request.limits.maxOutputTokens, timeoutMs: request.limits.timeoutMs, maxRetries: 0,
          onPayload: (payload) => configuration.providerId === "deepseek" && typeof payload === "object" && payload !== null
            ? { ...payload, thinking: { type: "disabled" } } : payload,
        });
        for await (const event of stream) {
          if (operationSignal.aborted) throw new Error("模型流已取消");
          if (event.type === "text_delta" || event.type === "toolcall_delta") {
            outputCharacters += event.delta.length;
            if (outputCharacters > 32768) throw new Error("模型输出超过预算");
          }
          if (event.type === "text_delta" && event.delta) emit({ type: "response.text-delta", delta: event.delta });
          if (event.type === "toolcall_delta") {
            toolJson.set(event.contentIndex, (toolJson.get(event.contentIndex) ?? "") + event.delta);
            const block = event.partial.content[event.contentIndex];
            if (event.delta && block?.type === "toolCall" && block.id) emit({ type: "response.tool-input-delta", callId: block.id, delta: event.delta });
          }
        }
        const result = await stream.result();
        if (operationSignal.aborted || (result.stopReason !== "stop" && result.stopReason !== "toolUse")) throw new Error("模型流未完整完成");
        const output: AgentModelOutputBlockV1[] = [];
        for (const [index, block] of result.content.entries()) {
          if (block.type === "text" && block.text.trim()) output.push({ type: "text", text: block.text });
          else if (block.type === "toolCall") {
            const canonical = names.get(block.name);
            if (!canonical) throw new Error("模型返回未知工具别名");
            // Pi's streaming parser tolerates unfinished JSON; execution requires the exact complete wire input.
            const argumentsValue = jsonObject(JSON.parse(toolJson.get(index) ?? ""));
            output.push({ type: "tool-call", callId: block.id, name: canonical, arguments: argumentsValue });
          }
        }
        if (!output.length) throw new Error("模型没有返回有效内容");
        const inputTokens = result.usage.input + result.usage.cacheRead + result.usage.cacheWrite;
        const usage = { inputTokens, outputTokens: result.usage.output, totalTokens: inputTokens + result.usage.output };
        const envelope = { schemaVersion: 1 as const, providerId: configuration.providerId, modelId: configuration.modelId, providerRequestId: result.responseId ?? crypto.randomUUID(), output, usage };
        if (!isAgentModelStreamEnvelopeV1(envelope)) throw new Error("模型输出格式无效");
        emit({ type: "response.usage", ...usage });
        emit({ type: "response.completed" });
        terminal = true;
        return envelope;
      } catch {
        transportAbort.abort();
        if (!terminal) emit({ type: "response.failed", code: signal?.aborted ? "aborted" : timeout.aborted ? "timeout" : "model-failed" });
        // Provider response bodies/errors may contain sensitive headers. Only stable diagnostics cross the host boundary.
        throw new Error(signal?.aborted ? "模型流已取消" : "模型请求失败，请检查密钥、地址和模型 ID");
      }
    },
  };
}
