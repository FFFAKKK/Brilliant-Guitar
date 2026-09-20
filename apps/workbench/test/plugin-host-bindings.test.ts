import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT,
  AGENT_ASSISTANT_HOST_SERVICES,
  AGENT_ASSISTANT_PLUGIN_ID,
  AGENT_ASSISTANT_PLUGIN_VERSION,
} from "../src/plugins/agent-plugin-host-contract.ts";
import {
  definePluginHostBindingsContract,
  TrustedPluginHostBindingsResolver,
} from "../src/plugins/plugin-host-bindings.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginHostServiceRegistry } from "../src/plugins/plugin-security.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

function activeAgentPlan() {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    hostServices: new PluginHostServiceRegistry(AGENT_ASSISTANT_HOST_SERVICES),
    projections: [],
  });
  platform.register(definePlugin({
    id: AGENT_ASSISTANT_PLUGIN_ID,
    name: "Agent",
    version: AGENT_ASSISTANT_PLUGIN_VERSION,
    activation: "user",
    hostServices: AGENT_ASSISTANT_HOST_SERVICES,
  }));
  platform.activate(AGENT_ASSISTANT_PLUGIN_ID);
  return platform.start();
}

function bindingValues() {
  return {
    provider: Object.freeze({
      readAgentProviderCredentialStatus: () => undefined,
      decideAgentProvider: () => undefined,
    }),
    scoreRead: Object.freeze({
      readSummary: () => undefined,
      readMetadata: () => undefined,
      readStructure: () => undefined,
      readMeasureIndex: () => undefined,
      readMeasureRange: () => undefined,
    }),
    scoreChangeSets: Object.freeze({
      prepareTempoChange: () => undefined,
      prepareMetadataTransaction: () => undefined,
    }),
    commit: Object.freeze({ invoke: () => undefined }),
    runStore: Object.freeze({
      load: () => undefined,
      commit: () => undefined,
      listRecoverable: () => undefined,
      quarantine: () => undefined,
    }),
    receipts: null,
    workflows: Object.freeze({ get: () => undefined, list: () => [], listByPlugin: () => [] }),
  };
}

test("agent host service IDs and binding keys form one exact public contract", () => {
  assert.deepEqual(
    AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT.slots.map((slot) => slot.hostService),
    AGENT_ASSISTANT_HOST_SERVICES,
  );
  assert.deepEqual(
    AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT.slots.map((slot) => slot.key),
    ["provider", "scoreRead", "scoreChangeSets", "commit", "runStore", "receipts", "workflows"],
  );
});

test("trusted shell resolves one concrete frozen binding object from the session grant", () => {
  const values = bindingValues();
  const resolved = new TrustedPluginHostBindingsResolver(activeAgentPlan())
    .resolve(AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT, values);

  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.plugin), true);
  assert.deepEqual(resolved.plugin, {
    id: AGENT_ASSISTANT_PLUGIN_ID,
    version: AGENT_ASSISTANT_PLUGIN_VERSION,
  });
  assert.equal(resolved.provider, values.provider);
  assert.equal(resolved.receipts, null);
  assert.equal("get" in resolved, false);
  assert.equal("services" in resolved, false);
  assert.deepEqual(Object.keys(resolved), [
    "bindingVersion",
    "plugin",
    "provider",
    "scoreRead",
    "scoreChangeSets",
    "commit",
    "runStore",
    "receipts",
    "workflows",
  ]);
});

test("trusted shell rejects inactive plugins, grant drift, and extra binding surfaces", () => {
  const inactivePlatform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    hostServices: new PluginHostServiceRegistry(AGENT_ASSISTANT_HOST_SERVICES),
    projections: [],
  });
  inactivePlatform.register(definePlugin({
    id: AGENT_ASSISTANT_PLUGIN_ID,
    name: "Agent",
    version: AGENT_ASSISTANT_PLUGIN_VERSION,
    activation: "user",
    hostServices: AGENT_ASSISTANT_HOST_SERVICES,
  }));
  const inactive = new TrustedPluginHostBindingsResolver(inactivePlatform.start());
  assert.throws(
    () => inactive.resolve(AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT, bindingValues()),
    /not active/,
  );

  const active = new TrustedPluginHostBindingsResolver(activeAgentPlan());
  const drifted = definePluginHostBindingsContract({
    pluginId: AGENT_ASSISTANT_PLUGIN_ID,
    pluginVersion: AGENT_ASSISTANT_PLUGIN_VERSION,
    slots: AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT.slots.slice(0, -1),
  });
  assert.throws(() => active.resolve(drifted, {
    provider: {}, scoreRead: {}, scoreChangeSets: {}, commit: {}, runStore: {}, receipts: null, workflows: {},
  }), /do not match the frozen grant/);

  assert.throws(() => active.resolve(AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT, {
    ...bindingValues(),
    workbenchClient: {},
  }), /do not match the contract/);

  assert.throws(() => active.resolve(AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT, {
    ...bindingValues(),
    provider: {
      readAgentProviderCredentialStatus() {},
      decideAgentProvider() {},
      read() {},
      edit() {},
    },
  }), /exposes methods outside its typed port/);
});

test("binding contracts forbid generic client, kernel, bridge, and service-locator keys", () => {
  for (const key of ["client", "workbenchClient", "kernel", "bridge", "tauri", "services", "serviceLocator"]) {
    assert.throws(() => definePluginHostBindingsContract({
      pluginId: "test.forbidden-bindings",
      pluginVersion: "1.0.0",
      slots: [{ key, hostService: "test.host-service", methods: ["run"] }],
    }), /Invalid plugin host binding keys/);
  }
});
