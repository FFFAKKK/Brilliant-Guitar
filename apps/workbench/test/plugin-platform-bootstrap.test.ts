import assert from "node:assert/strict";
import test from "node:test";

import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { bootstrapPersistedPluginPlatform } from "../src/plugins/plugin-platform-bootstrap.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import { reconcileUiLayout } from "../src/ui/layout-state.ts";

function platformWithUserPlugin(): PluginPlatform {
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    projections: [],
  });
  platform.register(definePlugin({
    id: "test.bootstrap.user",
    name: "Bootstrap User",
    version: "1.0.0",
    activation: "user",
  }));
  return platform;
}

for (const mode of ["desktop", "persisted"] as const) {
  test(`${mode} startup exposes installed components before capturing the workspace layout`, async () => {
    const platform = platformWithUserPlugin();
    platform.register(definePlugin({
      id: "test.bootstrap.notation",
      name: "Notation",
      version: "1.0.0",
      activation: "always",
      views: [{
        definition: {
          id: "notation.staff-view",
          version: "1.0",
          kind: "view",
          domain: "notation",
          slots: ["workspace"],
          presentation: { allowed: ["inline"], default: "inline" },
          capabilities: {},
          permissions: { projections: [], commands: [] },
        },
        label: "Staff",
        render: () => null,
      }],
    }));
    const beforeBootstrap = platform.components().list();
    assert.deepEqual(beforeBootstrap, []);
    if (mode === "desktop") {
      platform.start();
    } else {
      await bootstrapPersistedPluginPlatform(
        platform,
        { read: async () => null, write: async () => {} },
        { read: async () => null, write: async () => {} },
        () => assert.fail("bootstrap unexpectedly failed"),
      );
    }
    const installedComponents = platform.components().list();
    assert.deepEqual(beforeBootstrap, []);
    assert.deepEqual(installedComponents.map((component) => component.id), ["notation.staff-view"]);
    const layout = reconcileUiLayout(installedComponents, null);
    assert.deepEqual(layout.placements.map(({ componentId, slot, visible }) => ({ componentId, slot, visible })), [
      { componentId: "notation.staff-view", slot: "workspace", visible: true },
    ]);
    platform.activate("test.bootstrap.user");
    assert.deepEqual(platform.components().list(), installedComponents);
    assert.deepEqual(reconcileUiLayout(installedComponents, null), layout);
  });
}

test("bootstrap restores activation before freezing the session and settings afterwards", async () => {
  const platform = platformWithUserPlugin();
  const events: string[] = [];
  const result = await bootstrapPersistedPluginPlatform(
    platform,
    {
      read: async () => {
        events.push(`activation:read:${platform.phase()}`);
        return { schemaVersion: 1, enabledPluginIds: ["test.bootstrap.user"] };
      },
      write: async () => { events.push(`activation:write:${platform.phase()}`); },
    },
    {
      read: async () => {
        events.push(`settings:read:${platform.phase()}`);
        return {};
      },
      write: async () => { events.push(`settings:write:${platform.phase()}`); },
    },
    () => assert.fail("bootstrap unexpectedly reported a persistence failure"),
  );

  assert.deepEqual(events, [
    "activation:read:configuring",
    "activation:write:configuring",
    "settings:read:running",
    "settings:write:running",
  ]);
  assert.deepEqual(result.plan.pluginIds, ["test.bootstrap.user"]);
  assert.equal(platform.list()[0]?.active, true);
});

test("bootstrap starts with user plugins disabled when activation restore fails", async () => {
  const platform = platformWithUserPlugin();
  const failures: string[] = [];
  let settingsRestored = false;
  const result = await bootstrapPersistedPluginPlatform(
    platform,
    {
      read: async () => { throw new Error("activation unavailable"); },
      write: async () => {},
    },
    {
      read: async () => { settingsRestored = true; return {}; },
      write: async () => {},
    },
    (kind) => { failures.push(kind); },
  );

  assert.deepEqual(failures, ["activation"]);
  assert.equal(settingsRestored, true);
  assert.equal(platform.phase(), "running");
  assert.deepEqual(result.plan.pluginIds, []);
  assert.equal(platform.list()[0]?.active, false);
});

test("bootstrap clears a partially restored selection when activation persistence cannot be written", async () => {
  const platform = platformWithUserPlugin();
  const failures: string[] = [];
  const result = await bootstrapPersistedPluginPlatform(
    platform,
    {
      read: async () => ({ schemaVersion: 1, enabledPluginIds: ["test.bootstrap.user"] }),
      write: async () => { throw new Error("activation write unavailable"); },
    },
    { read: async () => null, write: async () => {} },
    (kind) => { failures.push(kind); },
  );

  assert.deepEqual(failures, ["activation"]);
  assert.equal(result.plan.pluginIds.includes("test.bootstrap.user"), false);
  assert.equal(platform.list()[0]?.active, false);
  assert.equal(platform.list()[0]?.nextLaunchActive, false);
});

test("persisted preference changes after bootstrap only affect the next launch", async () => {
  const platform = platformWithUserPlugin();
  const writes: unknown[] = [];
  const result = await bootstrapPersistedPluginPlatform(
    platform,
    { read: async () => null, write: async (document) => { writes.push(document); } },
    { read: async () => null, write: async () => {} },
    () => assert.fail("bootstrap unexpectedly reported a persistence failure"),
  );

  await result.startup.setEnabled("test.bootstrap.user", true);
  assert.equal(platform.list()[0]?.active, false);
  assert.equal(platform.list()[0]?.nextLaunchActive, true);
  assert.equal(platform.list()[0]?.restartRequired, true);
  assert.deepEqual(writes.at(-1), {
    schemaVersion: 1,
    enabledPluginIds: ["test.bootstrap.user"],
  });
});

test("bootstrap connects recovery persistence before launch and exposes stable marking", async () => {
  const platform = platformWithUserPlugin();
  const writes: unknown[] = [];
  const result = await bootstrapPersistedPluginPlatform(
    platform,
    {
      read: async () => ({ schemaVersion: 1, enabledPluginIds: ["test.bootstrap.user"] }),
      write: async () => {},
    },
    { read: async () => null, write: async () => {} },
    () => assert.fail("bootstrap unexpectedly reported a persistence failure"),
    {
      recoveryStorage: {
        read: async () => null,
        write: async (document) => { writes.push(document); },
      },
    },
  );

  assert.deepEqual(writes, [{
    schemaVersion: 1,
    state: "launching",
    attemptedPluginIds: ["test.bootstrap.user"],
    lastKnownGoodPluginIds: [],
  }]);
  await result.startup.markStable();
  assert.deepEqual(writes.at(-1), {
    schemaVersion: 1,
    state: "stable",
    attemptedPluginIds: [],
    lastKnownGoodPluginIds: ["test.bootstrap.user"],
  });
});
