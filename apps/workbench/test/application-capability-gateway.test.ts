import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import type { ApplicationCapabilityContribution } from "../src/contracts/application-capability.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { SCORE_APPLICATION_PLUGIN } from "../src/plugins/score-application-plugin.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import {
  ApplicationCapabilityGateway,
  ApplicationCapabilityGatewayError,
} from "../src/services/application-capability-gateway.ts";

function contribution(
  id: string,
  callers: ApplicationCapabilityContribution["callers"],
): ApplicationCapabilityContribution {
  return {
    id,
    contractVersion: 1,
    callers,
    validateInput: (value) => typeof value === "object" && value !== null
      && (value as Record<string, unknown>).value === "ok",
    validateOutput: (value) => typeof value === "object" && value !== null
      && (value as Record<string, unknown>).accepted === true,
  };
}

function request(capabilityId: string, input: unknown = { value: "ok" }): CapabilityTransportRequest {
  return {
    invocationId: crypto.randomUUID(),
    capabilityId,
    contractVersion: 1,
    workspaceId: crypto.randomUUID(),
    documentPrecondition: null,
    input,
  };
}

test("plugin platform owns capability visibility while one gateway serves UI and Agent callers", async () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.registerAll([
    definePlugin({
      id: "test.operations.active",
      name: "Active operations",
      version: "1.0.0",
      applicationCapabilities: [
        contribution("test.operation.shared", ["ui", "agent"]),
        contribution("test.operation.agent-only", ["agent"]),
      ],
    }),
    definePlugin({
      id: "test.operations.disabled",
      name: "Disabled operations",
      version: "1.0.0",
      activation: "user",
      applicationCapabilities: [contribution("test.operation.disabled", ["agent"])],
    }),
  ]);
  platform.start();

  const directory = platform.applicationCapabilities();
  assert.equal(directory.get("test.operation.shared")?.ownerPluginId, "test.operations.active");
  assert.equal(directory.get("test.operation.disabled"), undefined);
  assert.deepEqual(directory.list("ui").map((item) => item.id), ["test.operation.shared"]);

  const transports: string[] = [];
  const completed = (transport: string, value: CapabilityTransportRequest) => {
    transports.push(transport);
    return {
      status: "completed" as const,
      invocationId: value.invocationId,
      capabilityId: value.capabilityId,
      contractVersion: value.contractVersion,
      data: { accepted: true },
    };
  };
  const gateway = new ApplicationCapabilityGateway(directory, {
    invokeCapability: async (value) => completed("ui", value),
    invokeAgentCapability: async (value) => completed("agent", value),
  });

  await gateway.forCaller("ui").invokeCapability(request("test.operation.shared"));
  await gateway.forCaller("agent").invokeCapability(request("test.operation.shared"));
  await gateway.forCaller("agent").invokeCapability(request("test.operation.agent-only"));
  assert.deepEqual(transports, ["ui", "agent", "agent"]);

  await assert.rejects(
    gateway.forCaller("ui").invokeCapability(request("test.operation.agent-only")),
    (error) => error instanceof ApplicationCapabilityGatewayError
      && error.code === "caller-not-allowed"
      && error.outcome === "definite-failure",
  );
  await assert.rejects(
    gateway.forCaller("agent").invokeCapability(request("test.operation.disabled")),
    (error) => error instanceof ApplicationCapabilityGatewayError
      && error.code === "capability-unavailable",
  );
  await assert.rejects(
    gateway.forCaller("agent").invokeCapability(request("test.operation.shared", { value: "bad" })),
    (error) => error instanceof ApplicationCapabilityGatewayError
      && error.code === "invalid-input",
  );
  assert.deepEqual(transports, ["ui", "agent", "agent"]);
});

test("duplicate application capability ownership isolates the later plugin", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.registerAll([
    definePlugin({ id: "test.owner.first", name: "First", version: "1.0.0",
      applicationCapabilities: [contribution("test.operation.owned", ["ui"])] }),
    definePlugin({ id: "test.owner.second", name: "Second", version: "1.0.0",
      applicationCapabilities: [contribution("test.operation.owned", ["agent"])] }),
  ]);
  platform.start();

  assert.equal(platform.applicationCapabilities().get("test.operation.owned")?.ownerPluginId, "test.owner.first");
  assert.equal(platform.list().find((item) => item.manifest.id === "test.owner.second")?.status, "failed");
  assert.equal(platform.diagnostics.list().at(-1)?.code, "UI-PLG-008");
});

test("the score plugin is the sole source of score operation contracts", () => {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(SCORE_APPLICATION_PLUGIN);
  platform.start();

  assert.deepEqual(platform.applicationCapabilities().list("ui").map((item) => item.id), [
    "score.read-summary",
    "score.read-metadata",
    "score.read-structure",
    "score.read-measure-index",
    "score.read-measure-range",
  ]);
  assert.equal(platform.applicationCapabilities().list("agent").length, 10);
  assert.equal(platform.applicationCapabilities().get("score.update-title")?.ownerPluginId, "brilliant.score");
});
