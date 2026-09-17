import assert from "node:assert/strict";
import test from "node:test";
import { readEditingPreferences } from "../src/ui/use-editing-preferences.ts";

function storage(values: Readonly<Record<string, string>>) {
  return { getItem: (key: string) => values[key] ?? null };
}

test("editing preferences default to visible warnings and rhythm-preserving deletion", () => {
  assert.deepEqual(readEditingPreferences(storage({})), { ruleWarningsVisible: true, deleteTimePolicy: "preserve" });
});

test("editing preferences restore explicit warning visibility and collapse deletion", () => {
  assert.deepEqual(readEditingPreferences(storage({
    "brilliant.workbench.rule-warnings-visible.v1": "false",
    "brilliant.workbench.delete-time-policy.v1": "collapse",
  })), { ruleWarningsVisible: false, deleteTimePolicy: "collapse" });
});
