import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { readOrCreateInitialScore } from "../src/services/initial-score.ts";
import { WorkbenchRequestError } from "../src/services/workbench-client.ts";

const session: ScoreSessionRead = {
  documentId: "document", title: "", measureCount: 1, documentVersion: 0, undoDepth: 0, redoDepth: 0,
  notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble",
    measures: [{ id: "measure", voiceId: "voice", events: [], meter: { numerator: 4, denominator: 4 } }] },
};

test("entering a fresh workspace creates one bar, while an existing session is reused", async () => {
  let current: ScoreSessionRead | null = null;
  let creates = 0;
  const client = {
    async read() { return current; },
    async create(input: unknown, requestId: string, expectedDocumentId: string | null) {
      assert.deepEqual(input, { title: "", measureCount: 1 });
      assert.equal(requestId, "request"); assert.equal(expectedDocumentId, null);
      creates++; current = session; return session;
    },
  };
  assert.equal(await readOrCreateInitialScore(client, "request"), session);
  assert.equal(await readOrCreateInitialScore(client, "request"), session);
  assert.equal(creates, 1);
});

test("concurrent initialization reads the winning session and other failures stay retryable", async () => {
  let reads = 0;
  const client = {
    async read() { return reads++ ? session : null; },
    async create(): Promise<ScoreSessionRead> { throw new WorkbenchRequestError("conflict", 409); },
  };
  assert.equal(await readOrCreateInitialScore(client, "request"), session);
  await assert.rejects(readOrCreateInitialScore({ async read() { return null; },
    async create(): Promise<ScoreSessionRead> { throw new WorkbenchRequestError("offline", 503); } }, "request"), /offline/);
});
