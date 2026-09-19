import assert from "node:assert/strict";
import test from "node:test";

import type { AgentProviderDescriptor, AgentProviderRuntimeSnapshot,
  AgentProviderSessionPort } from "../src/agent/provider-contract.ts";
import { isAgentProviderDescriptor, isAgentProviderSelection } from "../src/agent/provider-contract.ts";
import { createConfiguredAgentProviderSession } from "../src/agent/agent-provider-catalog.ts";
import { AgentProviderRegistry } from "../src/agent/provider-registry.ts";
import type { AgentProviderHostPort } from "../src/agent/provider-host.ts";

const descriptor: AgentProviderDescriptor = {
  id: "provider.example",
  label: "Example Provider",
  executionLocation: "remote",
  credentialKind: "api-key",
  models: [{
    id: "model-1",
    label: "Model 1",
    capabilities: { toolCalling: true, streaming: true, structuredOutput: true },
  }],
};

class Session implements AgentProviderSessionPort {
  readonly snapshot: AgentProviderRuntimeSnapshot;
  constructor(model: string) {
    this.snapshot = { status: "ready", providerId: descriptor.id, model, message: "Provider ready" };
  }
  getSnapshot = () => this.snapshot;
  getProvider = () => null;
  subscribe = (_listener: () => void): (() => void) => () => {};
  async refresh(): Promise<void> {}
  dispose(): void {}
}

const host: AgentProviderHostPort = {
  async readAgentProviderCredentialStatus(providerId) {
    return { providerId, present: false, status: "missing", message: "missing" };
  },
  async decideAgentProvider() { throw new Error("unused"); },
};

test("Provider contracts validate metadata and explicit selections", () => {
  assert.equal(isAgentProviderDescriptor(descriptor), true);
  assert.equal(isAgentProviderDescriptor({ ...descriptor, surprise: true }), false);
  assert.equal(isAgentProviderDescriptor({ ...descriptor, id: "Invalid Provider" }), false);
  assert.equal(isAgentProviderDescriptor({ ...descriptor, models: [...descriptor.models, descriptor.models[0]] }), false);
  assert.equal(isAgentProviderSelection({ providerId: descriptor.id, modelId: "model-1" }), true);
  assert.equal(isAgentProviderSelection({ providerId: descriptor.id, modelId: "" }), false);
});

test("Provider registry rejects duplicate and unknown adapters without choosing fallbacks", () => {
  const registry = new AgentProviderRegistry();
  registry.register({ descriptor, createSession: (selection) => new Session(selection.modelId) });

  assert.deepEqual(registry.list(), [descriptor]);
  assert.equal(registry.has(descriptor.id), true);
  assert.equal(registry.createSession({ providerId: descriptor.id, modelId: "model-1" }, host).getSnapshot().model, "model-1");
  assert.throws(() => registry.register({ descriptor, createSession: () => new Session("model-1") }), /already registered/);
  assert.throws(() => registry.createSession({ providerId: "provider.missing", modelId: "model-1" }, host), /Unknown/);
  assert.throws(() => registry.createSession({ providerId: descriptor.id, modelId: "model-missing" }, host), /model/);
});

test("production catalog preserves stale selections as structured unavailable state", () => {
  assert.equal(createConfiguredAgentProviderSession(null).getSnapshot().status, "unconfigured");
  const snapshot = createConfiguredAgentProviderSession({
    providerId: "provider.missing",
    modelId: "model-removed",
  }).getSnapshot();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.providerId, "provider.missing");
  assert.equal(snapshot.model, "model-removed");
});
