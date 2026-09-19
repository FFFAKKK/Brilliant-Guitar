import assert from "node:assert/strict";
import test from "node:test";
import type { EditIntent } from "../src/input/edit-intent.ts";
import type { InputContext } from "../src/input/input-context.ts";
import type { NotationInteractionContribution } from "../src/input/notation-interaction-registry.ts";
import { NotationInteractionRegistry } from "../src/input/notation-interaction-registry.ts";
import type { KeyPressSignal } from "../src/input/input-signal.ts";

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
