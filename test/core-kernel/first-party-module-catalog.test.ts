import assert = require("node:assert/strict");
import { test } from "node:test";

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import { compileFirstPartyModuleCatalogV1 } from "../../src/first-party-modules/catalog";
import {
  INITIALIZE_GUITAR_COMMAND,
  readPartGuitarDomainV1,
} from "../../src/first-party-modules/guitar-domain";
import {
  SET_KEY_SIGNATURE_COMMAND,
  readPartKeySignatureTimelineV1,
} from "../../src/first-party-modules/key-signature";
import { createCoreScoreFixture } from "./fixtures/core-score";

function guitarScore(): ScoreDocument {
  const base = createCoreScoreFixture();
  const part = base.parts[0]!;
  return {
    ...base,
    parts: [{
      ...part,
      name: "Guitar",
      instrument: {
        name: "Guitar",
        writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 },
      },
    }],
  };
}

test("the frozen first-party catalog composes key signature and Guitar Domain together", () => {
  const compiled = compileFirstPartyModuleCatalogV1();
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("expected the first-party catalog to compile");
  const created = CommandBus.createIntegrated(guitarScore(), compiled.catalog);
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("expected a first-party integrated bus");

  assert.equal(created.value.submit({
    commandVersion: 1,
    commandId: INITIALIZE_GUITAR_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: {},
  }).status, "committed");
  assert.equal(created.value.submit({
    commandVersion: 1,
    commandId: SET_KEY_SIGNATURE_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { measureId: "measure-1", change: { kind: "set", fifths: 2 } },
  }).status, "committed");

  const read = created.value.read();
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const document = read.value.snapshot.document;
  assert.equal(readPartGuitarDomainV1(document, "part-1").status, "valid");
  assert.deepEqual(readPartKeySignatureTimelineV1(document, "part-1"), {
    status: "valid",
    changes: [{ measureId: "measure-1", fifths: 2 }],
  });
  assert.equal(document.extensions.length, 2);
});
