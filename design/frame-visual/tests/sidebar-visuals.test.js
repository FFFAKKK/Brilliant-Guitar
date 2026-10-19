import test from "node:test";
import assert from "node:assert/strict";
import { applySidebarReview, moveVisualItem, moveReviewContent, orderedVisualContent, reviewSections, REVIEW_CONTENT } from "../src/fixtures/sidebar-visuals.js";

test("neutral review opt-in does not alter default fixture", () => {
  const state = { enabled: [], leftOpen: false };
  applySidebarReview(state, new URLSearchParams());
  assert.deepEqual(state, { enabled: [], leftOpen: false });
});
test("right review excludes left-only content without changing its declaration", () => {
  const state = { unavailable: [] };
  applySidebarReview(state, new URLSearchParams("presentation=grid&contentSide=right"));
  assert.deepEqual(state.enabled, ["A", "B", "C", "E"]);
  assert.deepEqual(REVIEW_CONTENT.find(item => item.id === "D").allowed, ["left"]);
});
test("visual order retains new declarations and ignores missing or duplicate ids", () => {
  const items = [{ id: "A" }, { id: "B" }, { id: "C" }];
  assert.deepEqual(orderedVisualContent(items, ["C", "gone", "C"]).map(item => item.id), ["C", "A", "B"]);
  assert.deepEqual(items.map(item => item.id), ["A", "B", "C"]);
});
test("boundary and unknown reorder preserves identity and leaves input intact", () => {
  const order = ["A", "B", "C"];
  assert.deepEqual(moveVisualItem(order, "A", -1), order);
  assert.deepEqual(moveVisualItem(order, "C", 1), order);
  assert.deepEqual(moveVisualItem(order, "unknown", 1), order);
  assert.deepEqual(moveVisualItem(order, "A", 2), ["B", "C", "A"]);
  assert.deepEqual(order, ["A", "B", "C"]);
});

test("mixed page sections own unique content identities and preserve per-item data", () => {
  const state = { unavailable: [] };
  applySidebarReview(state, new URLSearchParams("presentation=mixed"));
  state.contentInputs.B = "用户输入";
  const sections = reviewSections(state, REVIEW_CONTENT);
  assert.deepEqual(sections.map(section => [section.presentation, section.items.map(item => item.id)]), [["tabs", ["A", "D"]], ["grid", ["B", "C"]], ["list", ["E"]]]);
  const ids = sections.flatMap(section => section.items.map(item => item.id));
  assert.equal(new Set(ids).size, state.enabled.length);
  for (const presentation of ["grid", "list", "tabs", "mixed"]) {
    state.presentation = presentation;
    assert.deepEqual(new Set(reviewSections(state, REVIEW_CONTENT).flatMap(section => section.items.map(item => item.id))), new Set(state.enabled));
    assert.equal(state.contentInputs.B, "用户输入");
  }
});

test("mixed reorder only changes order inside the selected grid section", () => {
  const state = { presentation: "mixed", enabled: ["A", "B", "D", "C", "E"] };
  assert.deepEqual(moveReviewContent(state, REVIEW_CONTENT, "B", 1), ["A", "C", "D", "B", "E"]);
  assert.deepEqual(moveReviewContent(state, REVIEW_CONTENT, "D", -1), state.enabled);
  assert.deepEqual(state.enabled, ["A", "B", "D", "C", "E"]);
});

test("right mixed pages exclude left-only content and empty sections", () => {
  const state = {};
  applySidebarReview(state, new URLSearchParams("presentation=mixed&contentSide=right"));
  assert.ok(!reviewSections(state, REVIEW_CONTENT).flatMap(section => section.items).some(item => item.id === "D"));
  state.enabled = ["E"];
  assert.deepEqual(reviewSections(state, REVIEW_CONTENT).map(section => section.presentation), ["list"]);
});
