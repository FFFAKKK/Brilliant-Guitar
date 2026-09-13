// Diagnostic only: six edits in one session, not Qualification V2 sampling.
// Run old/new artifacts sequentially, after building dist and the CVN-7 guest.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
if (process.argv.length !== 3) throw new Error("usage: node scripts/profile-native-cvn7-editing.mjs addon-path");
const addonPath = resolve(process.argv[2]);
const { CommandBus } = require("../dist/src/core-kernel/index.js");
const { createRepresentativeCvn7Score, CVN7_D4 } = require("../dist/test/core-kernel/fixtures/cvn-7-qualification-score.js");
const { createCvn7NativeWasmFixture } = require("../dist/test/core-kernel/fixtures/cvn-7-native-wasm.js");
const fixture = createRepresentativeCvn7Score();
const installed = createCvn7NativeWasmFixture(require(addonPath));
const restore = installed.install();
try {
  const created = CommandBus.createIntegrated(fixture.document, installed.catalog, installed.modules.knownRequirementInventory);
  assert.ok(created.ok);
  installed.modules.resetTrace();
  const durationsMs = [];
  for (let index = 0; index < 7; index++) {
    const command = installed.modules.createScoreCommand(fixture.document.id, fixture.firstNote.noteId, CVN7_D4, `profile-${index}`);
    const start = performance.now();
    const result = created.value.submit(command);
    const duration = performance.now() - start;
    assert.equal(result.status, "committed");
    assert.equal(result.documentVersion, index + 1);
    assert.equal(result.undoDepth, index + 1);
    if (index !== 0) durationsMs.push(duration);
  }
  assert.deepEqual(installed.modules.readTrace(), []);
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  console.log(JSON.stringify({
    qualification: false, node: process.version, platform: process.platform, arch: process.arch,
    fixture: fixture.counts, addonPath, addonSha256: sha256(addonPath),
    guestSha256: installed.guestSha256,
    fixtureSha256: sha256("test/core-kernel/fixtures/cvn-7-qualification-score.ts"),
    profileSha256: sha256(new URL(import.meta.url)),
    excludedInitialEdits: 1, measuredEdits: 6, durationsMs,
    medianMs: (sorted[2] + sorted[3]) / 2, maxRssBytes: process.resourceUsage().maxRSS * 1024,
    limitations: ["One session, no qualification percentiles", "Includes final assessment and public host result conversion", "Synthetic plugins"],
  }, null, 2));
} finally { restore(); }
