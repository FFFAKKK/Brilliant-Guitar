import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { isAgentRunDiagnosticsV1, decodeRunDiagnostics } from "../src/contracts/run-diagnostics.ts";
import { projectRunDiagnostics } from "../src/server/run-diagnostics.ts";
import { StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { isStandaloneAgentSnapshot } from "../src/contracts/host.ts";
import { createModelFixture, textReply } from "./model-fixture.ts";
import { listenForTest } from "./listen-for-test.ts";
import { inputSummary, runDiagnostics } from "./run-diagnostics-fixture.ts";

test("diagnostics strict decoder rejects extras, fabricated usage, invalid counts and cross-run reports", () => {
  const good = runDiagnostics(); assert.ok(isAgentRunDiagnosticsV1(good));
  const invalid: unknown[] = [{ ...good, secret: "must-reject" }, { ...good, actualUsage: 0 }, { ...good, hostSequence: -1 },
    { ...good, configurationEpoch: Number.MAX_SAFE_INTEGER + 1 }, { ...good, sessionId: "" }, { ...good, hostInstanceId: "" },
    { ...good, modelInput: inputSummary({ runId: "old-run" }) }, { ...good, modelInput: { ...good.modelInput, body: "private" } },
    { ...good, modelInput: inputSummary({ estimatedInputTokens: 9000 }) }, { ...good, modelInput: inputSummary({ inputTokenBudget: 0 }) },
    { ...good, modelInput: inputSummary({ toolCount: -1 }) }, { ...good, availability: "pending" }, { ...good, runId: null },
    { ...good, contextSelection: {} }, { ...good, admission: {} }, { ...good, omittedHistoryTurns: null }];
  for (const value of invalid) { assert.equal(isAgentRunDiagnosticsV1(value), false); assert.throws(() => decodeRunDiagnostics(value)); }
  const frozen = decodeRunDiagnostics(good); assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.modelInput));
  assert.notEqual(frozen.modelInput, good.modelInput);
  assert.ok(isAgentRunDiagnosticsV1(runDiagnostics({ modelInput: inputSummary({ status: "budget-exceeded", estimatedInputTokens: 9000 }) })));
});

test("pure projection binds phases independently, strips source metadata and selects honest missing states", () => {
  const modelInput = { schemaVersion: 1, ...inputSummary(), prompt: "private text", baseUrl: "private URL", apiKey: "private credential" };
  const base = { hostInstanceId: "host-1", hostSequence: 1, sessionId: "session-1", runId: "run-1", selectedProfileId: "profile-1", configurationEpoch: 0,
    enabled: true, binding: { sessionId: "session-1", runId: "run-1", selectedProfileId: "profile-1", configurationEpoch: 0 },
    providerId: "deepseek", modelId: "fixture-model", modelInput, contextSelection: null, admission: null, omittedHistoryTurns: 3 };
  const result = projectRunDiagnostics(base); assert.equal(result.availability, "available");
  assert.equal(result.omittedHistoryTurns, 3); assert.equal(result.actualUsage, null);
  assert.ok(!JSON.stringify(result).includes("private")); assert.equal(modelInput.prompt, "private text");
  assert.equal(projectRunDiagnostics({ ...base, enabled: false }).availability, "disabled");
  assert.equal(projectRunDiagnostics({ ...base, runId: null }).availability, "no-current-run");
  assert.equal(projectRunDiagnostics({ ...base, binding: null }).availability, "unavailable");
  assert.equal(projectRunDiagnostics({ ...base, configurationEpoch: 1 }).availability, "configuration-changed");
  assert.equal(projectRunDiagnostics({ ...base, modelInput: null }).availability, "pending");
  assert.equal(projectRunDiagnostics({ ...base, modelInput: { ...modelInput, modelId: "other-model" } }).availability, "unavailable");
  assert.equal(projectRunDiagnostics({ ...base, admission: {} }).availability, "unavailable");
});

