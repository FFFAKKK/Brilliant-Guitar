import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFunction, createContext } from "node:vm";
import test from "node:test";
import { isScoreEditRequest } from "../../../../apps/workbench/src/contracts/note-input.ts";
import { isScoreSessionRead } from "../../../../apps/workbench/src/contracts/score-session.ts";
import { ScoreEditClient } from "../../../../apps/workbench/src/services/score-edit-port.ts";
import { TauriWorkbenchHostBridge } from "../../../../apps/workbench/src/services/workbench-host-bridge.ts";
import { resolveWorkbenchWorkspaceId } from "../../../../apps/workbench/src/services/workbench-client.ts";
import { AGENT_ASSISTANT_PLUGIN_ID } from "../../../../apps/workbench/src/plugins/agent-plugin-host-contract.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const require = createRequire(resolve(root, "apps/workbench/package.json"));
const { rolldown } = await import(pathToFileURL(require.resolve("rolldown")).href);
assert.ok(process.env.AUDIT_STAGE4_OUTPUT, "Run stage4/run.mjs to generate fresh Rust evidence first");
const load = (name) => JSON.parse(readFileSync(resolve(process.env.AUDIT_STAGE4_OUTPUT, name), "utf8"));
const desktop = load("desktop-projection.json");
const reception = load("desktop-edit-results.json");
const fixture = JSON.parse(readFileSync(new URL("./edit-cases.json", import.meta.url), "utf8"));

for (const [index, sample] of fixture.cases.entries()) {
  test(`shared edit ${sample.action.kind}: frontend sends, desktop accepts=${sample.desktopAccepts}`, async () => {
    const calls = [];
    const bridge = new TauriWorkbenchHostBridge(async (command, args) => {
      calls.push({ command, args });
      // Reply injection isolates dispatch; this is not native IPC or a successful edit.
      return desktop.session;
    });
    const client = new ScoreEditClient(bridge, fixture.workspaceId);
    const request = {
      requestId: fixture.requestId, documentId: fixture.documentId,
      expectedVersion: fixture.expectedVersion, action: sample.action,
    };
    assert.equal(isScoreEditRequest(request), true);
    await client.edit(request);
    assert.deepEqual(calls, [{
      command: "workbench_edit_v1", args: { request: reception[index].request },
    }]);
    assert.equal(reception[index].accepted, sample.desktopAccepts);
    if (!sample.desktopAccepts) assert.match(reception[index].error, /unknown variant/);
  });
}

test("frontend accepts actual Rust session without metadata although document authors survive", () => {
  assert.equal(isScoreSessionRead(desktop.session), true);
  assert.equal(Object.hasOwn(desktop.session, "metadata"), false);
  assert.deepEqual(desktop.metadata.authors, ["Audit author"]);
  assert.deepEqual(desktop.exportedMetadata.authors, ["Audit author"]);
});

const originalId = fixture.workspaceId;
const newId = "33333333-3333-4333-8333-333333333333";
for (const scenario of [
  { name: "desktop healthy storage", native: true, failure: "none", expected: originalId },
  { name: "desktop repeated write fails", native: true, failure: "write", expected: newId },
  { name: "desktop legacy read fails", native: true, failure: "legacy", expected: newId },
  { name: "browser repeated write fails", native: false, failure: "write", expected: newId },
]) {
  test(`workspace identity: ${scenario.name}`, () => {
    let generated = 0;
    const session = {
      getItem() {
        if (scenario.failure === "legacy") throw new Error("synthetic legacy read failure");
        return originalId;
      },
      setItem() {
        if (scenario.failure === "write") throw new Error("synthetic write failure");
      },
    };
    const persistent = {
      getItem: () => originalId,
      setItem: session.setItem,
    };
    const resolved = resolveWorkbenchWorkspaceId(scenario.native, session, persistent, () => {
      generated += 1;
      return newId;
    });
    assert.equal(resolved, scenario.expected);
    assert.equal(generated, scenario.expected === newId ? 1 : 0);
  });
}

async function pluginEntry(desktopMode, values) {
  const calls = { reads: 0, writes: 0, ipc: [] };
  const bundle = await rolldown({
    cwd: root, input: "apps/workbench/src/ui/workbench-plugins.ts", platform: "node",
    external: (id) => /^(react|react-dom)(\/|$)/.test(id),
    transform: {
      define: {
        "import.meta.env.VITE_BRILLIANT_DESKTOP": JSON.stringify(desktopMode ? "1" : "0"),
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      jsx: "react-jsx",
    },
  });
  let generated;
  try { generated = await bundle.generate({ format: "cjs", codeSplitting: false }); }
  finally { await bundle.close(); }
  const chunks = generated.output.filter((entry) => entry.type === "chunk");
  assert.equal(chunks.length, 1);
  const scope = createContext({
    isTauri: desktopMode, console, queueMicrotask,
    localStorage: {
      getItem(key) { calls.reads += 1; return values.get(key) ?? null; },
      setItem(key, value) { calls.writes += 1; values.set(key, value); },
    },
    window: { __TAURI_INTERNALS__: { invoke: async (command, args) => {
      calls.ipc.push({ command, args });
      throw new Error("No real IPC in this audit");
    } } },
  });
  const module = { exports: {} };
  // CommonJS scope prevents bundled isTauri declarations overwriting the injected global.
  compileFunction(chunks[0].code, ["require", "module", "exports"], { parsingContext: scope })(
    require, module, module.exports,
  );
  assert.equal(typeof scope.isTauri, "boolean");
  await module.exports.initializeWorkbenchPluginPreview();
  return { entry: module.exports, calls };
}

for (const desktopMode of [true, false]) {
  test(`real ${desktopMode ? "desktop" : "browser"} plugin entry: enable and fresh startup`, async () => {
    const values = new Map();
    const first = await pluginEntry(desktopMode, values);
    const agent = () => first.entry.workbenchPluginPlatform.list()
      .find((plugin) => plugin.manifest.id === AGENT_ASSISTANT_PLUGIN_ID);
    assert.ok(agent());
    assert.equal(agent().active, false);
    await first.entry.setWorkbenchUserPluginEnabled(AGENT_ASSISTANT_PLUGIN_ID, true);
    assert.equal(agent().active, false);
    assert.equal(agent().nextLaunchActive, !desktopMode);
    assert.equal(agent().restartRequired, !desktopMode);
    assert.equal(first.calls.reads, desktopMode ? 0 : 2);
    assert.equal(first.calls.writes, desktopMode ? 0 : 3);
    const diagnostics = first.entry.workbenchPluginDiagnostics.list();
    if (desktopMode) {
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, "UI-PLG-012");
      assert.match(diagnostics[0].detail, /Plugin activation storage is not connected/);
    } else {
      assert.equal(diagnostics.length, 0);
    }
    assert.deepEqual(first.calls.ipc, []);
    const restarted = await pluginEntry(desktopMode, values);
    const afterRestart = restarted.entry.workbenchPluginPlatform.list()
      .find((plugin) => plugin.manifest.id === AGENT_ASSISTANT_PLUGIN_ID);
    assert.equal(afterRestart.active, !desktopMode);
    assert.equal(afterRestart.nextLaunchActive, !desktopMode);
    assert.equal(afterRestart.restartRequired, false);
    assert.deepEqual(restarted.calls.ipc, []);
  });
}
