// Reproduce protocol fixtures using the actual SDK and the established Native
// V2 artifact. This is a fixture generator, not a JS-to-Wasm compiler or binding.
import assert = require("node:assert/strict");
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES } from "../fixtures/cvn-6-synthetic-official-modules";

if (require.main === module && process.argv[2] === "--write") {
  const addon = require(resolve("target/integrated-v2/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(compiled.ok);
  let initial = "";
  const callbacks: Record<string, string> = {};
  const journey: { request: string; response: string }[] = [];
  const restore = installNativeIntegratedBackendV2({
    createIntegratedKernelSessionV2(request, callback) {
      initial = request.toString("utf8");
      const operate = addon.createIntegratedKernelSessionV2(request, input => {
        const decoded = JSON.parse(input.toString("utf8"));
        const key = decoded.operation === "assess"
          ? decoded.document.extensions.length === 0 ? "assessEmpty" : "assessPopulated"
          : decoded.operation;
        const result = callback(input);
        const text = result.toString("utf8");
        if (callbacks[key] !== undefined) assert.equal(text, callbacks[key], `fixture response varies: ${key}`);
        callbacks[key] = text;
        return result;
      });
      return bytes => {
        const response = operate(bytes);
        journey.push({ request: bytes.toString("utf8"), response: response.toString("utf8") });
        return response;
      };
    },
  });
  try {
    const created = CommandBus.createIntegrated(createCoreScoreFixture(), compiled.catalog);
    assert.ok(created.ok);
    const bus = created.value;
    bus.read();
    const submitted = bus.submit({ commandVersion: 1, commandId: "fixture.score.apply",
      target: { kind: "document", documentId: "score-1" },
      payload: { noteId: "note-1", pitch: { step: "D", alter: 0, octave: 4 }, schemaVersion: 1, marker: "wasm" } });
    assert.equal(submitted.status, "committed");
    bus.read(); bus.undo(); bus.read(); bus.redo(); bus.read();
    const root = resolve("crates/brilliant-kernel-session/src/wasm/fixtures");
    mkdirSync(root, { recursive: true });
    writeFileSync(resolve(root, "session.json"), JSON.stringify({ initial, callbacks, journey }, null, 2) + "\n");
  } finally { restore(); }
}
