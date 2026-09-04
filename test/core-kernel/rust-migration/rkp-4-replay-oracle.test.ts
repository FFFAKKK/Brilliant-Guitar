import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  replayRustKernelStage4,
  type KernelStage4ReplayCommandWireV1,
  type KernelStage4ReplayWireV1,
  type RustKernelStage4CompleteNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import {
  canonicalJson,
  decodeOracleJsonlText,
  decodeOracleManifestText,
  sha256,
  type OracleObservationV1,
  type OracleOperationV1,
  type RustMigrationOracleScenarioV1,
} from "./oracle-schema";
import { assertRkp4DeepFrozen } from "./rkp-4-fixtures";

const SCENARIOS_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const QUALIFICATION_PATH =
  "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json";
const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RustKernelStage4CompleteNativeAddon;
const scenariosText = readFileSync(resolve(SCENARIOS_PATH), "utf8");
const scenarios = decodeOracleJsonlText(scenariosText);
const manifest = decodeOracleManifestText(readFileSync(resolve(MANIFEST_PATH), "utf8"));

const SELECTED_IDS = [
  "cross.submit-noop-persisted-dirty",
  "cross.undo-redo-tail-truncation",
  "cross.atomic-batch-commit",
  "cross.batch-child-rejection-zero-delta",
  "cross.semantic-replay-equality",
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), label);
  return value as Record<string, unknown>;
}

function assertHistoryProjection(
  actual: { readonly undoDepth: number; readonly redoDepth: number },
  expected: { readonly undoDepth: number; readonly redoDepth: number },
  label: string,
): void {
  assert.equal(actual.undoDepth, expected.undoDepth, `${label}.history.undo`);
  assert.equal(actual.redoDepth, expected.redoDepth, `${label}.history.redo`);
}

function assertReplayProjection(
  actual: KernelStage4ReplayWireV1,
  expected: Record<string, unknown>,
  label: string,
): void {
  assert.equal(actual.status, expected.status, `${label}.status`);
  assert.notEqual(actual.status, "invalid-initial-document", label);
  if (actual.status === "invalid-initial-document") return;
  assert.equal(actual.documentVersion, expected.documentVersion, `${label}.version`);
  assert.equal(
    canonicalJson(actual.finalDocument),
    canonicalJson(expected.finalDocument),
    `${label}.document`,
  );
  const expectedResults = expected.results;
  assert.ok(Array.isArray(expectedResults), `${label}.results`);
  assert.equal(actual.results.length, expectedResults.length, `${label}.result-count`);
  for (let index = 0; index < actual.results.length; index += 1) {
    const actualResult: KernelStage4ReplayCommandWireV1 | undefined =
      actual.results[index];
    const expectedResult = record(expectedResults[index], `${label}.results[${index}]`);
    assert.notEqual(actualResult, undefined);
    if (actualResult === undefined) continue;
    assert.equal(actualResult.status, expectedResult.status, `${label}.results[${index}].status`);
    assert.equal(
      actualResult.documentVersion,
      expectedResult.documentVersion,
      `${label}.results[${index}].version`,
    );
    assert.equal(
      actualResult.history.undoDepth,
      expectedResult.undoDepth,
      `${label}.results[${index}].undo`,
    );
    assert.equal(
      actualResult.history.redoDepth,
      expectedResult.redoDepth,
      `${label}.results[${index}].redo`,
    );
  }
}

function executeScenario(scenario: RustMigrationOracleScenarioV1): void {
  const created = createRustKernelSmokeSession(addon, scenario.initialDocument);
  assert.equal(created.result.status, "created", scenario.scenarioId);
  if (!("handle" in created)) throw new Error(`${scenario.scenarioId} create rejected`);
  const session = createRustKernelStage4Session(addon, created.handle);
  const subscriptions = new Map<string, () => void>();
  const publishedEvents: unknown[] = [];
  const callbackTrace: string[] = [];

  for (let index = 0; index < scenario.operations.length; index += 1) {
    const operation = scenario.operations[index];
    const observation = scenario.observations[index];
    assert.notEqual(operation, undefined);
    assert.notEqual(observation, undefined);
    if (operation === undefined || observation === undefined) continue;
    const expected = record(observation.result, `${scenario.scenarioId}.${index}.result`);
    executeOperation(
      session,
      operation,
      observation,
      expected,
      subscriptions,
      publishedEvents,
      callbackTrace,
      scenario.scenarioId,
    );

    const state = session.read();
    assert.equal(state.status, "ok", `${scenario.scenarioId}.${index}.read`);
    if (state.status !== "ok") continue;
    assert.equal(
      state.value.snapshot.documentVersion,
      observation.state.documentVersion,
      `${scenario.scenarioId}.${index}.state.version`,
    );
    assertHistoryProjection(
      state.value.history,
      observation.state.history,
      `${scenario.scenarioId}.${index}.state`,
    );
    assert.equal(state.value.dirty, observation.state.dirty, `${scenario.scenarioId}.${index}.dirty`);
    assert.notEqual(state.value.snapshot.document, null, `${scenario.scenarioId}.${index}.document`);
    assert.equal(
      sha256(canonicalJson(state.value.snapshot.document)),
      observation.state.documentSha256,
      `${scenario.scenarioId}.${index}.document-hash`,
    );
    assert.equal(
      canonicalJson(publishedEvents),
      canonicalJson(observation.publishedEvents),
      `${scenario.scenarioId}.${index}.events`,
    );
    assert.deepEqual(callbackTrace, observation.callbackTrace, `${scenario.scenarioId}.${index}.trace`);
    publishedEvents.splice(0);
    callbackTrace.splice(0);
  }

  const final = session.read();
  assert.equal(final.status, "ok", `${scenario.scenarioId}.final`);
  if (final.status === "ok") {
    assert.equal(canonicalJson(final.value.snapshot.document), canonicalJson(scenario.finalDocument));
  }
}

