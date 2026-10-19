import assert from "node:assert/strict";
import test from "node:test";

import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform, installPlugin } from "../src/runtime/plugin-installer.js";
import { createUiPluginHost } from "../src/runtime/ui-plugin-host.js";

function runtime() {
  const router = createCommandRouter();
  const components = createComponentRegistry();
  const menus = createMenuRegistry([{ id: "view", label: "视图" }]);
  const ui = createUiPluginHost({ components });
  return { router, components, menus, facetHosts: { ui } };
}

function plugin(namespace = "fixture") {
  return {
    namespace,
    components: [{ id: `${namespace}.stage`, title: "舞台", role: "view", slots: ["stage"], mount() {} }],
    commands: [{ id: `${namespace}.inspect`, label: "检查", run: () => ({ ok: true }) }],
    menuItems: [{ menu: "view", group: 0, order: 0, command: `${namespace}.inspect` }],
  };
}

test("generic platform installs the legacy package through the UI facet host", () => {
  const current = runtime();
  const platform = createPluginPlatform(current);
  platform.register(plugin());
  const records = platform.start();

  assert.equal(records[0].status, "active");
  assert.deepEqual(current.components.list().map((item) => item.id), ["fixture.stage"]);
  assert.deepEqual(platform.facets("ui").map((item) => item.pluginId), ["fixture"]);
  assert.deepEqual(platform.facets("ui")[0].value.pages.map((item) => item.componentId), ["fixture.stage"]);
  assert.equal("layout" in current.facetHosts.ui, false);
  assert.equal("focus" in current.facetHosts.ui, false);
  assert.equal("overlay" in current.facetHosts.ui, false);
});

test("legacy installPlugin remains compatible and rolls back on host failure", () => {
  const current = runtime();
  const dispose = installPlugin(current, plugin("legacy"));
  assert.equal(current.components.get("legacy.stage").owner, "legacy");
  dispose();
  assert.equal(current.components.get("legacy.stage"), null);

  assert.throws(() => installPlugin(current, {
    ...plugin("broken"),
    components: [{ ...plugin("broken").components[0], slots: ["unknown"] }],
  }), /安装失败|注册失败|UI facet 无效/);
  assert.equal(current.components.get("broken.stage"), null);
});

test("the UI facet is data-only and explicit module/page declarations stay bounded by components", () => {
  const current = runtime();
  const platform = createPluginPlatform(current);
  const manifest = plugin("declared");
  manifest.facets = {
    ui: {
      contractVersion: 1,
      modules: [],
      pages: [{ id: "declared.stage", componentId: "declared.stage", slots: ["stage"] }],
      slots: ["stage", "top", "left", "right", "bottom", "overlay"],
    },
  };
  platform.register(manifest);
  platform.start();
  const facet = platform.facets("ui")[0].value;
  assert.deepEqual(facet.modules, []);
  assert.deepEqual(facet.pages[0], { id: "declared.stage", componentId: "declared.stage", kind: "page", slots: ["stage"] });
  assert.equal(typeof facet.pages[0].mount, "undefined");
});
