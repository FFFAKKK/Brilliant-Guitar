import assert from "node:assert/strict";
import test from "node:test";
import { createScopedUiComponentContext, UiComponentPermissionError } from "../src/ui/scoped-component-context.ts";
import type { UiComponentContext, UiComponentDefinition } from "../src/ui/plugin-contract.ts";

const definition: UiComponentDefinition = {
  id: "test.tool", version: "1", kind: "tool", domain: "test.tool", slots: ["left"],
  presentation: { allowed: ["panel"], default: "panel" }, capabilities: {},
  permissions: { reads: ["input.state"], commands: ["score.edit"] },
  mount: () => ({ update() {}, dispose() {} }),
};

test("plugin contexts reveal only declared projections and reject undeclared commands", async () => {
  const dispatched: string[] = [], issues: string[] = [];
  const context = { componentId: definition.id, session: { documentId: "hidden" },
    selection: { eventId: "hidden", count: 1 }, input: { enabled: true, durationBase: 8, durationDots: 1 },
    layout: { slot: "left", presentation: "panel", size: { width: 200, height: 300 } },
    commands: { dispatch: async (command: { type: string }) => { dispatched.push(command.type); } } } as unknown as UiComponentContext;
  const scoped = createScopedUiComponentContext(definition, context, (issue) => issues.push(issue.code));
  assert.equal(scoped.session, null);
  assert.deepEqual(scoped.selection, { count: 0 });
  assert.deepEqual(scoped.input, context.input);
  await scoped.commands.dispatch({ type: "score.edit" });
  await assert.rejects(scoped.commands.dispatch({ type: "file.save" }), UiComponentPermissionError);
  assert.deepEqual(dispatched, ["score.edit"]);
  assert.deepEqual(issues, ["component.command-permission-denied"]);
});