function executeOperation(
  session: ReturnType<typeof createRustKernelStage4Session>,
  operation: OracleOperationV1,
  observation: OracleObservationV1,
  expected: Record<string, unknown>,
  subscriptions: Map<string, () => void>,
  publishedEvents: unknown[],
  callbackTrace: string[],
  scenarioId: string,
): void {
  const label = `${scenarioId}.${operation.operationIndex}.${operation.kind}`;
  switch (operation.kind) {
    case "subscribe": {
      const subscriptionId = String(operation.subscriptionId);
      const result = session.subscribe((event) => {
        publishedEvents.push(event);
        callbackTrace.push(`${subscriptionId}:${event.eventType}`);
      });
      assert.equal(result.status, "subscribed", label);
      if (result.status === "subscribed") subscriptions.set(subscriptionId, result.unsubscribe);
      assert.equal(expected.status, "subscribed", label);
      assert.equal(expected.subscriptionId, subscriptionId, label);
      break;
    }
    case "unsubscribe": {
      const subscriptionId = String(operation.subscriptionId);
      const unsubscribe = subscriptions.get(subscriptionId);
      assert.notEqual(unsubscribe, undefined, label);
      unsubscribe?.();
      subscriptions.delete(subscriptionId);
      assert.equal(expected.status, "completed", label);
      assert.equal(expected.subscriptionId, subscriptionId, label);
      break;
    }
    case "submit":
      assertCommandProjection(session.submit(operation.input), expected, label);
      break;
    case "undo":
      assertCommandProjection(session.undo(), expected, label);
      break;
    case "redo":
      assertCommandProjection(session.redo(), expected, label);
      break;
    case "mark-persisted": {
      const input = record(operation.input, `${label}.input`);
      const result = session.markPersisted(input);
      const expectedStatus = expected.status === "rejected" ? "checkpoint-rejected" : expected.status;
      assert.equal(result.status, expectedStatus, `${label}.status`);
      if (result.status !== "rejected") {
        assert.equal(result.value.documentVersion, expected.documentVersion, `${label}.version`);
        assert.equal(result.value.dirty, expected.dirty, `${label}.dirty`);
      }
      break;
    }
    case "read": {
      const result = session.read();
      assert.equal(result.status, "ok", label);
      assert.equal(expected.ok, true, label);
      break;
    }
    case "replay": {
      const result = replayRustKernelStage4(
        addon,
        operation.initialDocument,
        operation.commands,
      );
      assertReplayProjection(result, expected, label);
      break;
    }
    default:
      assert.fail(`${label} is outside the RKP-4 core-only projection`);
  }
  void observation;
}

function assertCommandProjection(
  result: ReturnType<ReturnType<typeof createRustKernelStage4Session>["submit"]>,
  expected: Record<string, unknown>,
  label: string,
): void {
  const expectedStatus = expected.status === "rejected" ? "command-rejected" : expected.status;
  assert.equal(result.status, expectedStatus, `${label}.status`);
  assert.notEqual(result.status, "rejected", label);
  if (result.status === "rejected") return;
  assert.equal(result.value.documentVersion, expected.documentVersion, `${label}.version`);
  assert.equal(result.value.history.undoDepth, expected.undoDepth, `${label}.undo`);
  assert.equal(result.value.history.redoDepth, expected.redoDepth, `${label}.redo`);
  if (result.status === "command-rejected") {
    assert.equal(canonicalJson(result.failure), canonicalJson(expected.failure), `${label}.failure`);
  }
}

