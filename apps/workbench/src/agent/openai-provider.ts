import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import { createAgentProviderDecideRequestV1 } from "../contracts/agent-provider-turn.ts";
import type {
  AgentProviderPort,
  AgentProviderProgressObserver,
  AgentProviderRequest,
} from "./provider.ts";
import type {
  AgentProviderDescriptor,
  AgentProviderRuntimeSnapshot,
  AgentProviderSessionPort,
} from "./provider-contract.ts";
import type { AgentProviderHostPort } from "./provider-host.ts";
import type { AgentProviderRegistration } from "./provider-registry.ts";
import { reduceAgentProviderStream } from "./provider-stream.ts";
import type { AgentProviderStreamState } from "./provider-stream.ts";

export const OPENAI_PROVIDER_ID = "openai";

export const OPENAI_PROVIDER_DESCRIPTOR: AgentProviderDescriptor = Object.freeze({
  id: OPENAI_PROVIDER_ID,
  label: "OpenAI",
  executionLocation: "remote",
  credentialKind: "api-key",
  models: Object.freeze([
    Object.freeze({
      id: "gpt-5.4-mini",
      label: "GPT-5.4 Mini",
      capabilities: Object.freeze({ toolCalling: true, streaming: true, structuredOutput: false }),
    }),
    Object.freeze({
      id: "gpt-5.5",
      label: "GPT-5.5",
      capabilities: Object.freeze({ toolCalling: true, streaming: true, structuredOutput: false }),
    }),
  ]),
});

export class OpenAiAgentProvider implements AgentProviderPort {
  readonly #host: AgentProviderHostPort;
  readonly #modelId: string;

  constructor(host: AgentProviderHostPort, modelId: string) {
    this.#host = host;
    this.#modelId = modelId;
  }

  async decide(
    request: AgentProviderRequest,
    signal?: AbortSignal | null,
    observer?: AgentProviderProgressObserver | null,
  ): Promise<unknown> {
    const stream: { state: AgentProviderStreamState | null; error: Error | null } = {
      state: null,
      error: null,
    };
    const result = await this.#host.decideAgentProvider(createAgentProviderDecideRequestV1(
      OPENAI_PROVIDER_ID,
      this.#modelId,
      request,
    ), signal, (event) => {
      if (stream.error !== null) return;
      const transition = reduceAgentProviderStream(stream.state, event);
      if (!transition.accepted) {
        stream.error = new Error(transition.message);
        return;
      }
      stream.state = transition.state;
      try {
        observer?.(event);
      } catch {
        // Product progress cannot change the authoritative Provider result.
      }
    });
    if (stream.error !== null) throw stream.error;
    if (stream.state === null || stream.state.lifecycle !== "terminal" || stream.state.reason !== "completed") {
      throw new Error("Provider 流没有产生完整终态");
    }
    if (result.providerId !== OPENAI_PROVIDER_ID || result.modelId !== this.#modelId) {
      throw new Error("Provider 返回了不匹配的模型决策");
    }
    return result.decision;
  }
}

export class OpenAiProviderSession implements AgentProviderSessionPort {
  readonly #host: AgentProviderHostPort;
  readonly #selection: AgentProviderSelection;
  readonly #provider: OpenAiAgentProvider;
  readonly #listeners = new Set<() => void>();
  #generation = 0;
  #disposed = false;
  #snapshot: AgentProviderRuntimeSnapshot;

  constructor(host: AgentProviderHostPort, selection: AgentProviderSelection) {
    this.#host = host;
    this.#selection = selection;
    this.#provider = new OpenAiAgentProvider(host, selection.modelId);
    this.#snapshot = Object.freeze({
      status: "checking",
      providerId: selection.providerId,
      model: selection.modelId,
      message: "正在检查 OpenAI 凭据",
    });
  }

  getSnapshot = (): AgentProviderRuntimeSnapshot => this.#snapshot;

  getProvider = (): AgentProviderPort | null => this.#snapshot.status === "ready" ? this.#provider : null;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    this.#publish({
      status: "checking",
      providerId: this.#selection.providerId,
      model: this.#selection.modelId,
      message: "正在检查 OpenAI 凭据",
    });
    try {
      const credential = await this.#host.readAgentProviderCredentialStatus(this.#selection.providerId);
      if (this.#disposed || generation !== this.#generation) return;
      if (credential.status === "configured" && credential.present) {
        this.#publish({
          status: "ready",
          providerId: this.#selection.providerId,
          model: this.#selection.modelId,
          message: "OpenAI 已配置，连接将在首次请求时验证",
        });
      } else if (credential.status === "missing") {
        this.#publish({
          status: "authentication-required",
          providerId: this.#selection.providerId,
          model: this.#selection.modelId,
          message: "需要配置 OpenAI API Key",
        });
      } else {
        this.#publish({
          status: "unavailable",
          providerId: this.#selection.providerId,
          model: this.#selection.modelId,
          message: credential.message,
        });
      }
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) return;
      this.#publish({
        status: "error",
        providerId: this.#selection.providerId,
        model: this.#selection.modelId,
        message: error instanceof Error && error.message ? error.message : "无法检查 OpenAI Provider",
      });
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#listeners.clear();
  }

  #publish(snapshot: AgentProviderRuntimeSnapshot): void {
    if (this.#disposed) return;
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }
}

export const OPENAI_PROVIDER_REGISTRATION: AgentProviderRegistration = Object.freeze({
  descriptor: OPENAI_PROVIDER_DESCRIPTOR,
  createSession: (selection: AgentProviderSelection, host: AgentProviderHostPort) =>
    new OpenAiProviderSession(host, selection),
});
