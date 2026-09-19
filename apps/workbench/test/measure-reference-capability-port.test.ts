import assert from "node:assert/strict";
import test from "node:test";

import type { AgentCapabilityPort } from "../src/agent/capability-port.ts";
import { MeasureReferenceAgentCapabilityPort } from "../src/agent/measure-reference-capability-port.ts";
import { MeasureReferenceReadService } from "../src/agent/measure-reference-read-service.ts";
import type {
  MeasureIndexPort,
  MeasureRangeReadPort,
} from "../src/agent/measure-reference-read-service.ts";

const index = {
  documentId: "score-1",
  documentVersion: 7,
  measureIds: ["intro-a", "verse-x", "bridge-q", "ending-z"],
} as const;

const context = {
  workspace: {
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 7,
    selection: null,
  },
  rangeBudget: 3,
} as const;

function rangePort(inputs: unknown[]): MeasureRangeReadPort {
  return {
    async readMeasureRange(input) {
      inputs.push(input);
      const start = index.measureIds.indexOf(input.startMeasureId as typeof index.measureIds[number]);
      const end = index.measureIds.indexOf(input.endMeasureId as typeof index.measureIds[number]);
      const measureIds = index.measureIds.slice(start, end + 1);
      return {
        status: "completed",
        invocationId: "internal-range",
        capabilityId: "score.read-measure-range",
        contractVersion: 1,
        data: {
          documentId: index.documentId,
          documentVersion: index.documentVersion,
          startMeasureId: input.startMeasureId,
          endMeasureId: input.endMeasureId,
          measureCount: measureIds.length,
          measures: measureIds.map((measureId) => ({
            measureId,
            meter: { numerator: 4, denominator: 4 },
            pickupDuration: null,
          })),
        },
      };
    },
  };
}

function createPort(inputs: unknown[], indexPort?: MeasureIndexPort) {
  const delegate: AgentCapabilityPort = {
    async invoke() {
      throw new Error("composite measure reads must not reach the transport delegate");
    },
  };
  return new MeasureReferenceAgentCapabilityPort(
    delegate,
    new MeasureReferenceReadService(indexPort ?? {
      async readMeasureIndex() { return { status: "completed", index }; },
    }, rangePort(inputs)),
  );
}

test("composite measure capability resolves ordinals and preserves the outer invocation identity", async () => {
  const inputs: unknown[] = [];
  const result = await createPort(inputs).invoke({
    invocationId: "outer-read",
    capabilityId: "score.read-measures",
    contractVersion: 1,
    workspaceId: "workspace-1",
    documentPrecondition: null,
    input: { reference: { kind: "ordinal-range", startOrdinal: 2, endOrdinal: 4 } },
  }, context);

  assert.deepEqual(inputs, [{
    startMeasureId: "verse-x",
    endMeasureId: "ending-z",
    maxMeasures: 3,
  }]);
  assert.equal(result.status, "completed");
  assert.equal(result.invocationId, "outer-read");
  assert.equal(result.capabilityId, "score.read-measures");
  assert.equal(result.contractVersion, 1);
});

test("current-selection references use the version-bound control-plane selection", async () => {
  const inputs: unknown[] = [];
  const result = await createPort(inputs).invoke({
    invocationId: "selection-read",
    capabilityId: "score.read-measures",
    contractVersion: 1,
    workspaceId: "workspace-1",
    documentPrecondition: null,
    input: { reference: { kind: "current-selection" } },
  }, {
    ...context,
    workspace: {
      ...context.workspace,
      selection: {
        kind: "measure-range",
        documentId: "score-1",
        documentVersion: 7,
        startMeasureId: "bridge-q",
        endMeasureId: "bridge-q",
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(inputs, [{
    startMeasureId: "bridge-q",
    endMeasureId: "bridge-q",
    maxMeasures: 1,
  }]);
});

test("range budgets reject resolved references before the atomic range read", async () => {
  const inputs: unknown[] = [];
  const result = await createPort(inputs).invoke({
    invocationId: "budgeted-read",
    capabilityId: "score.read-measures",
    contractVersion: 1,
    workspaceId: "workspace-1",
    documentPrecondition: null,
    input: { reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 4 } },
  }, { ...context, rangeBudget: 2 });

  assert.equal(result.status, "rejected");
  assert.equal("code" in result && result.code, "range-budget-exceeded");
  assert.deepEqual(inputs, []);
});

test("stale authoritative indices never reach the atomic range read", async () => {
  const inputs: unknown[] = [];
  const result = await createPort(inputs, {
    async readMeasureIndex() {
      return { status: "completed", index: { ...index, documentVersion: 6 } };
    },
  }).invoke({
    invocationId: "stale-read",
    capabilityId: "score.read-measures",
    contractVersion: 1,
    workspaceId: "workspace-1",
    documentPrecondition: null,
    input: { reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 1 } },
  }, context);

  assert.equal(result.status, "unavailable");
  assert.equal("code" in result && result.code, "measure-index.stale");
  assert.deepEqual(inputs, []);
});
