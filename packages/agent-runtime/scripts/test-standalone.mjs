import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "brilliant-agent-isolated-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check through npm run test:standalone");
function command(args, cwd) {
  const result = spawnSync(process.execPath, [npm, "--cache", join(scratch, "cache"), ...args], { cwd, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Package validation failed");
  return result.stdout;
}
const packed = JSON.parse(command(["pack", "--json", "--pack-destination", scratch], root))[0];
writeFileSync(join(scratch, "package.json"), '{"private":true,"type":"module"}');
command(["install", join(scratch, packed.filename), "--cache", join(scratch, "cache"), "--no-audit", "--no-fund"], scratch);
writeFileSync(join(scratch, "smoke.mjs"), `
import assert from 'node:assert/strict';
import { createAgentSession, AgentToolRegistry, STANDALONE_CONTEXT_POLICY, isContextSelectionReportV1, isToolFeedbackAdmissionReportV1, parseModelInputPolicy, DEFAULT_MODEL_INPUT_POLICY } from '@brilliant-guitar/agent-runtime';
assert.equal(parseModelInputPolicy(DEFAULT_MODEL_INPUT_POLICY).inputTokenBudget, 8192);
assert.throws(() => parseModelInputPolicy({ ...DEFAULT_MODEL_INPUT_POLICY, extra: true }));
for (const policy of [undefined, STANDALONE_CONTEXT_POLICY]) {
  let samples = 0;
  const session = createAgentSession({ ...(policy ? { contextSelectionPolicy: policy } : {}),
    inputTokenBudget: () => { ++samples; return 16384; },
    provider: { decide: async (request) => {
      assert.equal(request.context.budget.tokenBudget, 16384);
      return { kind: 'finish', reason: 'completed', text: 'isolated response' };
    } } });
  await session.setEnabled(true);
  assert.equal((await session.submit('headless standalone')).response, 'isolated response');
  assert.equal(session.getSnapshot().status, 'completed');
  await session.submit('continue');
  assert.equal(samples, 2);
  const report = session.getContextSelection();
  if (policy) {
    assert.ok(isContextSelectionReportV1(report));
    assert.equal(report.selected.filter((item) => item.reason === 'recent-conversation').length, 1);
  } else assert.equal(report, null);
  await session.dispose();
}
let calls = 0, executed = 0;
const readSession = createAgentSession({ readAdmission: { schemaVersion: 1, maxResultJsonBytes: 1024 },
  inputPreview: { preview: (request) => ({ schemaVersion: 1, runId: request.runId, turnId: request.turnId, status: 'ready',
    estimator: 'utf8-json-bytes-div3-v1', estimatedInputTokens: 100, inputTokenBudget: request.context.budget.tokenBudget, requestBytes: null, requestByteBudget: null }) },
  tools: new AgentToolRegistry([{ descriptor: { id: 'isolated.read', contractVersion: 1, name: 'Read', description: 'Immutable read', kind: 'query',
    inputSchema: { type: 'object' }, outputSummary: 'Text', preconditions: [], sideEffects: { document: 'none', filesystem: 'none', network: 'none', settings: 'none', playback: 'none' },
    scopeLimit: 'none', requiresDocument: false, approvalRequirement: 'risk-based', costClass: 'constant', allowedPhases: ['planning'], validateInput: () => true },
    previewRead: (_input, context) => context.resultLimit.maxResultJsonBytes < 20 ? { status: 'insufficient-limit' } : { status: 'ready', data: { text: 'isolated' } },
    execute: async () => { ++executed; return { text: 'isolated' }; } }]),
  provider: { decide: async (request) => ++calls === 1 ? { kind: 'tool-calls', calls: [{ callId: 'call', capabilityId: 'isolated.read', contractVersion: 1, input: {} }] }
    : { kind: 'finish', reason: 'completed', text: 'isolated admitted response' } } });
await readSession.setEnabled(true);
assert.equal((await readSession.submit('Read')).response, 'isolated admitted response');
assert.equal(executed, 1);
assert.ok(isToolFeedbackAdmissionReportV1(readSession.getToolFeedbackAdmission()));
await readSession.reset(); assert.equal(readSession.getToolFeedbackAdmission(), null); await readSession.dispose();
console.log('Packed Agent runs and admits immutable reads without Guitar, Workbench, Tauri or UI.');
`);
const result = spawnSync(process.execPath, [join(scratch, "smoke.mjs")], { cwd: scratch, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
if (result.status !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
