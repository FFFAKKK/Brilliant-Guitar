import test from "node:test";
import assert from "node:assert/strict";
import { fixtureFor } from "../src/fixtures/preview-scenarios.js";
import { applyFeedbackReview, validateSchemeName, openSchemeEditor, submitScheme, settleScheme,
  closeSchemeEditor, runFeedbackAction, finishFeedbackEdit, reconcileScheme, feedbackTitle, FEEDBACK_SAMPLES } from "../src/fixtures/feedback-review-state.js";
import { beginLayoutEdit, finishLayoutEdit, prepareLayoutFixture } from "../src/fixtures/layout-edit-state.js";
import { createFeedbackReviewView } from "../src/fixtures/feedback-review-view.js";
import { fitVisualTitle } from "../src/shell/visual-title.js";
import { h } from "../src/shell/dom.js";
import { withTestDocument } from "./support/dom-test-environment.js";
const fixture = (sample = "normal") => {
  const state = fixtureFor(); state.iconOrder = []; state.hiddenIcons = [];
  applyFeedbackReview(state, new URLSearchParams("feedbackReview=1&feedbackSample=" + sample)); prepareLayoutFixture(state); return state;
};
const finish = (state, confirm) => { if (!finishFeedbackEdit(state, confirm)) return false; return finishLayoutEdit(state, confirm); };
const save = (state, name) => { openSchemeEditor(state, "save"); state.feedbackReview.editor.name = name; return submitScheme(state); };

