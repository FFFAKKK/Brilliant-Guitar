import assert from "node:assert/strict";
import test from "node:test";
import { captureLayoutReadPorts, WORKSPACE_COMMANDS, SIDEBAR_COMMANDS } from "../src/contracts/workspace-layout.js";
import { WORKSPACE_COMMANDS as hostCommands } from "../src/host/workspace-commands.js";
import { SIDEBAR_COMMANDS as hostSidebarCommands } from "../src/host/sidebar-commands.js";
import { createWorkspaceLayoutPlugin } from "../src/features/workspace-layout-plugin.js";

test("public command symbols are the handler symbols, not a second command vocabulary", () => {
  assert.equal(WORKSPACE_COMMANDS, hostCommands); assert.equal(SIDEBAR_COMMANDS, hostSidebarCommands);
});
test("layout is required, optional null ports are empty and shape failures reject at injection", () => {
  const layout = { snapshot: () => Object.freeze({}), subscribe: () => () => {} };
  for (const missing of [undefined, null, {}, { snapshot() {} }]) assert.throws(() => captureLayoutReadPorts({ layout: missing }), TypeError);
  const ports = captureLayoutReadPorts({ layout, contents: null, actions: undefined, view: null });
  assert.equal(ports.contents, null); assert.equal(ports.actions, null); assert.equal(ports.view, null);
  for (const key of ["contents", "actions", "view"]) assert.throws(() => captureLayoutReadPorts({ layout, [key]: false }), TypeError);
  const plugin = createWorkspaceLayoutPlugin(layout, null, null, { view: null });
  assert.equal(plugin.components[0].permissions.commands.includes(WORKSPACE_COMMANDS.zoom), false);
});
test("only read methods escape; unsubscribe is idempotent and late queued notices are ignored", () => {
  const snapshot = Object.freeze({ leftOpen: false, leftWidth: 0 }), listeners = new Set();
  let stopCalls = 0, last;
  const source = { snapshot: () => snapshot, write() { throw new Error("must not escape"); }, subscribe(listener) {
    last = listener; listeners.add(listener); return () => { stopCalls++; listeners.delete(listener); };
  } };
  const port = captureLayoutReadPorts({ layout: source }).layout;
  assert.deepEqual(Object.keys(port).sort(), ["snapshot", "subscribe"]); assert.equal(port.snapshot(), snapshot);
  let delivered = 0; const stop = port.subscribe(value => { assert.equal(value, snapshot); delivered++; });
  last(snapshot); assert.equal(delivered, 1); stop(); stop(); last(snapshot);
  assert.equal(delivered, 1); assert.equal(stopCalls, 1); assert.equal(listeners.size, 0);
  assert.throws(() => port.subscribe(null), TypeError);
});
