import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowDirectory } from "../src/contracts/workflow.ts";
import {
  AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT,
  AGENT_ASSISTANT_HOST_SERVICES,
  AGENT_ASSISTANT_PLUGIN_ID,
  AGENT_ASSISTANT_PLUGIN_VERSION,
} from "../src/plugins/agent-plugin-host-contract.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginHostServiceRegistry } from "../src/plugins/plugin-security.ts";
import type { PluginHostServiceId } from "../src/plugins/plugin-security.ts";
import { createWorkbenchAgentPluginBindings } from "../src/services/workbench-agent-plugin-host.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

function sessionPlan(options: {
  readonly active?: boolean;
  readonly version?: string;
  readonly services?: readonly PluginHostServiceId[];
} = {}) {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    hostServices: new PluginHostServiceRegistry(AGENT_ASSISTANT_HOST_SERVICES),
    projections: [],
  });
  platform.register(definePlugin({
    id: AGENT_ASSISTANT_PLUGIN_ID,
    name: "Agent",
    version: options.version ?? AGENT_ASSISTANT_PLUGIN_VERSION,
    activation: "user",
    hostServices: options.services ?? AGENT_ASSISTANT_HOST_SERVICES,
  }));
  if (options.active !== false) platform.activate(AGENT_ASSISTANT_PLUGIN_ID);
  return platform.start();
}

function host() {
  const calls: string[] = [];
  const summary = { documentId: "score-1", documentVersion: 3, title: "Score", measureCount: 1 };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(async <T>(command: string): Promise<T> => {
    calls.push(command);
    assert.equal(command, "workbench_score_read_summary_v1");
    return summary as T;
  }));
  const workflows: WorkflowDirectory = Object.freeze({
    get: () => undefined,
    list: () => [],
    listByPlugin: () => [],
  });
  return { client, workflows, calls, summary };
}

test("Agent host bindings preserve the frozen grant identity and scoped typed ports", async () => {
  const { client, workflows, calls, summary } = host();
  const plan = sessionPlan();
  const bindings = createWorkbenchAgentPluginBindings(
    client, workflows, AGENT_ASSISTANT_PLUGIN_VERSION, plan,
  );
  const grant = plan.hostServiceGrants.find((item) => item.pluginId === AGENT_ASSISTANT_PLUGIN_ID);
  assert.ok(grant);
  assert.deepEqual(bindings.plugin, { id: grant.pluginId, version: grant.pluginVersion });
  assert.equal(Object.isFrozen(bindings), true);
  assert.equal(Object.isFrozen(bindings.plugin), true);
  assert.throws(() => Object.assign(bindings.plugin, { version: "9.9.9" }), TypeError);
  assert.deepEqual(Object.keys(bindings).sort(), [
    "bindingVersion", "plugin", "hostAvailable",
    ...AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT.slots.map((slot) => slot.key),
  ].sort());
  assert.deepEqual(Object.keys(bindings.scoreRead).sort(), [
    "readSummary", "readMetadata", "readStructure", "readMeasureIndex", "readMeasureRange",
  ].sort());
  assert.equal(Object.isFrozen(bindings.scoreRead), true);
  assert.equal(Object.isFrozen(bindings.workflows), true);
  assert.equal("edit" in bindings.scoreRead, false);
  assert.equal("register" in bindings.workflows, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(await bindings.scoreRead.readSummary(), { status: "ready", data: summary });
  assert.deepEqual(calls, ["workbench_score_read_summary_v1"]);
  assert.deepEqual(bindings.workflows.list(), []);
});

test("Agent host bindings reject caller versions that differ from the resolved frozen grant", () => {
  const { client, workflows, calls } = host();
  const plan = sessionPlan();
  for (const version of ["2.0.0", "", "1.0.0 ", "v1.0.0"]) {
    assert.throws(
      () => createWorkbenchAgentPluginBindings(client, workflows, version, plan),
      /version does not match the frozen grant/,
    );
  }
  assert.deepEqual(calls, []);
});

test("Agent host bindings reject an inactive plugin without invoking host services", () => {
  const { client, workflows, calls } = host();
  assert.throws(
    () => createWorkbenchAgentPluginBindings(
      client, workflows, AGENT_ASSISTANT_PLUGIN_VERSION, sessionPlan({ active: false }),
    ),
    /not active/,
  );
  assert.deepEqual(calls, []);
});

test("Agent host bindings reject grant and contract version drift even when the caller matches the grant", () => {
  const { client, workflows, calls } = host();
  assert.throws(
    () => createWorkbenchAgentPluginBindings(client, workflows, "2.0.0", sessionPlan({ version: "2.0.0" })),
    /version does not match the frozen grant/,
  );
  assert.deepEqual(calls, []);
});

test("Agent host bindings do not compensate for missing frozen service grants", () => {
  const { client, workflows, calls } = host();
  assert.throws(
    () => createWorkbenchAgentPluginBindings(
      client, workflows, AGENT_ASSISTANT_PLUGIN_VERSION,
      sessionPlan({ services: AGENT_ASSISTANT_HOST_SERVICES.slice(0, -1) }),
    ),
    /services do not match the frozen grant/,
  );
  assert.deepEqual(calls, []);
});
