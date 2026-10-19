import assert from "node:assert/strict";
import { PluginPlatform } from "../../src/plugins/plugin-platform.ts";
import { definePlugin } from "../../src/plugins/plugin-sdk.ts";
import { PluginSettingsRegistry } from "../../src/plugins/plugin-settings.ts";
import { UiPluginDiagnosticStore, UiPluginHostError } from "../../src/ui/plugin-diagnostic.ts";
import { WorkbenchFeatureRegistry } from "../../src/ui/plugin-manifest.ts";
import { createReadonlyScoreDocumentSession } from "../../src/services/readonly-score-document-session.ts";
import type { ScoreSessionRead } from "../../src/contracts/score-session.ts";
import { readyPlaybackSource } from "../playback-fixture.ts";

const mode = process.argv[2];
let healthyNotifications = 0;
const rejectedObserver = async () => { throw new Error("rejected observer"); };
if (mode === "platform-async" || mode === "hook-async") {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    ...(mode === "hook-async" ? { onDiagnostic: rejectedObserver } : {}) });
  if (mode === "platform-async") {
    platform.subscribe(rejectedObserver);
    platform.subscribe(() => { healthyNotifications++; });
  }
  platform.register(definePlugin({ id: "foundation.probe", name: "Probe", version: "0.1.0",
    ...(mode === "hook-async" ? { hostFeatures: ["foundation.missing"] } : {}) }));
  if (mode === "hook-async") {
    platform.start();
    assert.equal(platform.list()[0]?.status, "failed");
    assert.equal(platform.diagnostics.list().length, 1);
    healthyNotifications++;
  }
} else if (mode === "settings-parser-async") {
  const registry = new PluginSettingsRegistry();
  assert.throws(() => registry.register<unknown>("foundation.probe", { schemaVersion: 1, defaults: 1, parse: rejectedObserver }), /invalid/);
  assert.throws(() => definePlugin({ id: "foundation.probe", name: "Probe", version: "0.1.0",
    settings: { schemaVersion: 1, defaults: 1, parse: rejectedObserver } }), /Invalid plugin settings defaults/);
  healthyNotifications++;
} else if (mode === "settings-async") {
  const registry = new PluginSettingsRegistry();
  registry.register("foundation.probe", { schemaVersion: 1, defaults: 1,
    parse: value => Number.isSafeInteger(value) ? value : null });
  registry.subscribe(rejectedObserver);
  registry.subscribe(() => { healthyNotifications++; });
  assert.equal(registry.write("foundation.probe", 2), 2);
} else if (mode === "readonly-read-async" || mode === "readonly-state-async") {
  const value: ScoreSessionRead = { documentId: "foundation.probe", documentVersion: 0, title: "Probe",
    measureCount: 1, undoDepth: 0, redoDepth: 0,
    notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [],
      measures: [{ id: "measure", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, events: [], ruleWarnings: [] }] },
    playbackSource: readyPlaybackSource("foundation.probe", 0) };
  const source = createReadonlyScoreDocumentSession({ client: { read: async () => value, create: async () => value,
    createGuarded: async () => value, openNativeDocumentGuarded: async () => null, usesNativeFiles: () => true } });
  await source.read();
  const subscribe = mode === "readonly-read-async" ? source.subscribe : source.subscribeState;
  subscribe(rejectedObserver); subscribe(() => { healthyNotifications++; });
  assert.equal((await source.reload()).ok, true);
  assert.equal(source.snapshot().documentId, "foundation.probe");
  source.dispose();
} else {
  const store = new UiPluginDiagnosticStore();
  store.subscribe(mode === "diagnostic-sync" ? () => { throw new Error("throwing diagnostic observer"); } : rejectedObserver);
  store.subscribe(() => { healthyNotifications++; });
  store.report(new UiPluginHostError({ code: "UI-PLG-012", stage: "registration",
    plugin: { id: "foundation.probe", name: "Probe", version: "0.1.0" },
    message: "Probe", detail: "deliberate failure" }).diagnostic);
  assert.equal(store.list().length, 1);
}
await new Promise<void>(resolve => setImmediate(resolve));
assert.equal(healthyNotifications, mode === "readonly-state-async" ? 2 : 1);
console.log(JSON.stringify({ mode, healthyNotifications }));
