import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { definePlugin } from "../src/vendor/plugin-platform.js";
import { createBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createNotices } from "../src/runtime/notices.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { loadCoreSelectionPluginForTest, sourceFixture } from "./support/score-selection-fixture.js";

const identity = id => ({ id, name: id, version: "0.1.0", apiVersion: "4.0" });
const emptyUi = components => ({ contractVersion: 1, components, commands: [], menuItems: [], shortcuts: [] });
function setup() {
  const router = createCommandRouter(), registry = createComponentRegistry();
  const platform = createBackupFormalPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  return { platform, registry, host: createComponentHost({ registry, router, notices: createNotices() }) };
}
function strategy(id, notationKind) {
  // Interface fixture only; this is not a real tablature implementation.
  return { id: `${id}.strategy`, notationKind,
    input: { id: `${id}.input`, canHandle: (_, context) => context.notationKind === notationKind,
      translate: () => ({ kind: "ignored", handled: true }) },
    readDraft: value => value, startComposition: draft => ({ methodId: `${id}.compose`, draft }),
    navigate: () => `${id}:navigate`, edit: () => `${id}:edit` };
}
const panel = (id, mount) => ({ id: `${id}.panel`, title: id, role: "tool", slots: ["left"], mount });

test("formal mounts receive only their captured strategy reads, and retained ports expire on platform disposal", () => withTestDocument(() => {
  const { platform, registry, host } = setup(), contexts = {};
  for (const [id, kind] of [["trial.staff", "staff"], ["trial.tab", "tablature"], ["trial.empty", null]]) {
    platform.register(definePlugin({ ...identity(id), ...(kind ? { interactions: [strategy(id, kind)] } : {}),
      ui: emptyUi([panel(id, (_element, ctx) => { contexts[id] = ctx; })]) }));
  }
  platform.start();
  try {
    for (const component of registry.list()) host.ensure(component.id, "left");
    assert.equal(contexts["trial.empty"].notationInteractions, undefined);
    const staff = contexts["trial.staff"].notationInteractions, tab = contexts["trial.tab"].notationInteractions;
    assert.ok(Object.isFrozen(staff)); assert.equal(staff.register, undefined); assert.equal(staff.clear, undefined);
    assert.equal(contexts["trial.staff"].platform, undefined);
    assert.deepEqual(staff.list(), ["trial.staff.strategy"]); assert.equal(staff.hasKind("tablature"), false);
    assert.deepEqual(tab.list(), ["trial.tab.strategy"]); assert.equal(tab.hasId("trial.staff.strategy"), false);
    const signal = { kind: "key-press", key: "1", modifiers: [], repeat: false };
    assert.equal(staff.navigate("staff", signal, {}), "trial.staff:navigate");
    assert.equal(staff.edit("tablature", signal, {}), null);
    assert.equal(tab.edit("tablature", signal, {}), "trial.tab:edit");
    assert.equal(tab.translate("staff", signal, { notationKind: "staff" }), null);
    host.dispose(); platform.dispose();
    assert.deepEqual(staff.list(), []); assert.equal(staff.hasKind("staff"), false);
    assert.equal(staff.navigate("staff", signal, {}), null); assert.equal(tab.startComposition("tablature", "12"), null);
  } finally { host.dispose(); platform.dispose(); }
}));

test("a conflicting strategy rolls back its UI rather than borrowing the accepted provider", () => withTestDocument(() => {
  const { platform, registry, host } = setup(); let mounts = 0;
  for (const id of ["trial.first", "trial.conflict"]) platform.register(definePlugin({ ...identity(id),
    interactions: [strategy(id, "staff")], ui: emptyUi([panel(id, () => { mounts++; })]) }));
  platform.start();
  try {
    assert.deepEqual(platform.list().map(record => record.status), ["active", "failed"]);
    assert.deepEqual(platform.interactions().list(), ["trial.first.strategy"]);
    assert.deepEqual(registry.list().map(component => component.id), ["trial.first.panel"]);
    host.ensure("trial.first.panel", "left"); assert.equal(mounts, 1);
    assert.throws(() => host.ensure("trial.conflict.panel", "left"));
    assert.equal(mounts, 1);
  } finally { host.dispose(); platform.dispose(); }
}));

test("formal core mount rejects a missing strategy port before acquiring document resources", () => withTestDocument(async ({ document }) => {
  const source = sourceFixture(), { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
  const core = createCoreScorePlugin({ score: source.read }), component = core.ui.components[0];
  try {
    assert.throws(() => component.mount(document.createElement("div"), { onDispose() {}, execute() {} }),
      /正式登记的记谱策略目录/);
    assert.equal(source.listeners(), 0);
    assert.throws(() => component.mount(document.createElement("div"), {
      onDispose() {}, execute() {}, notationInteractions: { hasKind: () => false },
    }), /Notation interaction unavailable: staff/);
    assert.equal(source.listeners(), 0);
  } finally { source.dispose(); }
}));

test("shared interaction sources have no reverse dependency on applications, UI or the plugin platform", async () => {
  const packageRoot = new URL("../../../shared/notation/", import.meta.url);
  const folder = new URL("interaction/", packageRoot);
  const entries = (await readdir(folder)).filter(name => name.endsWith(".ts"));
  assert.ok(entries.includes("staff-interaction-contribution.ts") && entries.includes("interaction-binding.ts"));
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert.ok(url.href.startsWith(packageRoot.href), `reverse dependency: ${url.href}`);
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      assert.ok(match[1].startsWith("."), `non-shared dependency in ${url.href}: ${match[1]}`);
      await visit(new URL(match[1], url));
    }
  }
  for (const entry of entries) await visit(new URL(entry, folder));
});

test("actual core package registers captured numeric Tab alongside staff without changing the existing staff view", () => withTestDocument(async () => {
  const source = sourceFixture(), { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
  const { platform, registry, host } = setup();
  const core = createCoreScorePlugin({ score: source.read });
  platform.register(core); platform.start();
  try {
    assert.deepEqual(core.interactions.map(item => item.id), ["notation.staff.interaction", "notation.tablature.interaction"]);
    const mounted = host.ensure("notation.core.view", "stage");
    assert.ok(mounted); assert.equal(source.read.snapshot().kind, "staff");
    assert.equal(registry.list().filter(item => item.role === "view").length, 1);
    const directory = platform.interactions();
    const context = { notationKind: "tablature", focusScope: "score", target: "event",
      capabilities: ["compose", "update", "navigate"], composing: false,
      eventId: "note-event", stringNumber: 6, stringCount: 6, fretCount: 24, capoFret: 0,
      currentPosition: null, composition: { kind: "idle" } };
    const signal = key => ({ kind: "key-press", key, modifiers: [], repeat: false });
    for (const digit of ["1", "2"]) {
      const result = directory.translate("tablature", signal(digit), context);
      assert.equal(result.kind, "compose"); context.composition = { kind: "composing",
        ...directory.startComposition("tablature", result.draft) };
    }
    assert.deepEqual(directory.translate("tablature", signal("Enter"), context), {
      kind: "intent", intent: { kind: "update-event", eventId: "note-event",
        properties: { kind: "fretted-position", position: { stringNumber: 6, fret: 12 } } },
    });
    host.dispose(); platform.dispose();
    assert.equal(directory.translate("tablature", signal("1"), context), null);
    assert.equal(source.listeners(), 0);
  } finally { host.dispose(); platform.dispose(); source.dispose(); }
}));
