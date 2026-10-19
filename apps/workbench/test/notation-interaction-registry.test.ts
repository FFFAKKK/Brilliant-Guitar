import assert from "node:assert/strict";
import test from "node:test";
import type { EditIntent } from "../src/input/edit-intent.ts";
import type { InputContext } from "../src/input/input-context.ts";
import type { NotationInteractionContribution } from "../src/input/notation-interaction-registry.ts";
import { NotationInteractionRegistry } from "../src/input/notation-interaction-registry.ts";
import type { KeyPressSignal } from "../src/input/input-signal.ts";
import { NotationInteractionRegistry as SharedRegistry } from "../../../shared/notation/interaction/notation-interaction-registry.ts";
import { bindNotationInteraction, scopeNotationInteractions } from "../../../shared/notation/interaction/interaction-binding.ts";
import { staffInteractionContribution } from "../../../shared/notation/interaction/staff-interaction-contribution.ts";
import { staffInteractionContribution as legacyStaff } from "../src/editor/staff-interaction-contribution.ts";
import { staffInputAdapter } from "../../../shared/notation/interaction/staff-input-adapter.ts";
import { staffInputAdapter as legacyAdapter } from "../src/editor/staff-input-adapter.ts";
import type { StaffInputContext } from "../../../shared/notation/interaction/staff-input-adapter.ts";
import type { PitchDraft } from "../../../shared/notation/interaction/pitch-entry.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { createMountContributionHost } from "../src/plugins/plugin-mount-host.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

const signal: KeyPressSignal = { kind: "key-press", key: "C", modifiers: [], repeat: false };
const context: InputContext = { focusScope: "score", target: "caret", notationKind: "staff",
  capabilities: ["insert"], composing: false };

function contribution(id = "notation.staff.test", notationKind: "staff" | "tablature" = "staff"):
  NotationInteractionContribution<InputContext, string, EditIntent, { readonly marker: string }, string,
    { readonly marker: string }, string> {
  return {
    id,
    notationKind,
    input: {
      id: `${id}.input`,
      canHandle: (candidate, candidateContext) => candidate.kind === "key-press"
        && candidateContext.notationKind === notationKind,
      translate: () => ({ kind: "intent", intent: { kind: "delete-event", eventId: "event-1" } }),
    },
    readDraft: (composition) => typeof composition === "string" ? composition : null,
    startComposition: (draft) => ({ methodId: `${id}.composition`, draft }),
    navigate: (candidate, candidateContext) => `navigate:${candidate.key}:${candidateContext.marker}`,
    edit: (candidate, candidateContext) => `edit:${candidate.key}:${candidateContext.marker}`,
  };
}

test("registry dispatches input, navigation and editing through the notation owner", () => {
  const registry = new NotationInteractionRegistry();
  registry.register(contribution());

  assert.deepEqual(registry.list(), ["notation.staff.test"]);
  assert.equal(registry.hasId("notation.staff.test"), true);
  assert.equal(registry.hasKind("staff"), true);
  assert.deepEqual(registry.translate("staff", signal, context), {
    kind: "intent", intent: { kind: "delete-event", eventId: "event-1" },
  });
  assert.equal(registry.readDraft("staff", "C"), "C");
  assert.deepEqual(registry.startComposition("staff", "D"), {
    methodId: "notation.staff.test.composition", draft: "D",
  });
  assert.equal(registry.navigate("staff", signal, { marker: "nav" }), "navigate:C:nav");
  assert.equal(registry.edit("staff", signal, { marker: "edit" }), "edit:C:edit");
});

test("registry rejects duplicate contribution IDs and notation ownership", () => {
  const byId = new NotationInteractionRegistry();
  byId.register(contribution());
  assert.throws(() => byId.register(contribution()), /Duplicate notation interaction/);

  const byKind = new NotationInteractionRegistry();
  byKind.register(contribution("notation.staff.first"));
  assert.throws(() => byKind.register(contribution("notation.staff.second")), /already registered/);
});

test("registry leaves unsupported notation input untouched", () => {
  const registry = new NotationInteractionRegistry();
  registry.register(contribution());
  const ignored = { ...context, notationKind: "tablature" as const };
  assert.equal(registry.translate("staff", signal, ignored), null);
  assert.equal(registry.navigate("tablature", signal, { marker: "missing" }), null);
  assert.equal(registry.edit("tablature", signal, { marker: "missing" }), null);
});

test("legacy entry points expose the exact shared implementations, without a second registry class", () => {
  assert.equal(NotationInteractionRegistry, SharedRegistry);
  assert.equal(legacyStaff, staffInteractionContribution);
  assert.equal(legacyAdapter, staffInputAdapter);
});

