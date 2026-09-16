import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { isWorkspaceId } from "../src/contracts/workspace-id.ts";

test("workspace identity accepts generated UUIDs and rejects stale storage values", () => {
  assert.equal(isWorkspaceId(randomUUID()), true);
  for (const value of [null, "", "undefined", "old-workspace", "0".repeat(35), `${"0".repeat(36)}x`]) {
    assert.equal(isWorkspaceId(value), false);
  }
});