test("RKP-4 mechanically selects immutable oracle rows 57-61 and excludes rows 62-64", () => {
  assert.equal(scenarios.length, 64);
  assert.equal(manifest.scenarioCount, 64);
  const selected = scenarios.slice(56, 61);
  assert.deepEqual(selected.map((scenario) => scenario.scenarioId), SELECTED_IDS);
  assert.ok(selected.every((scenario) => scenario.assemblyKind === "core-only"));
  assert.deepEqual(
    scenarios.slice(61, 64).map((scenario) => scenario.scenarioId),
    [
      "cross.integrated-two-module-order-availability",
      "cross.detached-extension-migration",
      "cross.assembly-mismatch-subscriber-isolation",
    ],
  );
  assert.equal(manifest.scenariosFileSha256, sha256(scenariosText));
  assert.equal(
    manifest.qualificationV2ContractSha256,
    sha256(readFileSync(resolve(QUALIFICATION_PATH))),
  );
});

test("oracle rows 57-61 match native Stage-4 history, dirty, event, batch, undo/redo and replay projections", () => {
  for (const scenario of scenarios.slice(56, 61)) executeScenario(scenario);
});

test("semantic replay is deterministic, deeply frozen and isolated from live sessions and subscribers", () => {
  const scenario = scenarios[60];
  assert.notEqual(scenario, undefined);
  if (scenario === undefined) return;
  const replayOperation = scenario.operations.find((operation) => operation.kind === "replay");
  assert.notEqual(replayOperation, undefined);
  if (replayOperation === undefined) return;

  const created = createRustKernelSmokeSession(addon, scenario.initialDocument);
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) return;
  const live = createRustKernelStage4Session(addon, created.handle);
  let liveEvents = 0;
  live.subscribe(() => {
    liveEvents += 1;
  });

  const first = replayRustKernelStage4(
    addon,
    replayOperation.initialDocument,
    replayOperation.commands,
  );
  const second = replayRustKernelStage4(
    addon,
    replayOperation.initialDocument,
    replayOperation.commands,
  );
  assert.equal(canonicalJson(first), canonicalJson(second));
  assertRkp4DeepFrozen(first);
  assert.equal(liveEvents, 0);
  const liveState = live.read();
  assert.equal(liveState.status, "ok");
  if (liveState.status === "ok") {
    assert.equal(liveState.value.snapshot.documentVersion, 0);
    assert.equal(liveState.value.dirty, false);
  }
});

test("semantic replay stops at the first rejection and rejects history/effect/snapshot/operation envelopes", () => {
  const scenario = scenarios[60];
  if (scenario === undefined) return;
  const replayOperation = scenario.operations.find((operation) => operation.kind === "replay");
  if (replayOperation === undefined || !Array.isArray(replayOperation.commands)) return;
  const valid = replayOperation.commands[0];
  const neverRun = replayOperation.commands[1];
  for (const forbidden of ["history", "changeSet", "events", "snapshot", "kind"] as const) {
    const invalid =
      forbidden === "kind"
        ? { kind: "undo" }
        : { ...(record(valid, "valid command")), [forbidden]: {} };
    const result = replayRustKernelStage4(addon, scenario.initialDocument, [
      valid,
      invalid,
      neverRun,
    ]);
    assert.equal(result.status, "rejected", forbidden);
    if (result.status !== "rejected") continue;
    assert.equal(result.failedCommandIndex, 1, forbidden);
    assert.equal(result.results.length, 2, forbidden);
    assert.equal(result.results[0]?.status, "committed", forbidden);
    assert.equal(result.results[1]?.status, "command-rejected", forbidden);
    assert.equal(result.failure.code, "command.invalid-envelope", forbidden);
    assert.equal(result.documentVersion, 1, forbidden);
  }
});

test("hostile getter, function and sparse command inputs reject before the native replay export", () => {
  let calls = 0;
  const fakeAddon = {
    replayKernelStage4V1(): Buffer {
      calls += 1;
      return Buffer.alloc(0);
    },
  };
  const initialDocument = scenarios[60]?.initialDocument;
  const sparse = new Array<unknown>(1);
  const getter = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(getter, "commandVersion", {
    enumerable: true,
    get(): number {
      throw new Error("must not run");
    },
  });
  for (const commands of [sparse, [getter], [() => undefined]]) {
    const result = replayRustKernelStage4(fakeAddon, initialDocument, commands);
    assert.equal(result.status, "invalid-initial-document");
    if (result.status === "invalid-initial-document") {
      assert.equal(result.failure.code, "bridge.capture-invalid");
    }
  }
  assert.equal(calls, 0);
});
