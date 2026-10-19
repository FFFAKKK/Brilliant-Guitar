import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { isScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { projectFrettedTablature } from "../host/fretted-notation.ts";
import { guitarNotationDomain } from "../host/guitar-notation.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import { readPartGuitarDomainV1 } from "../.kernel/src/first-party-modules/guitar-domain.js";
const document = (): ScoreDocument => JSON.parse(readFileSync(
  new URL("../../desktop/src-tauri/src/application/official_domains/guitar-document.json", import.meta.url), "utf8")) as ScoreDocument;
function fixture() {
  const host = new ScoreSessionService(), workspace = randomUUID();
  const current = host.importDocument(workspace, document());
  assert.equal(current.notation.kind, "staff"); assert.equal(current.tablature?.kind, "tablature");
  assert.ok(isScoreSessionRead(current));
  return { host, workspace, current };
}
test("actual host fixed catalog reads both projections from the same document and retains IDs through history", () => {
  const { host, workspace, current } = fixture();
  const apply = (read: ScoreSessionRead, action: "undo" | "redo" | "set-document-metadata") => host.edit(workspace, {
    requestId: randomUUID(), documentId: read.documentId, expectedVersion: read.documentVersion,
    action: action === "set-document-metadata" ? { kind: action,
      metadata: { title: read.title, authors: read.metadata!.authors, tempoBpm: 132.5 } } : { kind: action },
  });
  const changed = apply(current, "set-document-metadata"); assert.ok(isScoreSessionRead(changed));
  assert.equal(changed.undoDepth, 1); assert.equal(changed.documentVersion, 1);
  assert.ok(changed.notation.kind === "staff" && changed.tablature?.kind === "tablature");
  assert.equal(changed.notation.tempoBpm, 132.5); assert.equal(changed.tablature.tempoBpm, 132.5);
  assert.deepEqual(changed.notation.measures, current.notation.kind === "staff" ? current.notation.measures : null);
  assert.deepEqual(changed.tablature.measures, current.tablature?.kind === "tablature" ? current.tablature.measures : null);
  const undo = apply(changed, "undo"); assert.deepEqual(undo.notation, current.notation); assert.deepEqual(undo.tablature, current.tablature);
  const redo = apply(undo, "redo"); assert.deepEqual(redo.notation, changed.notation); assert.deepEqual(redo.tablature, changed.tablature);
  const reopened = host.importDocument(randomUUID(), JSON.parse(host.exportDocument(workspace)));
  assert.deepEqual(reopened.tablature, changed.tablature); assert.equal(reopened.undoDepth, 0);
});
test("typed original IPC read preserves Tab without issuing a second document request", async () => {
  const f = fixture(), calls: string[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string): Promise<T> => {
    calls.push(name); assert.equal(name, "workbench_read_v1"); return f.current as T;
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge), initialization: "read-existing" });
  try {
    const read = await source.read(); assert.deepEqual(read, f.current);
    assert.deepEqual(read?.tablature, f.current.tablature); assert.deepEqual(calls, ["workbench_read_v1"]);
  } finally { source.dispose(); }
});
test("atomic acceptance rejects malformed or mismatched Tab, and remains compatible with older hosts", () => {
  const { current } = fixture();
  const { tablature: _tab, ...legacy } = current;
  assert.ok(isScoreSessionRead(legacy));
  assert.ok(isScoreSessionRead({ ...current, tablature: { kind: "unsupported", message: "missing positions" } }));
  const tab = current.tablature; assert.ok(tab?.kind === "tablature");
  const measure = tab.measures[0]!, event = measure.events[0]!;
  assert.ok(event.content.kind === "note");
  const firstEvent = (value: unknown) => ({ ...tab, measures: [{ ...measure, events: [value, ...measure.events.slice(1)] }] });
  const firstMeasure = (value: unknown) => ({ ...tab, measures: [value] });
  for (const tablature of [
    { ...tab, stringCount: 0 },
    firstEvent({ ...event, content: { ...event.content, position: { ...event.content.position, fret: Number.MAX_SAFE_INTEGER + 1 } } }),
    { ...tab, tempoBpm: 72 }, { ...tab, partId: "other" },
    firstMeasure({ ...measure, id: "other" }), firstMeasure({ ...measure, events: [...measure.events].reverse() }),
    firstEvent({ ...event, duration: { ...event.duration, dots: 1 } }),
    firstEvent({ ...event, content: { kind: "rest" } }),
    firstMeasure({ ...measure, meter: { ...measure.meter, numerator: 3 } }),
    firstMeasure({ ...measure, voiceId: "other" }), firstMeasure({ ...measure, ruleWarnings: [{
      code: "rule.sequence-exceeds-measure", nominalDuration: { numerator: 1, denominator: 1 },
      actualDuration: { numerator: 2, denominator: 1 }, overflow: { numerator: 1, denominator: 1 },
    }] }), null,
  ]) assert.equal(isScoreSessionRead({ ...current, tablature }), false);
});
test("the original application owner retains the accepted pair when a reload returns a mismatched projection", async () => {
  const f = fixture(); let mismatch = false;
  const bridge = new TauriWorkbenchHostBridge(async <T>(): Promise<T> =>
    (mismatch && f.current.tablature?.kind === "tablature"
      ? { ...f.current, tablature: { ...f.current.tablature, partId: "other" } } : f.current) as T);
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge), initialization: "read-existing" });
  try {
    assert.deepEqual(await source.read(), f.current);
    mismatch = true; assert.equal((await source.reload()).ok, false);
    assert.equal(source.snapshot().status, "error");
    await assert.rejects(source.read());
    assert.equal(source.snapshot().documentId, f.current.documentId);
    assert.equal(source.snapshot().documentVersion, f.current.documentVersion);
    mismatch = false; assert.equal((await source.reload()).ok, true);
    assert.deepEqual(await source.read(), f.current);
  } finally { source.dispose(); }
});
test("unknown or future key blocks are not accepted just because their namespace is familiar", () => {
  const source = document();
  for (const extension of [
    { namespace: "brilliant.notation.key-signature", schemaVersion: 2, owner: { kind: "part", partId: "part-1" }, payload: { future: [] } },
    { namespace: "brilliant.notation.key-signature", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: { changes: [], extra: true } },
    { namespace: "unknown.example", schemaVersion: 1, owner: { kind: "score" }, payload: {} },
  ]) {
    assert.equal(projectFrettedTablature({ ...source, extensions: [...source.extensions, extension] } as ScoreDocument,
      "part-1", guitarNotationDomain).kind, "unsupported");
  }
});
test("domain import rejects pitch/placement disagreement atomically and preserves real techniques as unsupported", () => {
  const { host, workspace, current } = fixture();
  const bad = document();
  const block = bad.extensions[0]!, read = readPartGuitarDomainV1(bad, "part-1"); assert.ok(read.status === "valid");
  const raw = { ...bad, extensions: [{ ...block, payload: { ...block.payload, placements:
    read.state.placements.map((placement, i) => ({ ...placement, fret: i === 0 ? 1 : placement.fret })) } }] };
  assert.throws(() => host.importDocument(workspace, raw));
  assert.deepEqual(host.read(workspace), current);
  const technique = { ...bad, extensions: [{ ...block, payload: { ...block.payload,
    techniques: [{ id: "vibrato-a", kind: "vibrato", noteId: "note-a" }] } }] };
  const accepted = host.importDocument(workspace, technique);
  assert.equal(accepted.notation.kind, "unsupported"); assert.equal(accepted.tablature?.kind, "unsupported");
  assert.equal(accepted.playbackSource.kind, "unsupported");
  assert.equal(JSON.parse(host.exportDocument(workspace)).extensions[0].payload.techniques.length, 1);
});
