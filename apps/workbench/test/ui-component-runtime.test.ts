import assert from "node:assert/strict";
import test from "node:test";
import { UiComponentRuntime } from "../src/ui/component-runtime.ts";
import type { UiComponentContext, UiComponentDefinition } from "../src/ui/plugin-contract.ts";

const context = { componentId: "runtime-test" } as UiComponentContext;

test("the runtime mounts, updates and disposes component instances without owning their visuals", () => {
  const calls: string[] = [];
  const definition: UiComponentDefinition = {
    id: "runtime-test",
    version: "1.0",
    kind: "tool",
    domain: "test.runtime",
    slots: ["bottom"],
    presentation: { allowed: ["panel"], default: "panel" },
    capabilities: { movable: true },
    permissions: { reads: [], commands: [] },
    mount: () => ({
      update: (next) => calls.push(`update:${next.componentId}`),
      dispose: () => calls.push("dispose"),
    }),
  };
  const runtime = new UiComponentRuntime();
  runtime.mount(definition, context);
  assert.equal(runtime.has(definition.id), true);
  assert.throws(() => runtime.mount(definition, context), /already mounted/);
  assert.equal(runtime.update(definition.id, context), true);
  assert.equal(runtime.unmount(definition.id), true);
  assert.equal(runtime.unmount(definition.id), false);
  assert.deepEqual(calls, ["update:runtime-test", "dispose"]);
});

test("disposing the runtime releases every remaining component exactly once", () => {
  let disposed = 0;
  const definition = (id: string): UiComponentDefinition => ({
    id, version: "1.0", kind: "tool", domain: "test.runtime", slots: ["bottom"],
    presentation: { allowed: ["panel"], default: "panel" },
    capabilities: {}, permissions: { reads: [], commands: [] },
    mount: () => ({ update() {}, dispose() { disposed += 1; } }),
  });
  const runtime = new UiComponentRuntime();
  runtime.mount(definition("one"), context);
  runtime.mount(definition("two"), context);
  runtime.dispose();
  runtime.dispose();
  assert.equal(disposed, 2);
});

test("lifecycle failures are isolated and reported without taking down sibling components", () => {
  const issues: string[] = [];
  const definition: UiComponentDefinition = {
    id: "broken", version: "1", kind: "tool", domain: "test.runtime", slots: ["bottom"],
    presentation: { allowed: ["panel"], default: "panel" }, capabilities: {}, permissions: { reads: [], commands: [] },
    mount: () => { throw new Error("broken mount"); },
  };
  const runtime = new UiComponentRuntime((issue) => issues.push(issue.code));
  runtime.mount(definition, context);
  assert.equal(runtime.has("broken"), true);
  assert.equal(runtime.update("broken", context), true);
  assert.equal(runtime.unmount("broken"), true);
  assert.deepEqual(issues, ["component.mount-failed"]);
});
