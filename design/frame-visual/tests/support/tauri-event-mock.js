import assert from "node:assert/strict";

// Boundary used by the actual bundled Tauri SDK, not a replacement close binder.
// Match event.js: transformCallback -> listen -> unregisterListener -> unlisten.
export function installTauriEventMock(window, invoke) {
  const previous = new Map(["__TAURI_INTERNALS__", "__TAURI_EVENT_PLUGIN_INTERNALS__"]
    .map(key => [key, Object.getOwnPropertyDescriptor(window, key)]));
  const callbacks = new Map(), listeners = new Map(), eventCalls = [];
  let nextId = 0;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" } },
    transformCallback(callback, once = false) {
      const id = ++nextId;
      callbacks.set(id, data => {
        if (once) callbacks.delete(id);
        return callback(data);
      });
      return id;
    },
    async invoke(command, args) {
      if (!command.startsWith("plugin:event|")) return invoke(command, args);
      eventCalls.push({ command, args });
      assert.equal(args.event, "tauri://close-requested");
      if (command === "plugin:event|listen") {
        assert.deepEqual(args.target, { kind: "Window", label: "main" });
        assert.equal(typeof callbacks.get(args.handler), "function");
        listeners.set(args.handler, args.event);
        return args.handler;
      }
      assert.equal(command, "plugin:event|unlisten");
      assert.equal(callbacks.has(args.eventId), false, "SDK unregisters the callback before host unlisten");
      assert.equal(listeners.get(args.eventId), args.event);
      listeners.delete(args.eventId);
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(event, eventId) {
      assert.equal(listeners.get(eventId), event);
      callbacks.delete(eventId);
    },
  };
  return {
    callbacks, listeners, eventCalls,
    dispose() {
      assert.equal(listeners.size, 0, "all native close listeners must be released");
      assert.equal(callbacks.size, 0, "all native close callbacks must be released");
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else delete window[key];
      }
    },
  };
}
