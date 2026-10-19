import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ScoreSessionService } from "../../../apps/workbench/host/score-session.ts";
import { createCapacityDocument, documentCases, measureDocumentCapacity, sampleDocument } from "../tools/document-capacity.mjs";
import { projectRoot, isWithin, hash } from "../scripts/author-validation-kit.mjs";

async function temporary(t) {
  const parent = join(projectRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "document-capacity-"));
  t.after(async () => {
    const canonical = await realpath(directory); assert.ok(isWithin(await realpath(parent), canonical));
    await rm(canonical, { recursive: true, force: true });
  });
  return directory;
}

test("real codec fixtures preserve deterministic music and identity through the Native host for all declared scales", () => {
  for (const expected of documentCases) {
    const first = createCapacityDocument(expected), second = createCapacityDocument(expected);
    assert.equal(first.text, second.text);
    const document = JSON.parse(first.text);
    assert.equal(document.schemaVersion, "brilliant-score-1");
    assert.equal(document.measureDefinitions.length, expected.measures);
    const service = new ScoreSessionService(), read = service.importDocument("roundtrip", document);
    assert.deepEqual(read.notation, first.session.notation);
    assert.equal(service.exportDocument("roundtrip"), first.text);
    const all = document.parts[0].measureContents.flatMap(measure => measure.voices[0].sequence.events);
    assert.equal(all.length, expected.events); assert.equal(new Set(all.map(event => event.id)).size, all.length);
  }
});

test("actual file, Native session, backup projection and pagination retain all 128 measures", async t => {
  const directory = await temporary(t), expected = documentCases.find(item => item.measures === 128);
  const { text } = createCapacityDocument(expected), path = join(directory, "staff-128.bgp.json"); await writeFile(path, text);
  const result = await sampleDocument(path, expected);
  assert.equal(result.pages, 4); assert.equal(result.bytes, Buffer.byteLength(text));
  assert.equal(result.snapshot.measures.length, 128);
  for (const value of Object.values(result.timings)) assert.ok(Number.isFinite(value) && value >= 0);
});

test("future, malformed and invalid UTF-8 capacity files reject without replacing the accepted session", async t => {
  const directory = await temporary(t), expected = documentCases[1], { text } = createCapacityDocument(expected);
  const service = new ScoreSessionService(), good = service.importDocument("capacity-measurement", JSON.parse(text));
  const future = JSON.parse(text); future.schemaVersion = "future-score-version";
  for (const [name, bytes] of [["future", JSON.stringify(future)], ["truncated", text.slice(0, 30)], ["utf8", Buffer.from([0xff, 0xfe])]]) {
    const path = join(directory, name + ".bgp.json"); await writeFile(path, bytes);
    await assert.rejects(sampleDocument(path, expected, service));
    assert.deepEqual(service.read("capacity-measurement"), good);
  }
});

test("measurement writes a new bounded evidence directory, exact files and raw samples while leaving all broader qualifications pending", async t => {
  const parent = await temporary(t), output = join(parent, "run");
  const report = await measureDocumentCapacity({ output, warmups: 0, iterations: 1 });
  assert.equal(report.status, "baseline-only", report.error); assert.equal(report.qualificationG6, "pending"); assert.equal(report.thresholds, null);
  assert.deepEqual(report.changedFiles, []); assert.deepEqual(report.changedInputs, []); assert.equal(report.cases.length, 4);
  for (const item of report.cases) {
    assert.equal(item.samples.length, 1); assert.equal(item.stats.totalToLayoutMs.count, 1);
    assert.equal(hash(await readFile(join(output, item.filename))), item.sha256);
    assert.equal(hash(await readFile(join(output, item.projectionFile))), item.projectionSha256);
  }
  assert.equal(report.invalidReplacement.acceptedSessionPreserved, true);
  const before = await readFile(join(output, "report.json"));
  await assert.rejects(measureDocumentCapacity({ output, warmups: 0, iterations: 1 }), /EEXIST/);
  assert.deepEqual(await readFile(join(output, "report.json")), before);
  await assert.rejects(measureDocumentCapacity({ output: join(projectRoot, "..", "capacity-outside") }), /workspace/);
});

test("unknown scales and invalid sampling counts cannot enter measurement", async t => {
  assert.throws(() => createCapacityDocument({ name: "staff-999", measures: 999, events: 3996 }), /Unknown/);
  const output = join(await temporary(t), "unused");
  for (const values of [{ warmups: -1 }, { iterations: 0 }, { iterations: 1.2 }]) {
    await assert.rejects(measureDocumentCapacity({ output, ...values }), /counts/);
  }
});
