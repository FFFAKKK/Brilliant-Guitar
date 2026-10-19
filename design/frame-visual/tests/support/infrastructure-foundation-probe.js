import assert from "node:assert/strict";
import { createComponentHost } from "../../src/runtime/component-host.js";
import { createComponentRegistry } from "../../src/runtime/component-registry.js";
import { createCommandRouter } from "../../src/runtime/command-router.js";
import { createNotices } from "../../src/runtime/notices.js";
import { withTestDocument } from "./dom-test-environment.js";
import { createStaffProjectionPort } from "../../src/score/staff-read-port.js";
import { createDocumentStaffProjection } from "../../src/score/document-staff-projection.js";
import { createWorkspaceRuntime } from "../../src/host/workspace-runtime.js";
import { createBackupFormalPlatform, prepareBackupPlugin } from "../../src/host/formal-plugin-assembly.js";
import { createWorkspaceState } from "../../src/layout/workspace-state.js";
import { captureLayoutReadPorts } from "../../src/contracts/workspace-layout.js";

const mode = process.argv[2];
const rejectedObserver = async () => { throw new Error("async observer"); };
if (mode === "async-layout-port") {
  for (const key of ["layout", "contents", "actions", "view"]) {
    let healthy = 0, failures = 0;
    const owner = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout",
      onObserverError: error => { assert.match(error.message, /async observer/); failures++; } });
    const port = captureLayoutReadPorts({ layout: owner.read, [key]: owner.read })[key];
    const stopFault = port.subscribe(rejectedObserver);
    const stopHealthy = port.subscribe(() => { healthy++; });
    assert.equal(owner.toggleRegion("left").ok, true);
    assert.equal(port.snapshot().leftOpen, true);
    assert.equal(healthy, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(failures, 1);
    stopFault(); stopFault(); stopHealthy();
    assert.equal(owner.toggleRegion("left").ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(healthy, 1); assert.equal(failures, 1);
  }
} else if (mode === "async-staff" || mode === "async-projection") {
  let healthy = 0;
  const owner = mode === "async-staff" ? createStaffProjectionPort() : createDocumentStaffProjection({ readSession: async () => null });
  owner.read.subscribe(rejectedObserver); owner.read.subscribe(() => { healthy++; });
  const result = mode === "async-staff" ? owner.publish(null) : await owner.refresh();
  assert.equal(result.ok, true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(healthy, 1); owner.dispose();
} else if (mode === "async-workspace") {
  await withTestDocument(async () => {
    const root = document.createElement("main"); document.body.append(root); let healthy = 0;
    const runtime = createWorkspaceRuntime({ root,
      pluginWiring: { create: createBackupFormalPlatform, prepare: prepareBackupPlugin } });
    runtime.workspace.subscribe(rejectedObserver); runtime.workspace.subscribe(() => { healthy++; });
    assert.equal(runtime.execute("frame.workspace.region.toggle", { region: "left" }).ok, true);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(healthy, 1); runtime.dispose();
    assert.equal(root.children.length, 0);
  });
} else if (mode === "async-observer-error") {
  let healthy = 0, failures = 0;
  const registry = createComponentRegistry({ onObserverError: async () => { failures++; throw new Error("error hook rejected"); } });
  registry.subscribe(rejectedObserver); registry.subscribe(() => { healthy++; });
  const release = registry.register("foundation", { id: "foundation.good", title: "Good", role: "tool", slots: ["left"], mount() {} });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(healthy, 1); assert.equal(failures, 1);
  release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(failures, 2);
} else if (["async-cleanup", "async-variant", "async-visible"].includes(mode)) {
  await withTestDocument(async () => {
    const registry = createComponentRegistry(), notices = createNotices();
    let releases = 0;
    registry.register("foundation", { id: "foundation.lifecycle", title: "Lifecycle", role: "tool", slots: ["left", "right"],
      mount(_element, ctx) {
        ctx.onDispose(() => { releases++; });
        if (mode === "async-cleanup") ctx.onDispose(async () => { throw new Error("async owned cleanup"); });
        return { dispose: mode === "async-cleanup" ? async () => { throw new Error("async instance cleanup"); } : () => {},
          setVariant: mode === "async-variant" ? rejectedObserver : () => {},
          setVisible: mode === "async-visible" ? rejectedObserver : () => {} };
      } });
    const host = createComponentHost({ registry, router: createCommandRouter(), notices });
    host.ensure("foundation.lifecycle", "left");
    if (mode === "async-variant") host.setVariant("foundation.lifecycle", "right");
    if (mode === "async-visible") host.setVisible("foundation.lifecycle", false);
    host.dispose(); host.dispose();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(releases, 1); assert.equal(host.mounted().length, 0);
    assert.equal(notices.state().entries.length, 1);
  });
} else if (mode === "async-notice") {
  const notices = createNotices(); let healthy = 0;
  notices.subscribe(async () => { throw new Error("async notice observer"); });
  notices.subscribe(() => { healthy++; });
  notices.push({ text: "accepted" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(healthy, 1);
} else {
  await withTestDocument(async () => {
    const registry = createComponentRegistry(), router = createCommandRouter(), notices = createNotices();
    let cleanups = 0, badContext, healthyMounts = 0;
    registry.register("foundation", { id: "foundation.bad", title: "Bad", role: "tool", slots: ["left"],
      async mount(element, ctx) {
        badContext = ctx; ctx.onDispose(() => { cleanups++; });
        element.append("unaccepted content");
        throw new Error("async mount rejected");
      } });
    registry.register("foundation", { id: "foundation.good", title: "Good", role: "tool", slots: ["right"],
      mount(element) { healthyMounts++; element.append("healthy"); } });
    const host = createComponentHost({ registry, router, notices });
    const bad = host.ensure("foundation.bad", "left");
    assert.match(bad.textContent, /加载失败/);
    assert.match(notices.state().entries[0].text, /mount 需要同步返回/);
    assert.equal(cleanups, 1);
    assert.equal(badContext.execute("foundation.no-op").code, "component.disposed");
    assert.equal(host.ensure("foundation.good", "right").textContent, "healthy");
    assert.equal(healthyMounts, 1);
    await new Promise(resolve => setImmediate(resolve));
    host.dispose(); host.dispose(); assert.equal(cleanups, 1);
    assert.deepEqual(host.mounted(), []);
  });
}
console.log(JSON.stringify({ mode, healthy: true }));
