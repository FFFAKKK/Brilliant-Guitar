import type { AgentDecision } from "./agent-contracts.ts";
import type { AgentProviderRequest } from "./provider.ts";
import { createExternalAgentPlugin, type AgentPluginPort } from "./agent-plugin-contract.ts";
import type { ExternalAgentCancelV1, ExternalAgentHelloV1, ExternalAgentNegotiatedLimitsV1 } from "./external-protocol-v1.ts";
import { EXTERNAL_AGENT_PROTOCOL_LIMITS as LIMITS } from "./external-protocol-v1.ts";
import {
  ExternalAgentProtocolError, decodeExternalMessage, encodeExternalMessage, negotiateExternalLimits,
} from "./external-protocol-v1-validator.ts";
import { mapExternalDecision, projectTurnRequest } from "./external-agent-projection.ts";

export { createDecisionResponse } from "./external-agent-projection.ts";

/** A request-scoped exchange accepts one final JSON response; future transports must correlate before resolving. */
export interface ExternalAgentTransportPort {
  open(signal?: AbortSignal | null): Promise<string>;
  request(message: string, signal?: AbortSignal | null): Promise<string>;
  cancel(message: string): Promise<void>;
  close(): Promise<void>;
}

export interface ExternalAgentAdapterOptions {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly pluginLabel: string;
  readonly transport: ExternalAgentTransportPort;
  readonly timeoutMs?: number;
  readonly createId?: () => string;
  readonly now?: () => number;
}

export type ExternalAgentAdapterState = "discovered" | "validating" | "inactive" | "ready" | "deciding" | "deactivating" | "failed" | "disposed";

type PendingOperation = {
  readonly fail: (error: ExternalAgentProtocolError) => void;
};

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function unavailable(message: string): ExternalAgentProtocolError {
  return new ExternalAgentProtocolError("plugin-unavailable", message, true);
}

export class ExternalAgentAdapter {
  readonly #options: ExternalAgentAdapterOptions;
  readonly plugin: AgentPluginPort;
  #state: ExternalAgentAdapterState = "discovered";
  #hello: ExternalAgentHelloV1 | null = null;
  #limits: ExternalAgentNegotiatedLimitsV1 | null = null;
  #pending: PendingOperation | null = null;
  #activeRequest: ExternalAgentCancelV1 | null = null;
  #generation = 0;
  #requestSequence = 0;
  #deactivation: Promise<void> | null = null;
  #disposal: Promise<void> | null = null;

