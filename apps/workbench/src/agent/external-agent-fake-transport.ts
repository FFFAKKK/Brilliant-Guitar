import type { ExternalAgentCancelV1, ExternalAgentTurnRequestV1 } from "./external-protocol-v1.ts";
import { EXTERNAL_AGENT_PROTOCOL_LIMITS as LIMITS } from "./external-protocol-v1.ts";
import { decodeExternalMessage } from "./external-protocol-v1-validator.ts";
import type { ExternalAgentTransportPort } from "./external-agent-adapter.ts";

export interface FakeExternalAgentBehavior {
  /** May return malformed JSON/messages deliberately, to exercise the host boundary. */
  readonly respond: (request: ExternalAgentTurnRequestV1) => unknown | Promise<unknown>;
  readonly delayMs?: number;
  readonly openDelayMs?: number;
  readonly ignoreAbort?: boolean;
  readonly hello?: unknown;
}

export function createFakeExternalHello() {
  return {
    schemaVersion: 1,
    messageType: "hello",
    plugin: { id: "example.external.agent", version: "1.0.0", label: "Fake External Agent" },
    protocol: { supportedVersions: [1] },
    features: { progress: false, cancellation: true, idempotentDecide: false },
    limits: {
      maxRequestBytes: LIMITS.maxMessageBytes,
      maxResponseBytes: LIMITS.maxMessageBytes,
      maxContextItems: LIMITS.maxContextItems,
      maxToolCalls: LIMITS.maxToolCalls,
    },
  };
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  const wire = JSON.stringify(value);
  if (wire === undefined) throw new Error("Fake External Agent response is not JSON");
  return wire;
}

async function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) throw new DOMException("Fake External Agent request cancelled", "AbortError");
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Fake External Agent request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Only serialised messages cross this boundary. No capabilities or Controller handles are supplied. */
export class FakeExternalAgentTransport implements ExternalAgentTransportPort {
  readonly requests: ExternalAgentTurnRequestV1[] = [];
  readonly cancellations: ExternalAgentCancelV1[] = [];
  readonly #behavior: FakeExternalAgentBehavior;
  openCount = 0;
  closeCount = 0;
  #closed = true;

  constructor(behavior: FakeExternalAgentBehavior) { this.#behavior = behavior; }

  async open(signal?: AbortSignal | null): Promise<string> {
    this.openCount += 1;
    await delay(this.#behavior.openDelayMs ?? 0, this.#behavior.ignoreAbort ? null : signal);
    this.#closed = false;
    return responseText(this.#behavior.hello ?? createFakeExternalHello());
  }

  async request(wire: string, signal?: AbortSignal | null): Promise<string> {
    if (this.#closed) throw new Error("Fake External Agent is unavailable");
    const request = decodeExternalMessage(wire);
    if (request.messageType !== "turn.request") throw new Error("Fake External Agent expected a turn request");
    this.requests.push(request);
    await delay(this.#behavior.delayMs ?? 0, this.#behavior.ignoreAbort ? null : signal);
    return responseText(await this.#behavior.respond(request));
  }

  async cancel(wire: string): Promise<void> {
    const message = decodeExternalMessage(wire);
    if (message.messageType !== "turn.cancel") throw new Error("Fake External Agent expected cancellation");
    this.cancellations.push(message);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.#closed = true;
  }
}
