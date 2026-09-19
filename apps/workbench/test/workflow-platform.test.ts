import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowContribution } from "../src/contracts/workflow.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { SCORE_APPLICATION_PLUGIN } from "../src/plugins/score-application-plugin.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

function workflow(id: string, operationId: string): WorkflowContribution {
  return {
    id,
    contractVersion: 1,
    name: id,
    description: `Workflow ${id}`,
    runtime: "agent-orchestration-v1",
    operationIds: [operationId],
    entryOperationIds: [operationId],
  };
}

function platform(): PluginPlatform {
  return new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
}

test("workflow directory groups active workflows by owner plugin", () => {
  const instance = platform();
  const optional = definePlugin({
    id: "test.workflow.optional",
    name: "Optional workflows",
    version: "1.0.0",
    activation: "user",
    workflows: [workflow("test.workflow.optional.run", "test.operation.optional")],
  });
  instance.registerAll([SCORE_APPLICATION_PLUGIN, optional]);
  instance.start();

  assert.deepEqual(instance.workflows().listByPlugin("brilliant.score").map((item) => item.id), [
    "score.inspect",
    "score.edit-metadata",
  ]);
  assert.equal(instance.workflows().listByPlugin(optional.id).length, 0);
  assert.equal(instance.workflows().get("score.inspect")?.ownerPluginVersion, "1.0.0");
});
test("running plugin session freezes workflow contributions until restart", () => {
  const instance = platform();
  const optional = definePlugin({
    id: "test.workflow.frozen",
    name: "Frozen workflows",
    version: "1.0.0",
    activation: "user",
    workflows: [workflow("test.workflow.frozen.run", "test.operation.frozen")],
  });
  instance.register(optional);
  instance.activate(optional.id);
  instance.start();

  assert.equal(instance.workflows().get("test.workflow.frozen.run")?.ownerPluginId, optional.id);
  assert.equal(instance.deactivate(optional.id).effect, "restart-required");
  assert.equal(instance.workflows().get("test.workflow.frozen.run")?.ownerPluginId, optional.id);
  assert.throws(() => instance.register(definePlugin({
    id: "test.workflow.late",
    name: "Late workflows",
    version: "1.0.0",
    workflows: [workflow("test.workflow.late.run", "test.operation.late")],
  })), /already started/);
});

test("duplicate workflow IDs fail only the conflicting plugin", () => {
  const instance = platform();
  instance.registerAll([
    definePlugin({
      id: "test.workflow.owner",
      name: "Owner",
      version: "1.0.0",
      workflows: [workflow("test.workflow.shared", "test.operation.first")],
    }),
    definePlugin({
      id: "test.workflow.conflict",
      name: "Conflict",
      version: "1.0.0",
      workflows: [workflow("test.workflow.shared", "test.operation.second")],
    }),
  ]);
  instance.start();

  assert.equal(instance.workflows().get("test.workflow.shared")?.ownerPluginId, "test.workflow.owner");
  assert.equal(instance.list().find((item) => item.manifest.id === "test.workflow.conflict")?.status, "failed");
});