  constructor(options: ExternalAgentAdapterOptions) {
    const timeout = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > LIMITS.maxTimeoutMs) {
      throw new ExternalAgentProtocolError("protocol-invalid", "Invalid External Agent timeout");
    }
    this.#options = Object.freeze({ ...options, timeoutMs: timeout });
    this.plugin = createExternalAgentPlugin({
      id: options.pluginId,
      version: options.pluginVersion,
      label: options.pluginLabel,
      decide: (request, signal) => this.decide(request, signal),
    });
  }

  get state(): ExternalAgentAdapterState { return this.#state; }

  #current(generation: number): boolean { return generation === this.#generation; }

  #now(): number {
    const now = (this.#options.now ?? Date.now)();
    if (!Number.isFinite(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) {
      throw new ExternalAgentProtocolError("internal-error", "Invalid External Agent host clock");
    }
    return now;
  }

  #notifyCancel(reason: ExternalAgentCancelV1["reason"]): void {
    const active = this.#activeRequest;
    this.#activeRequest = null;
    if (active === null || this.#hello?.features.cancellation !== true) return;
    // Best effort only; never wait for cancellation acknowledgement to settle a local request.
    try { void this.#options.transport.cancel(encodeExternalMessage({ ...active, reason })).catch(() => {}); } catch { /* Local invalidation is already authoritative. */ }
  }

  async #exchange<T>(effect: (signal: AbortSignal) => Promise<T>, generation: number,
    signal?: AbortSignal | null, requestId: string | null = null): Promise<T> {
    if (signal?.aborted) throw new ExternalAgentProtocolError("plugin-cancelled", "External Agent request cancelled", false, requestId);
    const controller = new AbortController();
    let settled = false;
    let rejectPending: (error: ExternalAgentProtocolError) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectPending = reject; });
    const fail = (error: ExternalAgentProtocolError) => {
      if (settled) return;
      settled = true;
      rejectPending(error); // Reject first so an abort-aware transport cannot replace a timeout with AbortError.
      controller.abort();
      this.#notifyCancel(error.code === "plugin-timeout" ? "timeout" : "user");
    };
    const pending: PendingOperation = { fail };
    this.#pending = pending;
    const onAbort = () => fail(new ExternalAgentProtocolError("plugin-cancelled", "External Agent request cancelled", false, requestId));
    const timer = setTimeout(() => fail(new ExternalAgentProtocolError("plugin-timeout", "External Agent request timed out", true, requestId)), this.#options.timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal?.aborted) onAbort();
      if (settled) return await aborted;
      const result = await Promise.race([aborted, Promise.resolve().then(() => {
        if (controller.signal.aborted || !this.#current(generation)) {
          throw new ExternalAgentProtocolError("plugin-cancelled", "External Agent request is no longer active", false, requestId);
        }
        return effect(controller.signal);
      })]);
      if (!this.#current(generation) || settled) throw new ExternalAgentProtocolError("plugin-cancelled", "External Agent request is no longer active", false, requestId);
      settled = true;
      return result;
    } finally {
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (this.#pending === pending) this.#pending = null;
    }
  }

  #error(error: unknown, requestId: string | null = null): ExternalAgentProtocolError {
    if (error instanceof ExternalAgentProtocolError) return new ExternalAgentProtocolError(error.code, error.message, error.retryable, requestId);
    return new ExternalAgentProtocolError("plugin-unavailable", "External Agent transport is unavailable", true, requestId);
  }

  activate = async (signal?: AbortSignal | null): Promise<void> => {
    if (this.#state === "ready") return;
    if (this.#state === "disposed" || this.#pending !== null || this.#state === "deactivating") throw unavailable("External Agent cannot activate in the current state");
    const generation = ++this.#generation;
    this.#hello = null;
    this.#limits = null;
    this.#state = "validating";
    try {
      const wire = await this.#exchange((innerSignal) => this.#options.transport.open(innerSignal), generation, signal);
      const message = decodeExternalMessage(wire);
      if (message.messageType !== "hello") throw new ExternalAgentProtocolError("protocol-invalid", "Expected External Agent hello");
      if (message.plugin.id !== this.#options.pluginId || message.plugin.version !== this.#options.pluginVersion) {
        throw new ExternalAgentProtocolError("protocol-invalid", "External Agent identity does not match selection");
      }
      this.#limits = negotiateExternalLimits(message);
      this.#hello = message;
      this.#state = "ready";
    } catch (error) {
      if (this.#current(generation)) this.#state = "failed";
      throw this.#error(error);
    }
  };

  decide = async (request: AgentProviderRequest, signal?: AbortSignal | null): Promise<AgentDecision> => {
    if (this.#state !== "ready" || this.#hello === null || this.#limits === null) throw unavailable("External Agent is not active");
    if (signal?.aborted) throw new ExternalAgentProtocolError("plugin-cancelled", "External Agent request cancelled");
    const generation = ++this.#generation;
    this.#state = "deciding";
    let requestId: string | null = null;
    try {
      requestId = `${(this.#options.createId ?? defaultId)()}:${++this.#requestSequence}`;
      const expiresAt = this.#now() + this.#options.timeoutMs!;
      const message = projectTurnRequest(request, this.#options.pluginId, new Date(expiresAt).toISOString(), requestId, this.#limits);
      const wire = encodeExternalMessage(message, this.#limits);
      this.#activeRequest = { schemaVersion: 1, messageType: "turn.cancel", requestId, runId: message.runId, turnId: message.turnId, reason: "user" };
      const raw = await this.#exchange((innerSignal) => this.#options.transport.request(wire, innerSignal), generation, signal, requestId);
      if (this.#now() >= expiresAt) {
        this.#notifyCancel("timeout");
        throw new ExternalAgentProtocolError("plugin-timeout", "External Agent response arrived after deadline", true, requestId);
      }
      const response = decodeExternalMessage(raw, this.#limits.maxResponseBytes, this.#limits);
      if (response.messageType !== "turn.response" || response.requestId !== requestId
        || response.runId !== message.runId || response.turnId !== message.turnId) {
        throw new ExternalAgentProtocolError("protocol-invalid", "External Agent response identity mismatch", false, requestId);
      }
      if (response.result.kind === "error") {
        const error = response.result.error;
        // The peer's retryability hint and cancellation claim cannot override host policy or Run state.
        throw new ExternalAgentProtocolError(error.code, error.message,
          error.code === "plugin-unavailable" || error.code === "plugin-timeout", requestId);
      }
      const decision = mapExternalDecision(response.result.decision, message);
      this.#state = "ready";
      return decision;
    } catch (error) {
      const failure = this.#error(error, requestId);
      if (this.#current(generation)) this.#state = failure.code === "plugin-cancelled" || failure.code === "plugin-timeout" ? "ready" : "failed";
      throw failure;
    } finally {
      if (this.#current(generation)) this.#activeRequest = null;
    }
  };

  cancel = async (reason: ExternalAgentCancelV1["reason"] = "user"): Promise<void> => {
    if (this.#pending === null) return;
    const pending = this.#pending;
    const requestId = this.#activeRequest?.requestId ?? null;
    this.#notifyCancel(reason);
    pending.fail(new ExternalAgentProtocolError(reason === "timeout" ? "plugin-timeout" : "plugin-cancelled", "External Agent request cancelled", reason === "timeout", requestId));
  };

  deactivate = (): Promise<void> => {
    if (this.#state === "disposed") return Promise.resolve();
    if (this.#deactivation !== null) return this.#deactivation;
    this.#notifyCancel("runtime-shutdown");
    this.#pending?.fail(new ExternalAgentProtocolError("plugin-cancelled", "External Agent runtime shut down"));
    const generation = ++this.#generation;
    this.#state = "deactivating";
    this.#hello = null;
    this.#limits = null;
    const operation = (async () => {
      try {
        await this.#exchange(() => this.#options.transport.close(), generation);
        if (this.#current(generation)) this.#state = "inactive";
      } catch (error) {
        if (this.#current(generation)) this.#state = "failed";
        throw this.#error(error);
      }
    })();
    this.#deactivation = operation.finally(() => { this.#deactivation = null; });
    return this.#deactivation;
  };

  dispose = (): Promise<void> => {
    if (this.#disposal === null) this.#disposal = (async () => {
      try { await this.deactivate(); } finally {
        this.#generation += 1;
        this.#state = "disposed";
      }
    })();
    return this.#disposal;
  };
}

export function createExternalAgentPluginAdapter(options: ExternalAgentAdapterOptions): ExternalAgentAdapter {
  return new ExternalAgentAdapter(options);
}
