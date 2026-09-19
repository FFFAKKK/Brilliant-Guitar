import assert from "node:assert/strict";
import test from "node:test";

import { AgentIntentRouter } from "../src/agent/agent-intent-router.ts";

const router = new AgentIntentRouter();

test("intent router uses summary as the bounded default", () => {
  assert.deepEqual(router.route("请告诉我当前乐谱的情况"), {
    kind: "read",
    normalizedGoal: "请告诉我当前乐谱的情况",
    matchedIntents: [],
    selectedIntent: "summary",
    capabilityId: "score.read-summary",
    confidence: "default",
    requiresClarification: false,
    clarificationMessage: null,
  });
});

test("intent router maps metadata synonyms to one capability", () => {
  const route = router.route("请读取标题、作曲者和 BPM");

  assert.equal(route.selectedIntent, "metadata");
  assert.equal(route.capabilityId, "score.read-metadata");
  assert.deepEqual(route.matchedIntents, ["metadata"]);
  assert.equal(route.requiresClarification, false);
});

test("intent router accepts English structure terms", () => {
  const route = router.route("show the parts and staves");

  assert.equal(route.selectedIntent, "structure");
  assert.equal(route.capabilityId, "score.read-structure");
  assert.deepEqual(route.matchedIntents, ["structure"]);
});

test("intent router does not silently choose between conflicting read domains", () => {
  const route = router.route("读取标题和声部");

  assert.equal(route.selectedIntent, null);
  assert.equal(route.capabilityId, null);
  assert.deepEqual(route.matchedIntents, ["metadata", "structure"]);
  assert.equal(route.confidence, "ambiguous");
  assert.equal(route.requiresClarification, true);
  assert.equal(route.clarificationMessage, "这个任务同时涉及标题、作者和速度等元数据和声部、谱表和结构信息。请明确你想先读取哪一类信息。");
});

test("intent router normalizes case and surrounding whitespace", () => {
  const route = router.route("  Read the SCORE METADATA  ");

  assert.equal(route.normalizedGoal, "read the score metadata");
  assert.equal(route.selectedIntent, "metadata");
  assert.equal(route.capabilityId, "score.read-metadata");
});

test("intent router recognizes ordinal and stable-ID measure references", () => {
  const ordinal = router.route("读取第 3 到第 8 小节的结构");
  const stable = router.route("读取 measure-2 到 measure-4 的小节结构");

  assert.equal(ordinal.selectedIntent, "measures");
  assert.equal(ordinal.capabilityId, "score.read-measures");
  assert.deepEqual(ordinal.matchedIntents, ["measures"]);
  assert.equal(stable.selectedIntent, "measures");
  assert.equal(stable.capabilityId, "score.read-measures");
});

test("intent router recognizes the current measure selection without matching every ordinal phrase", () => {
  const selection = router.route("读取当前选中的小节");
  const voice = router.route("读取第一声部的结构");

  assert.equal(selection.capabilityId, "score.read-measures");
  assert.equal(voice.capabilityId, "score.read-structure");
});