test("feedback review requires explicit opt-in and leaves normal fixture untouched", () => {
  const state = fixtureFor(), before = structuredClone(state);
  assert.equal(applyFeedbackReview(state, new URLSearchParams("feedbackReview=0")), false); assert.deepEqual(state, before);
  assert.equal(fixture("not-a-sample").feedbackReview.sample, "normal");
});
test("scheme configuration is rejected outside layout editing; builtin cannot rename or delete", () => {
  const state = fixture(), book = structuredClone(state.schemeBook);
  assert.equal(openSchemeEditor(state, "save"), false); assert.equal(runFeedbackAction(state, "scheme-select", "personal"), false);
  assert.equal(submitScheme(state), null); assert.deepEqual(state.schemeBook, book);
  beginLayoutEdit(state); assert.equal(openSchemeEditor(state, "rename"), false); assert.equal(openSchemeEditor(state, "delete"), false);
});
test("names validate empty, length, Unicode, controls and duplicates without changing schemes", () => {
  const state = fixture(), before = structuredClone(state.schemeBook);
  for (const name of [null, "  ", "x".repeat(41), "a\nb", "a/b", "a\\b", "默认方案"]) assert.ok(validateSchemeName(state, name).error, String(name));
  assert.equal(validateSchemeName(state, " 练习 ").name, "练习"); assert.equal(validateSchemeName(state, "🙂".repeat(40)).error, "");
  state.schemeBook.entries.push({ id: "case", name: "Workspace" });
  assert.ok(validateSchemeName(state, "workspace").error); assert.equal(validateSchemeName(state, "workspace", "case").error, "");
  state.schemeBook.entries.pop(); assert.deepEqual(state.schemeBook, before);
});
test("pending submission rejects duplicates and layout confirm; cancel prevents late completion", () => {
  const state = fixture(); beginLayoutEdit(state); const before = structuredClone(state.schemeBook), token = save(state, "新方案");
  assert.ok(token); assert.equal(submitScheme(state), null); assert.equal(finish(state, true), false); assert.equal(state.assembly, true);
  state.leftWidth = 300; state.voiceOpen = true; finish(state, false);
  assert.deepEqual(state.schemeBook, before); assert.equal(state.leftWidth, 300); assert.equal(state.voiceOpen, true);
  assert.equal(settleScheme(state, token), false); assert.equal(state.feedbackReview.operation, null);
});
test("successful schemes and deletion share the enclosing confirm/cancel transaction", () => {
  const state = fixture(), before = structuredClone(state.schemeBook); beginLayoutEdit(state);
  assert.equal(settleScheme(state, save(state, "新方案")), true); assert.equal(state.preset, "新方案");
  openSchemeEditor(state, "rename"); state.feedbackReview.editor.name = "改名"; settleScheme(state, submitScheme(state)); assert.equal(state.preset, "改名");
  openSchemeEditor(state, "delete"); settleScheme(state, submitScheme(state)); assert.equal(state.preset, "默认方案");
  finish(state, false); assert.deepEqual(state.schemeBook, before);
  beginLayoutEdit(state); settleScheme(state, save(state, "已确认")); finish(state, true); assert.equal(state.preset, "已确认");
});
test("scheme selection only applies content configuration and cancels without restoring workspace geometry", () => {
  const state = fixture(); state.schemeBook.entries[1].content.enabled = ["B"];
  const before = structuredClone(state.enabled); beginLayoutEdit(state); state.topHeight = 96;
  assert.equal(runFeedbackAction(state, "scheme-select", "personal"), true); assert.deepEqual(state.enabled, ["B"]);
  finish(state, false); assert.deepEqual(state.enabled, before); assert.equal(state.topHeight, 96);
});
test("known failure retains name and original scheme; a new completion cannot accept an old token", () => {
  const state = fixture(); beginLayoutEdit(state); const token = save(state, "名称保留"), before = structuredClone(state.schemeBook);
  settleScheme(state, token, "error"); assert.equal(state.feedbackReview.editor.name, "名称保留"); assert.deepEqual(state.schemeBook, before);
  const next = submitScheme(state); assert.notEqual(next, token); assert.equal(settleScheme(state, token), false);
  assert.equal(settleScheme(state, next), true); assert.equal(state.preset, "名称保留");
});
test("unknown result cannot retry or confirm and is reconciled without repeating the operation", () => {
  const state = fixture("unknown"), serial = state.feedbackReview.serial;
  assert.equal(submitScheme(state), null); assert.equal(openSchemeEditor(state, "save"), false); assert.equal(closeSchemeEditor(state), false);
  assert.equal(finish(state, true), false); assert.equal(reconcileScheme(state), true);
  assert.equal(state.feedbackReview.serial, serial); assert.equal(state.preset, "练习工作区"); assert.equal(finish(state, true), true);
});
test("unknown report survives layout cancel and later checking cannot resurrect its draft", () => {
  const state = fixture("unknown"), before = structuredClone(state.assemblyBefore.schemeBook);
  finish(state, false); assert.equal(feedbackTitle(state).attention, true); assert.equal(state.feedbackReview.report.status, "unknown");
  assert.equal(reconcileScheme(state), true); assert.deepEqual(state.schemeBook, before); assert.equal(state.preset, "默认方案");
});
test("checking an old unknown operation in a new edit session does not claim new scheme changes", () => {
  const state = fixture("unknown"); finish(state, false); beginLayoutEdit(state);
  const before = structuredClone(state.schemeBook); assert.equal(reconcileScheme(state), true);
  assert.deepEqual(state.schemeBook, before); assert.match(state.feedbackReview.message, /保持取消后的状态/);
});
test("viewing and closing important feedback never resolves it or opens a sidebar", () => {
  const state = fixture("hidden-source"); assert.equal(state.rightOpen, false);
  runFeedbackAction(state, "feedback-details"); assert.equal(state.feedbackReview.report.seen, true); runFeedbackAction(state, "feedback-close");
  assert.equal(state.feedbackReview.detailsOpen, false); assert.equal(state.rightOpen, false); assert.equal(feedbackTitle(state).attention, true);
});
test("stopping the pending editor prevents late completion while layout edit remains active", () => {
  const state = fixture("saving"), token = state.feedbackReview.operation.token;
  assert.equal(closeSchemeEditor(state), true); assert.equal(state.assembly, true); assert.equal(settleScheme(state, token), false);
});
test("sample views have no null text and show unambiguous status, readonly and fallback semantics", async () => {
  await withTestDocument(({ document }) => {
    for (const sample of FEEDBACK_SAMPLES) {
      const state = fixture(sample), view = createFeedbackReviewView({ state, dispatch() {} });
      const root = h("div", {}, view.title(), view.schemes(), view.details()); document.body.append(root);
      assert.doesNotMatch(root.textContent, /null|undefined/); assert.equal(root.querySelectorAll("#scheme-name").length, ["saving", "save-failed", "unknown"].includes(sample) ? 1 : 0);
      if (sample === "unknown") { assert.equal(root.querySelector("#scheme-name").getAttribute("readonly"), ""); assert.equal(root.querySelector("#scheme-submit").disabled, true); }
      if (sample === "provider-missing") assert.equal(root.querySelector("#feedback-details").dataset.provider, "basic");
      root.remove();
    }
  });
});
test("critical title status keeps an accessible entry when secondary title capacity is exhausted", async () => {
  await withTestDocument(({ document }) => {
    const state = fixture("unknown"), view = createFeedbackReviewView({ state, dispatch() {} });
    const shell = h("div", {}, h("div", { class: "v-title-start" }), h("div", { class: "v-title-end" }, view.title()), h("span", { class: "v-document" }));
    document.body.append(shell); fitVisualTitle(shell, "名称", 640);
    assert.equal(shell.querySelector(".v-doc-state").hidden, false); assert.match(shell.querySelector(".v-doc-state").getAttribute("aria-label"), /结果待核对/);
  }, { width: 640 });
});