test("actual diagnostic HTTP is read-only, private, v5 compatible and bound to effective configuration", async (t) => {
  const fixture = await createModelFixture([textReply("private reply"), textReply("probe reply"), textReply("new reply")]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host }); await listenForTest(server);
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string"); const url = `http://127.0.0.1:${address.port}/api/run-diagnostics`;
  assert.equal(host.getRunDiagnostics().availability, "disabled");
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl: fixture.baseUrl });
  await host.saveCredential("diagnostics-fixture-key"); await host.setEnabled(true);
  assert.equal(host.getRunDiagnostics().availability, "no-current-run");
  await host.session.submit("private user text");
  const report = host.getRunDiagnostics(); assert.equal(report.availability, "available"); assert.ok(report.modelInput && report.contextSelection);
  assert.equal(report.modelInput.runId, report.runId); assert.equal(report.actualUsage, null);
  const sequence = host.getSnapshot().sequence;
  for (let i = 0; i < 3; ++i) {
    const res = await fetch(url); assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(decodeRunDiagnostics(await res.json()), report);
  }
  assert.equal(host.getSnapshot().sequence, sequence); assert.equal(fixture.requests.length, 1);
  for (const excluded of ["private user text", "private reply", "diagnostics-fixture-key", fixture.baseUrl]) assert.ok(!JSON.stringify(report).includes(excluded));
  assert.equal((await fetch(url, { headers: { origin: "http://other.local" } })).status, 403);
  assert.equal(await new Promise((resolve, reject) => { const r = httpRequest(url, { headers: { host: "other.local" } }, (res) => { res.resume(); resolve(res.statusCode); }); r.on("error", reject); r.end(); }), 403);
  assert.ok(isStandaloneAgentSnapshot(host.getSnapshot())); assert.equal(Object.keys(host.getSnapshot()).length, 11);
  assert.equal(await host.testConnection(), true); assert.deepEqual(host.getRunDiagnostics().modelInput, report.modelInput);
  const profile = host.getSnapshot().connections.profiles[0]!;
  await host.saveProfileV2({ schemaVersion: 2, profileId: profile.id, name: "renamed", configuration: profile.configuration, inputPolicy: profile.inputPolicy, rememberCredential: false });
  assert.equal(host.getRunDiagnostics().configurationEpoch, report.configurationEpoch); assert.equal(host.getRunDiagnostics().availability, "available");
  await host.saveProfileV2({ schemaVersion: 2, profileId: profile.id, name: "renamed", configuration: profile.configuration, inputPolicy: { ...profile.inputPolicy, inputTokenBudget: 16384 }, rememberCredential: false });
  assert.equal(host.getRunDiagnostics().availability, "configuration-changed"); assert.equal(host.getRunDiagnostics().modelInput, null);
  await host.session.submit("new task"); assert.equal(host.getRunDiagnostics().modelInput?.inputTokenBudget, 16384);
  const epoch = host.getRunDiagnostics().configurationEpoch;
  await host.saveCredential("changed-fixture-key"); assert.equal(host.getRunDiagnostics().configurationEpoch, epoch + 1); assert.equal(host.getRunDiagnostics().availability, "configuration-changed");
  await host.setEnabled(false); assert.equal(host.getRunDiagnostics().availability, "disabled");
  await host.setEnabled(true); assert.equal(host.getRunDiagnostics().availability, "unavailable");
  const oldSession = host.getSnapshot().session.sessionId; await host.reset(); assert.equal(host.getRunDiagnostics().availability, "no-current-run");
  await host.selectConversation(oldSession); assert.equal(host.getRunDiagnostics().availability, "no-current-run");
  assert.equal(fixture.requests.length, 3);
});

test("cancel keeps last actual input but never resurrects selection, admission or a late report", async (t) => {
  let reached!: () => void; const pendingWire = new Promise<void>((resolve) => { reached = resolve; });
  const fixture = await createModelFixture(() => { reached(); return { hang: true }; }); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await host.configure({ providerId: "deepseek", protocol: "chat-completions", modelId: "fixture-model", baseUrl: fixture.baseUrl });
  await host.saveCredential("cancel-diagnostics-key"); await host.setEnabled(true);
  const pending = host.session.submit("wait"); await pendingWire;
  const before = host.getRunDiagnostics(); assert.ok(before.modelInput && before.contextSelection);
  await host.cancel(); await pending;
  const after = host.getRunDiagnostics(); assert.deepEqual(after.modelInput, before.modelInput); assert.equal(after.contextSelection, null); assert.equal(after.admission, null);
  assert.equal(host.session.reportContextSelection(before.contextSelection), false);
  await host.reset(); assert.equal(host.getRunDiagnostics().modelInput, null); assert.equal(fixture.requests.length, 1);
});
