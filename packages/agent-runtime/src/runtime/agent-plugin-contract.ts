import type { AgentDecision } from "./agent-contracts.ts";
import type {
  AgentDecisionProviderPort,
  AgentProviderProgressObserver,
  AgentProviderRequest,
} from "./provider.ts";

export type AgentPluginKind = "first-party" | "external";

export interface AgentPluginDescriptor {
  readonly id: string;
  readonly version: string;
  readonly kind: AgentPluginKind;
  readonly label: string;
  readonly rejectionFeedback?: "v1" | "none";
}

export interface AgentPluginRequest extends AgentProviderRequest {
  readonly plugin: AgentPluginDescriptor;
}

export type AgentPluginDecisionObserver = AgentProviderProgressObserver;

export type AgentPluginDecisionFn = (
  request: AgentPluginRequest,
  signal?: AbortSignal | null,
  observer?: AgentPluginDecisionObserver | null,
) => Promise<AgentDecision>;

export interface AgentPluginPort {
  readonly descriptor: AgentPluginDescriptor;
  decide(
    request: AgentPluginRequest,
    signal?: AbortSignal | null,
    observer?: AgentPluginDecisionObserver | null,
  ): Promise<AgentDecision>;
}

export interface AgentPluginProvider extends AgentDecisionProviderPort {
  readonly plugin: AgentPluginDescriptor;
}

function validText(value: string, field: string): void {
  if (!value.trim() || value !== value.trim()) {
    throw new Error(`Invalid Agent Plugin ${field}`);
  }
}

function freezeDescriptor(descriptor: AgentPluginDescriptor): AgentPluginDescriptor {
  validText(descriptor.id, "id");
  validText(descriptor.version, "version");
  validText(descriptor.label, "label");
  if (descriptor.kind !== "first-party" && descriptor.kind !== "external") {
    throw new Error("Invalid Agent Plugin kind");
  }
  if (descriptor.rejectionFeedback !== undefined
    && descriptor.rejectionFeedback !== "v1" && descriptor.rejectionFeedback !== "none") {
    throw new Error("Invalid Agent Plugin rejection feedback capability");
  }
  return Object.freeze({ ...descriptor });
}

function createPlugin(
  descriptor: AgentPluginDescriptor,
  decide: AgentPluginDecisionFn,
): AgentPluginPort {
  const frozenDescriptor = freezeDescriptor(descriptor);
  if (typeof decide !== "function") throw new Error("Invalid Agent Plugin decision function");
  return Object.freeze({
    descriptor: frozenDescriptor,
    decide: (
      request: AgentPluginRequest,
      signal?: AbortSignal | null,
      observer?: AgentPluginDecisionObserver | null,
    ) => decide(request, signal, observer),
  });
}

export interface AgentPluginFactoryOptions {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly rejectionFeedback?: "v1" | "none";
  readonly decide: AgentPluginDecisionFn;
}

export function createFirstPartyAgentPlugin(
  options: AgentPluginFactoryOptions,
): AgentPluginPort {
  return createPlugin({
    id: options.id,
    version: options.version,
    kind: "first-party",
    label: options.label,
    ...(options.rejectionFeedback === undefined ? {} : { rejectionFeedback: options.rejectionFeedback }),
  }, options.decide);
}

export function createExternalAgentPlugin(
  options: AgentPluginFactoryOptions,
): AgentPluginPort {
  return createPlugin({
    id: options.id,
    version: options.version,
    kind: "external",
    label: options.label,
    ...(options.rejectionFeedback === undefined ? {} : { rejectionFeedback: options.rejectionFeedback }),
  }, options.decide);
}

export function createAgentPluginProvider(plugin: AgentPluginPort): AgentPluginProvider {
  if (plugin === null || typeof plugin !== "object") {
    throw new Error("Invalid Agent Plugin");
  }
  if (typeof plugin.decide !== "function") {
    throw new Error("Invalid Agent Plugin decision function");
  }
  const descriptor = freezeDescriptor(plugin.descriptor);
  return Object.freeze({
    plugin: descriptor,
    capabilities: Object.freeze({ rejectionFeedback: descriptor.rejectionFeedback ?? "none" }),
    decide: (
      request: AgentProviderRequest,
      signal?: AbortSignal | null,
      observer?: AgentProviderProgressObserver | null,
    ): Promise<AgentDecision> => plugin.decide({
      ...request,
      plugin: descriptor,
    }, signal, observer),
  });
}
