import assert from "node:assert/strict";
import test from "node:test";

import {
  CapabilityBackedScoreChangeSetPort,
  ScoreChangeSetPortError,
} from "../src/agent/score-change-set-port.ts";
import { ScoreChangeSetClient } from "../src/services/score-change-set-port.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";

const preparationContext = {
  preparationInvocationId: "prep-1",
  workspaceId: "workspace-1",
  documentPrecondition: { documentId: "score-1", documentVersion: 7 },
} as const;

test("ScoreChangeSetPort prepares through typed host commands without the generic Agent RPC", async () => {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  const invoke = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    calls.push({ command, args: args ?? {} });
    if (command === "workbench_score_prepare_tempo_change_v1") return {
      changeSetId: `sha256:${"a".repeat(64)}`,
      kind: "score-tempo",
      documentId: "score-1",
      baseDocumentVersion: 7,
      beforeTempoBpm: 96,
      afterTempoBpm: 132,
    } as T;
    if (command === "workbench_score_prepare_metadata_transaction_v1") return {
      changeSetId: `sha256:${"b".repeat(64)}`,
      kind: "score-metadata-transaction",
      documentId: "score-1",
      baseDocumentVersion: 7,
      operations: ["set-title", "set-tempo"],
      before: { title: "练习曲", tempoBpm: 96 },
      after: { title: "夜曲", tempoBpm: 132 },
    } as T;
    throw new Error(`unexpected command ${command}`);
  };
  const client = new ScoreChangeSetClient(
    new TauriWorkbenchHostBridge(invoke),
    "workspace-1",
  );

  const changeSet = await client.prepareTempoChange({ tempoBpm: 132 }, preparationContext);
  const metadata = await client.prepareMetadataTransaction(
    { title: "夜曲", tempoBpm: 132 },
    preparationContext,
  );

  assert.equal(changeSet.afterTempoBpm, 132);
  assert.equal(metadata.after.title, "夜曲");
  assert.deepEqual(calls, [
    {
      command: "workbench_score_prepare_tempo_change_v1",
      args: {
        workspaceId: "workspace-1",
        expectedDocumentId: "score-1",
        expectedDocumentVersion: 7,
        input: { tempoBpm: 132 },
      },
    },
    {
      command: "workbench_score_prepare_metadata_transaction_v1",
      args: {
        workspaceId: "workspace-1",
        expectedDocumentId: "score-1",
        expectedDocumentVersion: 7,
        input: { title: "夜曲", tempoBpm: 132 },
      },
    },
  ]);
  assert.equal(calls.some(({ command }) => command === "workbench_agent_invoke_capability_v1"), false);
});

test("ScoreChangeSetPort keeps legacy preparation transport behind a typed method", async () => {
  const requests: unknown[] = [];
  const port = new CapabilityBackedScoreChangeSetPort({
    async invoke(request) {
      requests.push(request);
      return {
        status: "completed" as const,
        invocationId: request.invocationId,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: {
          changeSetId: `sha256:${"a".repeat(64)}`,
          kind: "score-tempo" as const,
          documentId: "score-1",
          baseDocumentVersion: 7,
          beforeTempoBpm: 96,
          afterTempoBpm: 132,
        },
      };
    },
  });

  const changeSet = await port.prepareTempoChange(
    { tempoBpm: 132 },
    preparationContext,
  );

  assert.equal(changeSet.afterTempoBpm, 132);
  assert.deepEqual(requests, [{
    invocationId: "prep-1",
    capabilityId: "score.prepare-tempo-change",
    contractVersion: 1,
    workspaceId: "workspace-1",
    documentPrecondition: { documentId: "score-1", documentVersion: 7 },
    input: { tempoBpm: 132 },
  }]);
});

test("ScoreChangeSetPort rejects malformed preparation data at the typed boundary", async () => {
  const port = new CapabilityBackedScoreChangeSetPort({
    async invoke(request) {
      return {
        status: "completed" as const,
        invocationId: request.invocationId,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: { afterTempoBpm: 132 },
      };
    },
  });

  await assert.rejects(
    port.prepareTempoChange(
      { tempoBpm: 132 },
      preparationContext,
    ),
    (error: unknown) => error instanceof ScoreChangeSetPortError
      && error.outcome === "definite-failure"
      && error.message === "Prepared mutation returned invalid data",
  );
});

test("ScoreChangeSetPort rejects invalid input before calling the typed host", async () => {
  let hostCalls = 0;
  const port = new ScoreChangeSetClient({
    async prepareScoreTempoChange() { hostCalls += 1; return null; },
  }, "workspace-1");

  await assert.rejects(
    port.prepareTempoChange({ tempoBpm: 0 }, preparationContext),
    (error: unknown) => error instanceof ScoreChangeSetPortError
      && error.outcome === "definite-failure"
      && error.message === "Score tempo ChangeSet input is invalid",
  );
  assert.equal(hostCalls, 0);
});

test("ScoreChangeSetPort binds a prepared result to the requested document and value", async () => {
  const port = new ScoreChangeSetClient({
    async prepareScoreTempoChange() {
      return {
        changeSetId: `sha256:${"a".repeat(64)}`,
        kind: "score-tempo",
        documentId: "other-score",
        baseDocumentVersion: 8,
        beforeTempoBpm: 96,
        afterTempoBpm: 144,
      };
    },
  }, "workspace-1");

  await assert.rejects(
    port.prepareTempoChange({ tempoBpm: 132 }, preparationContext),
    (error: unknown) => error instanceof ScoreChangeSetPortError
      && error.outcome === "definite-failure"
      && error.message === "Prepared tempo ChangeSet does not match the request",
  );
});

test("ScoreChangeSetPort rejects invalid preparation context before calling the host", async () => {
  let hostCalls = 0;
  const port = new ScoreChangeSetClient({
    async prepareScoreTempoChange() { hostCalls += 1; return null; },
  }, "workspace-1");

  await assert.rejects(
    port.prepareTempoChange({ tempoBpm: 132 }, {
      ...preparationContext,
      documentPrecondition: { documentId: "", documentVersion: -1 },
    }),
    (error: unknown) => error instanceof ScoreChangeSetPortError
      && error.outcome === "definite-failure"
      && error.message === "Score ChangeSet preparation context is invalid",
  );
  assert.equal(hostCalls, 0);
});

test("ScoreChangeSetPort binds metadata results to every requested field", async () => {
  const port = new ScoreChangeSetClient({
    async prepareScoreMetadataTransaction() {
      return {
        changeSetId: `sha256:${"b".repeat(64)}`,
        kind: "score-metadata-transaction",
        documentId: "score-1",
        baseDocumentVersion: 7,
        operations: ["set-title", "set-tempo"],
        before: { title: "练习曲", tempoBpm: 96 },
        after: { title: "错误标题", tempoBpm: 144 },
      };
    },
  }, "workspace-1");

  await assert.rejects(
    port.prepareMetadataTransaction(
      { title: "夜曲", tempoBpm: 132 },
      preparationContext,
    ),
    (error: unknown) => error instanceof ScoreChangeSetPortError
      && error.outcome === "definite-failure"
      && error.message === "Prepared metadata ChangeSet does not match the request",
  );
});
