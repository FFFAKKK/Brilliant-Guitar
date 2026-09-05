import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import { validateScoreDocumentSemantics } from "../../../src/core-kernel/validation/validate-score-semantics";
import {
  createRustKernelSmokeSession,
  type RustKernelSmokeNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelSmokeNativeAddon;

function pickupDocument(numerator: number) {
  const fixture = createCoreScoreFixture();
  return {
    ...fixture,
    measureDefinitions: fixture.measureDefinitions.map((measure) => ({
      ...measure,
      meter: { numerator, denominator: 2 as const },
      pickupDuration: { numerator, denominator: 2 },
    })),
    parts: fixture.parts.map((part) => ({
      ...part,
      measureContents: part.measureContents.map((content) => ({
        ...content,
        voices: content.voices.map((voice) => ({
          ...voice,
          sequence: { start: { numerator: 0, denominator: 1 }, events: [] },
        })),
      })),
    })),
  };
}

test("native import rejects the same unsafe pickup comparison as the TypeScript oracle", () => {
  const document = pickupDocument(Number.MAX_SAFE_INTEGER);
  const before = JSON.stringify(document);
  const semantics = validateScoreDocumentSemantics(document);
  assert.equal(semantics.ok, false);
  if (semantics.ok) throw new Error("expected semantic overflow");
  assert.ok(semantics.diagnostics.some((item) => item.code === "semantic.time-arithmetic-overflow"));
  const native = createRustKernelSmokeSession(addon, document);
  assert.equal(native.result.status, "rejected");
  assert.equal("handle" in native, false, "invalid input publishes no native session");
  if (native.result.status === "rejected") {
    assert.equal(native.result.failure.code, "score.invalid-structure");
  }
  assert.equal(JSON.stringify(document), before);
});

test("safe cross-product boundary still imports through both validators", () => {
  const document = pickupDocument(Math.floor(Number.MAX_SAFE_INTEGER / 2));
  assert.equal(validateScoreDocumentSemantics(document).ok, true);
  assert.equal(createRustKernelSmokeSession(addon, document).result.status, "created");
});

test("internal time indexing preserves legal tiny tuplets without extra arithmetic rejection", () => {
  const fixture = createCoreScoreFixture();
  const document = {
    ...fixture,
    parts: fixture.parts.map((part) => ({
      ...part,
      measureContents: part.measureContents.map((content) => ({
        ...content,
        voices: content.voices.map((voice) => ({
          ...voice,
          sequence: {
            start: { numerator: 1, denominator: Number.MAX_SAFE_INTEGER },
            events: [{
              id: `tiny-${voice.id}`,
              duration: {
                base: 1 as const,
                dots: 0 as const,
                timeModification: { actualNotes: Number.MAX_SAFE_INTEGER, normalNotes: 1 },
              },
              content: { kind: "rest" as const },
            }],
          },
        })),
      })),
    })),
  };
  assert.equal(validateScoreDocumentSemantics(document).ok, true);
  assert.equal(createRustKernelSmokeSession(addon, document).result.status, "created");
});