test("real public SDK capture and formal installation preserve the staff grammar without private adapter methods", () => {
  const packageValue = definePlugin({ id: "notation.core", name: "核心谱面", version: "0.1.0", apiVersion: "4.0",
    interactions: [staffInteractionContribution] });
  assert.equal(Object.hasOwn(packageValue.interactions[0]!.input, "draft"), false,
    "the public capture intentionally retains only the input contract");
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: host => createMountContributionHost(host, () => () => {}) });
  platform.register(packageValue); platform.start();
  const directory = scopeNotationInteractions(platform.interactions(), packageValue.interactions);
  const binding = bindNotationInteraction(directory, "staff");
  const input: StaffInputContext = { ...context, composition: { kind: "idle" },
    duration: { base: 4, dots: 0 }, rest: false, resolveAlter: () => 1 };
  try {
    assert.equal(platform.list()[0]?.status, "active");
    const output = binding.translate<StaffInputContext, NonNullable<PitchDraft>>(signal, input);
    assert.equal(output?.kind, "compose");
    assert.ok(output?.kind === "compose");
    assert.equal(output.methodId, "notation.staff.pitch"); assert.equal(output.draft, "C");
    const composition = binding.startComposition(output.draft);
    assert.ok(composition);
    assert.deepEqual(binding.translate({ ...signal, key: "4" }, { ...input, composition: { kind: "composing", ...composition } }), {
      kind: "intent", intent: { kind: "insert-event", event: {
        duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 1 } },
      } },
    });
    assert.deepEqual(binding.translate({ ...signal, key: "R" }, input), {
      kind: "intent", intent: { kind: "insert-event", event: { duration: input.duration, content: { kind: "rest" } } },
    });
  } finally { platform.dispose(); }
  assert.equal(directory.hasKind("staff"), false);
  assert.deepEqual(directory.list(), []);
  assert.equal(binding.translate(signal, input), null);
  assert.equal(binding.readDraft("C"), null);
  assert.equal(binding.startComposition("C"), null);
  assert.equal(binding.navigate(signal, {}), null);
  assert.equal(binding.edit(signal, {}), null);
});

test("view-local staff and tablature bindings dispatch independently through one directory", () => {
  // A synthetic tablature contribution proves dispatch only, not actual TAB editing.
  const registry = new SharedRegistry();
  registry.register(contribution());
  registry.register(contribution("notation.tab.test", "tablature"));
  const scoped = scopeNotationInteractions(registry, [
    { id: "notation.staff.test", notationKind: "staff" }, { id: "notation.tab.test", notationKind: "tablature" },
  ]);
  const staff = bindNotationInteraction(scoped, "staff"), tab = bindNotationInteraction(scoped, "tablature");
  assert.deepEqual(staff.startComposition("C"), { methodId: "notation.staff.test.composition", draft: "C" });
  assert.deepEqual(tab.startComposition("12"), { methodId: "notation.tab.test.composition", draft: "12" });
  assert.equal(staff.navigate(signal, { marker: "staff-view" }), "navigate:C:staff-view");
  assert.equal(tab.edit(signal, { marker: "tab-view" }), "edit:C:tab-view");
  assert.equal(staff.translate(signal, { ...context, notationKind: "tablature" }), null);
  assert.equal(tab.translate(signal, context), null);
  assert.ok(tab.translate(signal, { ...context, notationKind: "tablature" }));
  assert.ok(staff.translate(signal, context), "using another view never changes this view's mode");
});

test("scoped reads cannot borrow another package's kind, and missing declarations fail explicitly", () => {
  const registry = new SharedRegistry();
  registry.register(contribution());
  registry.register(contribution("notation.tab.test", "tablature"));
  const scoped = scopeNotationInteractions(registry, [{ id: "notation.staff.test", notationKind: "staff" }]);
  assert.deepEqual(scoped.list(), ["notation.staff.test"]);
  assert.equal(Object.hasOwn(scoped, "register"), false); assert.equal(Object.hasOwn(scoped, "clear"), false);
  assert.equal(scoped.hasId("notation.tab.test"), false); assert.equal(scoped.hasKind("tablature"), false);
  assert.equal(scoped.translate("tablature", signal, { ...context, notationKind: "tablature" }), null);
  assert.equal(scoped.readDraft("tablature", "12"), null);
  assert.equal(scoped.startComposition("tablature", "12"), null);
  assert.equal(scoped.navigate("tablature", signal, { marker: "denied" }), null);
  assert.equal(scoped.edit("tablature", signal, { marker: "denied" }), null);
  assert.throws(() => bindNotationInteraction(scoped, "tablature"), /Notation interaction unavailable/);
  const absent = scopeNotationInteractions(registry, [{ id: "notation.staff.missing", notationKind: "staff" }]);
  assert.equal(absent.hasKind("staff"), false);
  assert.throws(() => bindNotationInteraction(absent, "staff"), /Notation interaction unavailable/);
});
