import assert from "node:assert/strict";
import test from "node:test";
import { activeDockItem, DEFAULT_SHARED_DOCK_SELECTION, pairedDockItems, selectDockItem } from "../src/ui/shared-dock-selection.ts";

test("a shared dock selects a valid saved item and recovers when it moves or disappears", () => {
  const ids = ["notation.note-input", "notation.inspector"];
  const selected = selectDockItem(DEFAULT_SHARED_DOCK_SELECTION, "left", ids[1]!, ids);
  assert.equal(activeDockItem(ids, selected.left), "notation.inspector");
  assert.equal(activeDockItem(["notation.note-input"], selected.left), "notation.note-input");
  assert.equal(activeDockItem([], selected.left), null);
  assert.equal(selectDockItem(selected, "left", "missing", ids), selected);
  assert.equal(selected.right, null);
});

test("only an explicit horizontal pair is displayed together; other items keep tab switching", () => {
  const zoom = { id: "zoom", inlineZone: "trailing" as const };
  const history = { id: "history", inlineZone: "leading" as const };
  assert.deepEqual(pairedDockItems("top", [zoom, history]), [history, zoom]);
  const transport = { id: "transport", inlineZone: "center" as const };
  assert.deepEqual(pairedDockItems("top", [zoom, transport, history]), [history, transport, zoom]);
  assert.equal(pairedDockItems("left", [zoom, history]), null);
  assert.equal(pairedDockItems("top", [zoom, history, { id: "note" }]), null);
  assert.equal(pairedDockItems("bottom", [zoom, { id: "note" }]), null);
});
