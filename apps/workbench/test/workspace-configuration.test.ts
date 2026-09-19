import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WORKSPACE_CONFIGURATION, isWorkspaceConfigurationSnapshotV1, isWorkspaceConfigurationV1 }
  from "../src/contracts/workspace-configuration.ts";

test("workspace configuration accepts the versioned default document", () => {
  assert.equal(isWorkspaceConfigurationV1(DEFAULT_WORKSPACE_CONFIGURATION), true);
  assert.deepEqual(DEFAULT_WORKSPACE_CONFIGURATION.uiLayout.placements
    .filter((placement) => placement.slot === "top")
    .map((placement) => placement.componentId),
  ["notation.history-control", "playback.transport", "notation.paper-zoom"]);
  assert.equal(DEFAULT_WORKSPACE_CONFIGURATION.uiLayout.placements
    .find((placement) => placement.componentId === "playback.output")?.slot, "right");
  assert.equal(DEFAULT_WORKSPACE_CONFIGURATION.uiLayout.placements
    .find((placement) => placement.componentId === "agent.recovery-panel")?.slot, "right");
  assert.equal(isWorkspaceConfigurationSnapshotV1({
    configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: true, recoveredFromInvalid: false,
  }), true);
});

test("workspace configuration rejects duplicate components and invalid dimensions", () => {
  assert.equal(isWorkspaceConfigurationV1({
    ...DEFAULT_WORKSPACE_CONFIGURATION,
    uiLayout: {
      version: 2,
      placements: [
        ...DEFAULT_WORKSPACE_CONFIGURATION.uiLayout.placements,
        DEFAULT_WORKSPACE_CONFIGURATION.uiLayout.placements[0],
      ],
    },
  }), false);
  assert.equal(isWorkspaceConfigurationV1({
    ...DEFAULT_WORKSPACE_CONFIGURATION,
    inspectorWidth: Number.POSITIVE_INFINITY,
  }), false);
});
