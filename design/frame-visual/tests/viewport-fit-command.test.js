import assert from "node:assert/strict";
import test from "node:test";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";

test("fit modes use the original router and preserve the legacy empty payload", () => {
  const router = createCommandRouter(), calls = [];
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout" });
  const release = bindWorkspaceCommands({ router, store,
    stage: { fit(mode) { calls.push(mode); return { ok: true }; } } });
  try {
    assert.equal(router.execute(C.fit).ok, true);
    assert.equal(router.execute(C.fit, { mode: "width" }).ok, true);
    assert.equal(router.execute(C.fit, { mode: "page" }).ok, true);
    assert.deepEqual(calls, [undefined, "width", "page"]);
    for (const payload of [null, [], { mode: "unknown" }, { mode: "width", extra: true }]) {
      assert.equal(router.execute(C.fit, payload).code, "workspace.invalid-payload");
    }
    assert.equal(calls.length, 3);
  } finally { release(); }
  assert.equal(router.execute(C.fit).code, "command.missing");
});
