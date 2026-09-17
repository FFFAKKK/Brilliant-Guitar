import assert from "node:assert/strict";
import test from "node:test";
import { UiComponentRegistry } from "../src/ui/component-registry.ts";
import type { UiComponentDefinition } from "../src/ui/plugin-contract.ts";

const component = (id: string): UiComponentDefinition => ({
  id, version: "1.0", kind: "tool", domain: "test.utility", slots: ["bottom"],
  presentation: { allowed: ["panel"], default: "panel" },
  capabilities: { movable: true },
  permissions: { projections: [], commands: [] },
});

test("registry stores validated component definitions in explicit registration order", () => {
  const registry = new UiComponentRegistry();
  registry.register(component("first"));
  registry.register({ ...component("status"), kind: "status", domain: "document.status" });
  assert.deepEqual(registry.list().map((item) => [item.id, item.kind, item.domain]), [
    ["first", "tool", "test.utility"],
    ["status", "status", "document.status"],
  ]);
  assert.equal(registry.unregister("first"), true);
  assert.equal(registry.get("first"), undefined);
});

test("registry rejects duplicate IDs and invalid slot or presentation contracts", () => {
  const registry = new UiComponentRegistry();
  registry.register(component("example"));
  assert.throws(() => registry.register(component("example")), /already registered/);
  assert.throws(() => registry.register({ ...component("bad-slot"), slots: ["unknown" as never] }), /Invalid/);
  assert.throws(() => registry.register({ ...component("bad-presentation"),
    presentation: { allowed: ["panel"], default: "dialog" as never },
  }), /Invalid/);
  assert.throws(() => registry.register({ ...component("bad-domain"), domain: "Editing History" }), /Invalid/);
  registry.register({ ...component("inspector"), kind: "inspector", domain: "notation.inspection" });
  assert.equal(registry.get("inspector")?.kind, "inspector");
});

test("component definitions remain visual-neutral layout metadata", () => {
  const registry = new UiComponentRegistry();
  registry.register({ ...component("projection-tool"), permissions: {
    projections: ["score.selection"], commands: ["score.edit"],
  } });
  assert.deepEqual(registry.get("projection-tool")?.permissions,
    { projections: ["score.selection"], commands: ["score.edit"] });
  assert.equal("mount" in registry.get("projection-tool")!, false);
});
