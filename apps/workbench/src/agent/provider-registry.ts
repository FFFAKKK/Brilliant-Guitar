import type {
  AgentProviderDescriptor,
  AgentProviderSelection,
  AgentProviderSessionPort,
} from "./provider-contract.ts";
import { isAgentProviderDescriptor, isAgentProviderSelection } from "./provider-contract.ts";
import type { AgentProviderHostPort } from "./provider-host.ts";

export interface AgentProviderRegistration {
  readonly descriptor: AgentProviderDescriptor;
  createSession(selection: AgentProviderSelection, host: AgentProviderHostPort): AgentProviderSessionPort;
}

/** Validated directory of provider adapters. It never owns credentials or chooses a model implicitly. */
export class AgentProviderRegistry {
  readonly #registrations = new Map<string, AgentProviderRegistration>();

  register(registration: AgentProviderRegistration): void {
    if (!isAgentProviderDescriptor(registration.descriptor)
      || typeof registration.createSession !== "function") throw new Error("Invalid Agent Provider registration");
    if (this.#registrations.has(registration.descriptor.id)) {
      throw new Error(`Agent Provider already registered: ${registration.descriptor.id}`);
    }
    this.#registrations.set(registration.descriptor.id, registration);
  }

  list(): readonly AgentProviderDescriptor[] {
    return [...this.#registrations.values()].map((registration) => registration.descriptor);
  }

  has(providerId: string): boolean {
    return this.#registrations.has(providerId);
  }

  get(providerId: string): AgentProviderDescriptor | undefined {
    return this.#registrations.get(providerId)?.descriptor;
  }

  createSession(selection: AgentProviderSelection, host: AgentProviderHostPort): AgentProviderSessionPort {
    if (!isAgentProviderSelection(selection)) throw new Error("Invalid Agent Provider selection");
    const registration = this.#registrations.get(selection.providerId);
    if (!registration) throw new Error(`Unknown Agent Provider: ${selection.providerId}`);
    if (!registration.descriptor.models.some((model) => model.id === selection.modelId)) {
      throw new Error(`Unknown Agent Provider model: ${selection.providerId}/${selection.modelId}`);
    }
    return registration.createSession(selection, host);
  }
}
