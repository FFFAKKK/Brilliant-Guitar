import assert from "node:assert/strict";
import test from "node:test";

import { PluginManifestDiscovery } from "../src/plugins/plugin-discovery.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { adaptUiPluginPackage } from "../src/plugins/plugin-sdk-adapter.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import {
  PluginHostServicePolicy,
  PluginHostServiceRegistry,
} from "../src/plugins/plugin-security.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

test("host service policy resolves the documented four-way grant intersection", () => {
  const available = new PluginHostServiceRegistry([
    "score.read",
    "score.edit",
    "score.playback",
    "score.export",
  ]);
  const policy = new PluginHostServicePolicy(available, {
    tierAllowlist: {
      "third-party": ["score.read", "score.edit", "score.export", "score.missing"],
    },
    userGrants: {
      "test.security.plugin": ["score.read", "score.playback", "score.export", "score.missing"],
    },
    sessionPolicy: ["score.read", "score.edit", "score.playback", "score.missing"],
  });

  const resolution = policy.resolve({
    pluginId: "test.security.plugin",
    pluginVersion: "1.0.0",
    tier: "third-party",
    requiredHostServices: ["score.read", "score.edit", "score.playback", "score.export", "score.missing"],
  });

  assert.equal(resolution.accepted, false);
  if (resolution.accepted) return;
  assert.deepEqual(resolution.effectiveHostServices, ["score.read"]);
  assert.deepEqual(resolution.denial, {
    unavailable: ["score.missing"],
    deniedByTier: ["score.playback"],
    deniedByUser: ["score.edit"],
    deniedBySession: ["score.export"],
  });
});

test("product services default to the available inventory while third-party access is denied by default", () => {
  const available = new PluginHostServiceRegistry(["score.read"]);
  const policy = new PluginHostServicePolicy(available);

  assert.equal(policy.resolve({
    pluginId: "test.security.product",
    pluginVersion: "1.0.0",
    tier: "product",
    requiredHostServices: ["score.read"],
  }).accepted, true);
  const thirdParty = policy.resolve({
    pluginId: "test.security.third-party",
    pluginVersion: "1.0.0",
    tier: "third-party",
    requiredHostServices: ["score.read"],
  });
  assert.equal(thirdParty.accepted, false);
  if (!thirdParty.accepted) {
    assert.deepEqual(thirdParty.denial.deniedByTier, ["score.read"]);
    assert.deepEqual(thirdParty.denial.deniedByUser, ["score.read"]);
  }
});

test("plugin platform freezes accepted host service grants for the running session", () => {
  const thirdPartyAllowlist = ["score.read"];
  const userGrant = ["score.read"];
  const sessionPolicy = ["score.read"];
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    hostServices: new PluginHostServiceRegistry(["score.read", "score.edit"]),
    hostServicePolicy: {
      tierAllowlist: { "third-party": thirdPartyAllowlist },
      userGrants: {
        "test.security.allowed": userGrant,
        "test.security.denied": ["score.edit"],
      },
      sessionPolicy,
    },
    projections: [],
  });
  platform.registerAll([
    definePlugin({
      id: "test.security.allowed",
      name: "获准插件",
      version: "1.0.0",
      tier: "third-party",
      activation: "user",
      hostServices: ["score.read"],
    }),
    definePlugin({
      id: "test.security.denied",
      name: "拒绝插件",
      version: "1.0.0",
      tier: "third-party",
      hostServices: ["score.edit"],
    }),
  ]);
  platform.activate("test.security.allowed");

  thirdPartyAllowlist.push("score.edit");
  userGrant.push("score.edit");
  sessionPolicy.push("score.edit");
  const plan = platform.start();

  assert.deepEqual(platform.list().map(({ manifest, status }) => [manifest.id, status]), [
    ["test.security.allowed", "active"],
    ["test.security.denied", "failed"],
  ]);
  assert.deepEqual(plan.pluginIds, ["test.security.allowed"]);
  assert.deepEqual(plan.hostServiceGrants, [{
    grantVersion: 1,
    pluginId: "test.security.allowed",
    pluginVersion: "1.0.0",
    tier: "third-party",
    hostServices: ["score.read"],
  }]);
  assert.equal(Object.isFrozen(plan.hostServiceGrants), true);
  assert.equal(Object.isFrozen(plan.hostServiceGrants[0]), true);
  assert.equal(Object.isFrozen(plan.hostServiceGrants[0]?.hostServices), true);
  assert.equal(Object.isFrozen(platform.hostServiceGrants()), true);
  assert.equal("register" in platform.hostServiceGrants(), false);
  assert.equal(platform.diagnostics.list().at(-1)?.stage, "permissions");
  assert.equal(platform.diagnostics.list().at(-1)?.subject?.kind, "host-service");

  platform.deactivate("test.security.allowed");
  assert.deepEqual(platform.sessionPlan().hostServiceGrants, plan.hostServiceGrants);
  assert.deepEqual(platform.hostServiceGrants().get("test.security.allowed"), plan.hostServiceGrants[0]);
});

test("manifest discovery checks typed host service availability without loading plugin code", () => {
  const manifest = adaptUiPluginPackage(definePlugin({
    id: "test.security.discovery",
    name: "宿主服务发现",
    version: "1.0.0",
    hostServices: ["score.read"],
  })).manifest;
  const unavailable = new PluginManifestDiscovery({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    projections: [],
  });
  assert.equal(unavailable.inspect(manifest).accepted, false);
  assert.equal(unavailable.failures().at(-1)?.code, "manifest.host-service-unavailable");

  const available = new PluginManifestDiscovery({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    hostServices: new PluginHostServiceRegistry(["score.read"]),
    projections: [],
  });
  assert.equal(available.inspect(manifest).accepted, true);
});

test("host service contracts reject duplicates and universal access aliases", () => {
  assert.throws(() => new PluginHostServiceRegistry(["score.read", "score.read"]), /host service directory/);
  assert.throws(() => new PluginHostServiceRegistry(["host.all-access"]), /host service directory/);
});
