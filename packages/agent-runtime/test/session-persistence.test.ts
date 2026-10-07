import assert from "node:assert/strict";
import test from "node:test";
import { createAgentSession } from "../src/session/agent-session.ts";
import { parseSessionLibrary, parseTranscript } from "../src/session/session-store.ts";
import { isAgentSessionSnapshot } from "../src/contracts/session-snapshot.ts";
import type { AgentProviderRequest } from "../src/runtime/provider.ts";

test("full transcript survives context eviction and restore rebuilds only budgeted successful history", async () => {
  const requests: AgentProviderRequest[] = [];
  const provider = { decide: async (request: AgentProviderRequest) => { requests.push(request); return { kind: "finish", reason: "completed", text: `answer-${request.goal}` }; } };
  const session = createAgentSession({ provider, retainTranscript: true, budget: { historyTurnBudget: 2 } });
  await session.setEnabled(true);
  for (let i = 0; i < 24; ++i) await session.submit(`turn-${i}-unique`);
  assert.equal(session.getSnapshot().messages.length, 48);
  assert.equal(session.getSnapshot().messages[0]?.content, "turn-0-unique");
  assert.equal(session.getSnapshot().omittedHistoryTurns, 21);
  assert.ok(!JSON.stringify(requests.at(-1)?.context).includes("turn-0-unique"));
  assert.ok(isAgentSessionSnapshot(session.getSnapshot()));
  const restored = createAgentSession({ provider, retainTranscript: true, budget: { historyTurnBudget: 2 } });
  await restored.restoreTranscript(session.getSnapshot().sessionId, session.getSnapshot().messages);
  assert.equal(restored.getSnapshot().enabled, false);
  assert.equal(requests.length, 24);
  await restored.setEnabled(true); await restored.submit("continued-after-restart");
  const context = JSON.stringify(requests.at(-1)?.context);
  assert.ok(context.includes("answer-turn-23-unique")); assert.ok(!context.includes("turn-21-unique"));
  assert.equal(restored.getSnapshot().messages.length, 50);
  await restored.dispose(); await session.dispose();
});

test("failed start checkpoint blocks provider and completed output waits for its terminal checkpoint", async () => {
  let decisions = 0;
  let fail = true;
  let release!: () => void;
  let checkpointStarted!: () => void;
  const terminalCheckpoint = new Promise<void>((resolve) => { checkpointStarted = resolve; });
  const session = createAgentSession({ retainTranscript: true, provider: { decide: async () => { ++decisions; return { kind: "finish", reason: "completed", text: "full output" }; } },
    checkpoint: async (snapshot) => {
      if (fail) throw new Error("disk unavailable");
      if (snapshot.status === "completed") { checkpointStarted(); await new Promise<void>((resolve) => { release = resolve; }); }
    } });
  await session.setEnabled(true);
  await assert.rejects(session.submit("must not reach provider"));
  assert.equal(decisions, 0); assert.equal(session.getSnapshot().messages[1]?.status, "failed");
  fail = false;
  let completed = false;
  const pending = session.submit("normal request").then(() => { completed = true; });
  await terminalCheckpoint;
  assert.equal(completed, false); assert.equal(session.hasActiveRun(), true);
  assert.throws(() => session.submit("cannot overlap durable completion"), /运行/);
  release(); await pending;
  assert.equal(session.hasActiveRun(), false); assert.equal(decisions, 1);
  await session.dispose();
});

test("restored failure, cancellation and interrupted output are visible but never successful model memory", async () => {
  const messages = ["complete", "failed", "cancelled", "interrupted"].flatMap((status, index) => [
    { id: `u-${index}`, runId: `r-${index}`, role: "user", status: "complete", content: `input-${status}` },
    { id: `a-${index}`, runId: `r-${index}`, role: "assistant", status, content: `output-${status}` },
  ]);
  let context = "";
  const session = createAgentSession({ retainTranscript: true, provider: { decide: async (request) => { context = JSON.stringify(request.context); return { kind: "finish", reason: "completed", text: "new output" }; } } });
  await session.restoreTranscript("restored-session", parseTranscript(messages));
  assert.equal(session.getSnapshot().messages.length, 8);
  await session.setEnabled(true); await session.submit("continue");
  assert.ok(context.includes("output-complete"));
  for (const status of ["failed", "cancelled", "interrupted"]) assert.ok(!context.includes(`input-${status}`));
  await session.restoreTranscript("separate-session", []); await session.submit("other conversation");
  assert.ok(!context.includes("output-complete"));
  await session.dispose();
});

test("versioned session decoder rejects extra/private fields, mismatched runs and duplicate IDs", () => {
  const record = { sessionId: "session", title: "完整对话", createdAt: 1, updatedAt: 2, archived: false, messages: [] };
  const library = { schemaVersion: 1, selectedSessionId: "session", sessions: [record] };
  assert.deepEqual(parseSessionLibrary(library), library);
  for (const value of [null, { ...library, schemaVersion: 2 }, { ...library, apiKey: "secret" }, { ...library, sessions: [record, record] }, { ...library, sessions: [{ ...record, archived: true }] }]) assert.throws(() => parseSessionLibrary(value));
  assert.throws(() => parseTranscript([{ id: "u", runId: "one", role: "user", content: "user", status: "complete" }, { id: "a", runId: "two", role: "assistant", content: "assistant", status: "complete" }]));
});
