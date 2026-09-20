import assert from "node:assert/strict";
import test from "node:test";

import {
  CapabilityBackedScoreChangeSetPort,
  ScoreChangeSetPortError,
} from "../src/agent/score-change-set-port.ts";
import { ScoreChangeSetClient } from "../src/services/score-change-set-port.ts";
import type { ScoreChangeSetPreparationContext } from "../src/services/score-change-set-port.ts";
import type { ScoreUpdateMetadataInputV1 } from "../src/contracts/capability.ts";
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

for (const mismatch of [
  { documentId: "other-score" },
  { baseDocumentVersion: 8 },
  { afterTempoBpm: 144 },
]) {
  test(`ScoreChangeSetPort rejects a tempo result with mismatched ${Object.keys(mismatch)[0]}`, async () => {
    const port = new ScoreChangeSetClient({
      async prepareScoreTempoChange() {
        return {
          changeSetId: `sha256:${"a".repeat(64)}`,
          kind: "score-tempo",
          documentId: "score-1",
          baseDocumentVersion: 7,
          beforeTempoBpm: 96,
          afterTempoBpm: 132,
          ...mismatch,
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
}

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

for (const mismatch of [
  { name: "documentId", data: { documentId: "other-score" } },
  { name: "baseDocumentVersion", data: { baseDocumentVersion: 8 } },
  { name: "title", data: { after: { title: "错误标题", tempoBpm: 132 } } },
  { name: "tempoBpm", data: { after: { title: "夜曲", tempoBpm: 144 } } },
]) {
  test(`ScoreChangeSetPort rejects a metadata result with mismatched ${mismatch.name}`, async () => {
    const port = new ScoreChangeSetClient({
      async prepareScoreMetadataTransaction() {
        return {
          changeSetId: `sha256:${"b".repeat(64)}`,
          kind: "score-metadata-transaction",
          documentId: "score-1",
          baseDocumentVersion: 7,
          operations: ["set-title", "set-tempo"],
          before: { title: "练习曲", tempoBpm: 96 },
          after: { title: "夜曲", tempoBpm: 132 },
          ...mismatch.data,
        };
      },
    }, "workspace-1");

    await assert.rejects(
      port.prepareMetadataTransaction({ title: "夜曲", tempoBpm: 132 }, preparationContext),
      (error: unknown) => error instanceof ScoreChangeSetPortError
        && error.outcome === "definite-failure"
        && error.message === "Prepared metadata ChangeSet does not match the request",
    );
  });
}

for (const input of [{ title: "夜曲" }, { tempoBpm: 132 }]) {
  test(`ScoreChangeSetPort rejects unrequested changes in a ${Object.keys(input)[0]}-only request`, async () => {
    const port = new ScoreChangeSetClient({
      async prepareScoreMetadataTransaction() {
        return {
          changeSetId: `sha256:${"b".repeat(64)}`,
          kind: "score-metadata-transaction",
          documentId: "score-1",
          baseDocumentVersion: 7,
          operations: ["set-title", "set-tempo"],
          before: { title: "练习曲", tempoBpm: 96 },
          after: { title: "夜曲", tempoBpm: 132 },
        };
      },
    }, "workspace-1");

    await assert.rejects(
      port.prepareMetadataTransaction(input, preparationContext),
      (error: unknown) => error instanceof ScoreChangeSetPortError
        && error.outcome === "definite-failure"
        && error.message === "Prepared metadata ChangeSet does not match the request",
    );
  });
}

const partialMetadataCases: readonly {
  readonly name: string;
  readonly input: ScoreUpdateMetadataInputV1;
  readonly operations: readonly string[];
  readonly after: { readonly title: string; readonly tempoBpm: number };
}[] = [
  { name: "title only", input: { title: "夜曲" }, operations: ["set-title"], after: { title: "夜曲", tempoBpm: 96 } },
  { name: "tempo only", input: { tempoBpm: 132 }, operations: ["set-tempo"], after: { title: "练习曲", tempoBpm: 132 } },
  { name: "unchanged requested title", input: { title: "练习曲", tempoBpm: 132 }, operations: ["set-tempo"], after: { title: "练习曲", tempoBpm: 132 } },
];

for (const scenario of partialMetadataCases) {
  test(`ScoreChangeSetPort accepts metadata changes with ${scenario.name}`, async () => {
    const changeSet = {
      changeSetId: `sha256:${"b".repeat(64)}`,
      kind: "score-metadata-transaction",
      documentId: "score-1",
      baseDocumentVersion: 7,
      operations: scenario.operations,
      before: { title: "练习曲", tempoBpm: 96 },
      after: scenario.after,
    };
    const port = new ScoreChangeSetClient({
      async prepareScoreMetadataTransaction() { return changeSet; },
    }, "workspace-1");

    assert.deepEqual(await port.prepareMetadataTransaction(scenario.input, preparationContext), changeSet);
  });
}

for (const operation of ["tempo", "metadata"] as const) {
  test(`ScoreChangeSetPort validates runtime context before ${operation} preparation`, async (t) => {
    const invalidContexts: readonly { readonly name: string; readonly value: unknown }[] = [
      { name: "null context", value: null },
      { name: "missing context", value: undefined },
      { name: "array context", value: [] },
      { name: "missing invocation id", value: { ...preparationContext, preparationInvocationId: undefined } },
      { name: "numeric invocation id", value: { ...preparationContext, preparationInvocationId: 42 } },
      { name: "empty invocation id", value: { ...preparationContext, preparationInvocationId: "" } },
      { name: "numeric workspace", value: { ...preparationContext, workspaceId: 42 } },
      { name: "empty workspace", value: { ...preparationContext, workspaceId: "" } },
      ...[
        { name: "missing precondition", value: undefined },
        { name: "null precondition", value: null },
        { name: "array precondition", value: [] },
        { name: "primitive precondition", value: "score-1" },
        { name: "numeric document id", value: { documentId: 42, documentVersion: 7 } },
        { name: "empty document id", value: { documentId: "", documentVersion: 7 } },
        { name: "oversized document id", value: { documentId: "a".repeat(257), documentVersion: 7 } },
        { name: "missing version", value: { documentId: "score-1" } },
        { name: "negative version", value: { documentId: "score-1", documentVersion: -1 } },
        { name: "fractional version", value: { documentId: "score-1", documentVersion: 7.5 } },
        { name: "infinite version", value: { documentId: "score-1", documentVersion: Infinity } },
        { name: "unsafe version", value: { documentId: "score-1", documentVersion: Number.MAX_SAFE_INTEGER + 1 } },
      ].map(({ name, value }) => ({ name, value: { ...preparationContext, documentPrecondition: value } })),
    ];
    for (const scenario of invalidContexts) {
      await t.test(scenario.name, async () => {
        let hostCalls = 0;
        const respond = async () => { hostCalls += 1; return null; };
        const port = new ScoreChangeSetClient({
          prepareScoreTempoChange: respond,
          prepareScoreMetadataTransaction: respond,
        }, "workspace-1");
        const context = scenario.value as ScoreChangeSetPreparationContext;

        await assert.rejects(
          operation === "tempo"
            ? port.prepareTempoChange({ tempoBpm: 132 }, context)
            : port.prepareMetadataTransaction({ title: "夜曲" }, context),
          (error: unknown) => error instanceof ScoreChangeSetPortError
            && error.outcome === "definite-failure"
            && error.message === "Score ChangeSet preparation context is invalid",
        );
        assert.equal(hostCalls, 0);
      });
    }
  });
}

test("ScoreChangeSetPort preserves the valid-context workspace mismatch error", async () => {
  let hostCalls = 0;
  const respond = async () => { hostCalls += 1; return null; };
  const port = new ScoreChangeSetClient({
    prepareScoreTempoChange: respond,
    prepareScoreMetadataTransaction: respond,
  }, "workspace-1");
  const context = { ...preparationContext, workspaceId: "other-workspace" };
  for (const operation of ["tempo", "metadata"] as const) {
    await assert.rejects(
      operation === "tempo"
        ? port.prepareTempoChange({ tempoBpm: 132 }, context)
        : port.prepareMetadataTransaction({ title: "夜曲" }, context),
      (error: unknown) => error instanceof ScoreChangeSetPortError
        && error.outcome === "definite-failure"
        && error.message === "Score ChangeSet workspace does not match",
    );
  }
  assert.equal(hostCalls, 0);
});
