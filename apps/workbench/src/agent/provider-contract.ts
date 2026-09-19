export type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
export { isAgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { AgentProviderPort } from "./provider.ts";

export type AgentProviderExecutionLocation = "remote" | "local";
export type AgentProviderCredentialKind = "api-key" | "none";

export interface AgentProviderModelDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: Readonly<{
    toolCalling: boolean;
    streaming: boolean;
    structuredOutput: boolean;
  }>;
}

export interface AgentProviderDescriptor {
  readonly id: string;
  readonly label: string;
  readonly executionLocation: AgentProviderExecutionLocation;
  readonly credentialKind: AgentProviderCredentialKind;
  readonly models: readonly AgentProviderModelDescriptor[];
}

export type AgentProviderRuntimeStatus =
  | "unconfigured"
  | "checking"
  | "authentication-required"
  | "ready"
  | "unavailable"
  | "error";

export interface AgentProviderRuntimeSnapshot {
  readonly status: AgentProviderRuntimeStatus;
  readonly providerId: string | null;
  readonly model: string | null;
  readonly message: string;
}

export interface AgentProviderSessionPort {
  getSnapshot(): AgentProviderRuntimeSnapshot;
  getProvider(): AgentProviderPort | null;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  dispose(): void;
}

const providerIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

export function isAgentProviderDescriptor(value: unknown): value is AgentProviderDescriptor {
  const descriptor = record(value);
  const models = descriptor?.models;
  return descriptor !== null
    && onlyKeys(descriptor, ["id", "label", "executionLocation", "credentialKind", "models"])
    && typeof descriptor.id === "string" && descriptor.id.length <= 160 && providerIdPattern.test(descriptor.id)
    && validText(descriptor.label, 80)
    && (descriptor.executionLocation === "remote" || descriptor.executionLocation === "local")
    && (descriptor.credentialKind === "api-key" || descriptor.credentialKind === "none")
    && Array.isArray(models) && models.length > 0
    && models.every(isAgentProviderModelDescriptor)
    && new Set(models.map((model) => model.id)).size === models.length;
}

export function isAgentProviderModelDescriptor(value: unknown): value is AgentProviderModelDescriptor {
  const model = record(value);
  const capabilities = record(model?.capabilities);
  return model !== null
    && onlyKeys(model, ["id", "label", "capabilities"])
    && validText(model.id, 160)
    && validText(model.label, 80)
    && capabilities !== null
    && onlyKeys(capabilities, ["toolCalling", "streaming", "structuredOutput"])
    && typeof capabilities.toolCalling === "boolean"
    && typeof capabilities.streaming === "boolean"
    && typeof capabilities.structuredOutput === "boolean";
}

export const UNCONFIGURED_AGENT_PROVIDER: AgentProviderRuntimeSnapshot = Object.freeze({
  status: "unconfigured",
  providerId: null,
  model: null,
  message: "尚未配置模型 Provider",
});
