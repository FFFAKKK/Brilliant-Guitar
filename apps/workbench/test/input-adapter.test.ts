import assert from "node:assert/strict";
import test from "node:test";
import { staffInputAdapter } from "../src/editor/staff-input-adapter.ts";
import type { InputContext } from "../src/input/input-context.ts";
import { keyPressSignal } from "../src/input/input-signal.ts";
import type { InputAdapter } from "../src/input/input-adapter.ts";
import type { EditIntent } from "../src/input/edit-intent.ts";

const staffContext = {
  focusScope: "score",
  target: "caret",
  notationKind: "staff",
  capabilities: ["compose", "insert"],
  composing: false,
  composition: { kind: "idle" },
  duration: { base: 4, dots: 0 },
  rest: false,
  resolveAlter: () => 0 as -1 | 0 | 1,
} as const;

test("keyboard signals pass through the staff adapter into one shared insert intent", () => {
  const first = staffInputAdapter.translate(keyPressSignal({
    key: "C", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false,
  }), staffContext);
  assert.equal(first?.kind, "compose");
  if (!first || first.kind !== "compose") throw new Error("Expected a pitch draft");

  const completing = { ...staffContext, composing: true,
    composition: { kind: "composing" as const, methodId: staffInputAdapter.compositionMethodId, draft: first.draft } };
  const second = staffInputAdapter.translate(keyPressSignal({
    key: "5", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false,
  }), completing);
  assert.equal(second?.kind, "intent");
  if (!second || second.kind !== "intent" || second.intent.kind !== "insert-event") throw new Error("Expected insert intent");
  assert.deepEqual(second.intent.event.content, { kind: "note", pitch: { step: "C", octave: 5, alter: 0 } });
});

test("a virtual tablature adapter can reuse the shared contract without changing ScoreEditIntent", () => {
  type TablatureIntent = Extract<EditIntent, { readonly kind: "insert-event" }>;
  const tablature: InputAdapter<InputContext, never, TablatureIntent> = {
    id: "notation.tablature.test",
    canHandle(signal, context) { return context.notationKind === "tablature" && signal.kind === "external-note"; },
    translate(signal) {
      if (signal.kind !== "external-note") return { kind: "ignored" };
      return { kind: "intent", intent: { kind: "insert-event", event: {
      duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: {
        ...(signal.pitch as { readonly step: "E"; readonly octave: 4 }), alter: 0,
      } },
      } } };
    },
  };
  const output = tablature.translate({ kind: "external-note", pitch: { step: "E", octave: 4 } }, {
    focusScope: "score", target: "caret", notationKind: "tablature", capabilities: ["insert"], composing: false,
  });
  assert.equal(output?.kind, "intent");
  if (!output || output.kind !== "intent") throw new Error("Expected a shared edit intent");
  assert.equal(output.intent.kind, "insert-event");
  assert.deepEqual(output.intent.event.content, { kind: "note", pitch: { step: "E", octave: 4, alter: 0 } });
});
