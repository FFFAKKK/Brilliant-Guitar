import type { AgentProviderRuntimeSnapshot, AgentProviderSessionPort } from "./provider-contract.ts";
import { UNCONFIGURED_AGENT_PROVIDER } from "./provider-contract.ts";

class StaticAgentProviderSession implements AgentProviderSessionPort {
  readonly #snapshot: AgentProviderRuntimeSnapshot;

  constructor(snapshot: AgentProviderRuntimeSnapshot) { this.#snapshot = Object.freeze(snapshot); }
  getSnapshot = () => this.#snapshot;
  getProvider = () => null;
  subscribe = (_listener: () => void): (() => void) => () => {};
  async refresh(): Promise<void> {}
  dispose(): void {}
}

/** Default provider control session until the user selects and configures an adapter. */
export class UnconfiguredAgentProviderSession extends StaticAgentProviderSession {
  constructor() { super(UNCONFIGURED_AGENT_PROVIDER); }
}

export function createUnconfiguredAgentProviderSession(): AgentProviderSessionPort {
  return new UnconfiguredAgentProviderSession();
}

export function createStaticAgentProviderSession(snapshot: AgentProviderRuntimeSnapshot): AgentProviderSessionPort {
  return new StaticAgentProviderSession(snapshot);
}
