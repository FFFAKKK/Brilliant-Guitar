import assert from "node:assert/strict";
import test from "node:test";
import { PlaybackOutputRegistry } from "../src/playback/playback-output.ts";

function soundFontFile(name = "Concert.sf2", bytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x73, 0x66, 0x62, 0x6b,
])): File {
  return new File([bytes], name, { lastModified: 12 });
}

test("output registry starts with a playable built-in synthesizer", () => {
  const registry = new PlaybackOutputRegistry();
  assert.equal(registry.getSnapshot().activeId, "builtin-synth");
  assert.deepEqual(registry.getSnapshot().outputs.map((output) => [output.id, output.available]), [["builtin-synth", true]]);
  assert.ok(registry.createEngine());
});

test("an unavailable platform contribution list still boots with the built-in output", () => {
  const registry = new PlaybackOutputRegistry(undefined);
  registry.replacePluginOutputs(undefined);
  assert.deepEqual(registry.getSnapshot().outputs.map((output) => output.id), ["builtin-synth"]);
  assert.ok(registry.createEngine());
});

test("SoundFont import validates the container, stores metadata, and keeps playback honest", async () => {
  const registry = new PlaybackOutputRegistry();
  const result = await registry.importSoundFont(soundFontFile());
  assert.equal(result.ok, true);
  const snapshot = registry.getSnapshot();
  assert.equal(snapshot.sampleBanks.length, 1);
  assert.equal(snapshot.sampleBanks[0]?.format, "sf2");
  const imported = snapshot.outputs.find((output) => output.kind === "sample-bank");
  assert.equal(imported?.available, false);
  assert.equal(imported?.diagnostic?.code, "playback.soundfont-engine-pending");
  const selection = await registry.select(imported?.id ?? "missing");
  assert.equal(selection.ok, false);
  assert.equal(registry.getSnapshot().activeId, "builtin-synth");
});

test("SoundFont import rejects unsupported extensions and malformed RIFF data", async () => {
  const registry = new PlaybackOutputRegistry();
  const wrongExtension = await registry.importSoundFont(soundFontFile("Concert.sfz"));
  assert.equal(wrongExtension.ok, false);
  assert.equal(wrongExtension.diagnostic?.code, "playback.soundfont-format-unsupported");
  const malformed = await registry.importSoundFont(soundFontFile("Concert.sf2", new Uint8Array(12)));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.diagnostic?.code, "playback.soundfont-invalid");
  assert.equal(registry.getSnapshot().sampleBanks.length, 0);
});

test("removing an imported resource removes its output and falls back safely", async () => {
  const registry = new PlaybackOutputRegistry();
  await registry.importSoundFont(soundFontFile());
  const resourceId = registry.getSnapshot().sampleBanks[0]?.id;
  assert.ok(resourceId);
  registry.removeSampleBank(resourceId);
  assert.equal(registry.getSnapshot().sampleBanks.length, 0);
  assert.equal(registry.getSnapshot().outputs.length, 1);
  assert.equal(registry.getSnapshot().activeId, "builtin-synth");
});

test("plugin output reconciliation keeps the built-in fallback and retires deactivated engines", async () => {
  const pluginOutput = {
    id: "test-midi-output",
    kind: "midi-out" as const,
    label: "测试 MIDI",
    createEngine: () => ({ activate: async () => {}, now: () => 0, start() {}, stop() {} }),
  };
  const registry = new PlaybackOutputRegistry([pluginOutput]);
  assert.deepEqual(registry.getSnapshot().outputs.map((output) => output.id), ["builtin-synth", "test-midi-output"]);
  assert.equal((await registry.select(pluginOutput.id)).ok, true);

  registry.replacePluginOutputs([]);

  assert.equal(registry.getSnapshot().activeId, "builtin-synth");
  assert.deepEqual(registry.getSnapshot().outputs.map((output) => output.id), ["builtin-synth"]);
  assert.ok(registry.createEngine());
});
