import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ContextBuilder } from "../src/runtime/context-builder.ts";
import type { AgentContextItem } from "../src/runtime/agent-contracts.ts";
import { STANDALONE_CONTEXT_POLICY, type ContextSelectionPlan } from "../src/contracts/context-selection.ts";

// Production never imports this evaluator; it calls no model or resource tools.
interface Turn { id: string; user: string; assistant: string; status: "complete" | "failed" | "cancelled" | "interrupted" }
interface Sample { id: string; category: string; split: "development" | "holdout"; critical: boolean; goal: string;
  optionalSlots: number; historyTurnBudget: number; turns: Turn[]; neededTurnIds: string[]; whyNeeded: string }
type Strategy = "recency" | "lexical-current" | "lexical-current-and-recent";
const strategies: Strategy[] = ["recency", "lexical-current", "lexical-current-and-recent"];
const parameters = Object.freeze({ maxScanCodePoints: 2048, maxTerms: 256, tokenBudget: 8192,
  score: "unique-query-term-coverage", tieBreak: "newest-first", textSource: "user-only" });

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function parseSamples(value: unknown): Sample[] {
  assert.ok(exact(value, ["schemaVersion", "description", "cases"]) && value.schemaVersion === 1
    && typeof value.description === "string" && Array.isArray(value.cases), "Invalid evaluation dataset");
  const cases = value.cases as unknown[];
  assert.equal(cases.length, 20, "Frozen evaluation expects20 cases");
  const ids = new Set<string>();
  for (const sample of cases) {
    assert.ok(exact(sample, ["id", "category", "split", "critical", "goal", "optionalSlots", "historyTurnBudget", "turns", "neededTurnIds", "whyNeeded"]));
    assert.ok(typeof sample.id === "string" && /^c\d{2}$/.test(sample.id) && !ids.has(sample.id)); ids.add(sample.id);
    assert.ok(typeof sample.category === "string" && typeof sample.goal === "string" && sample.goal.trim()
      && typeof sample.whyNeeded === "string" && typeof sample.critical === "boolean"
      && ["development", "holdout"].includes(sample.split as string));
    assert.ok(Number.isSafeInteger(sample.optionalSlots) && (sample.optionalSlots as number) >= 0 && (sample.optionalSlots as number) <= 2);
    assert.equal(sample.historyTurnBudget, 16); assert.ok(Array.isArray(sample.turns) && Array.isArray(sample.neededTurnIds));
    const turnIds = new Set<string>();
    for (const turn of sample.turns) {
      assert.ok(exact(turn, ["id", "user", "assistant", "status"]));
      assert.ok(typeof turn.id === "string" && !turnIds.has(turn.id)); turnIds.add(turn.id);
      assert.ok(typeof turn.user === "string" && turn.user.trim() && typeof turn.assistant === "string" && turn.assistant.trim());
      assert.ok(["complete", "failed", "cancelled", "interrupted"].includes(turn.status as string));
    }
    assert.equal(new Set(sample.neededTurnIds).size, sample.neededTurnIds.length);
    for (const id of sample.neededTurnIds) {
      assert.ok(typeof id === "string" && sample.turns.some((turn: Turn) => turn.id === id && turn.status === "complete"));
    }
  }
  return cases as Sample[];
}

function terms(text: string): Set<string> {
  const scan = Array.from(text.normalize("NFKC").toLowerCase()).slice(0, parameters.maxScanCodePoints).join("");
  const values = new Set<string>();
  // Visit in text order so the term cap has one explicit stable meaning.
  for (const match of scan.matchAll(/[a-z0-9]+|\p{Script=Han}+/gu)) {
    const token = match[0];
    if (/^[a-z0-9]+$/u.test(token)) values.add(token);
    else {
      const chars = Array.from(token);
      if (chars.length === 1) values.add(chars[0]!);
      for (let i = 0; i + 1 < chars.length && values.size < parameters.maxTerms; ++i) values.add(chars[i]! + chars[i + 1]!);
    }
    if (values.size >= parameters.maxTerms) break;
  }
  return values;
}
assert.deepEqual(terms("MＩＤＩ CC ７４"), terms("midi cc 74"));
assert.deepEqual([...terms("八分音符")], ["八分", "分音", "音符"]);
assert.equal(terms("节奏".repeat(10)).size, 2);
assert.ok(terms(Array.from({ length: 500 }, (_, i) => `term${i}`).join(" ")).size <= parameters.maxTerms);
assert.equal(terms("x".repeat(2050) + "节奏").has("节奏"), false);

function rank(eligible: Turn[], query: Set<string>, slots: number) {
  const scores = eligible.map((turn, index) => {
    const candidate = terms(turn.user);
    const matches = [...query].filter((term) => candidate.has(term)).length;
    return { turnId: turn.id, index, matches, queryTerms: query.size, score: query.size ? matches / query.size : 0 };
  });
  const chosen = new Set([...scores].sort((a, b) => b.score - a.score || b.index - a.index).slice(0, slots).map((item) => item.turnId));
  return { selected: eligible.filter((turn) => chosen.has(turn.id)).map((turn) => turn.id), scores };
}
const raw = await readFile(new URL("./context-selection-cases.json", import.meta.url));
const canonicalDataset = raw.toString("utf8").replace(/\r\n/g, "\n");
const samples = parseSamples(JSON.parse(canonicalDataset));
assert.equal(samples.filter((sample) => sample.split === "development").length, 10);
assert.equal(samples.filter((sample) => sample.split === "holdout").length, 10);
const results = samples.map((sample) => {
  const successful = sample.turns.filter((turn) => turn.status === "complete");
  const window = successful.slice(-sample.historyTurnBudget);
  const recent = window.slice(-Math.min(2, sample.historyTurnBudget, window.length));
  const recentIds = new Set(recent.map((turn) => turn.id));
  const eligible = window.filter((turn) => !recentIds.has(turn.id));
  assert.ok(sample.neededTurnIds.every((id) => !recentIds.has(id)), "Labels must concern optional old turns");
  const items: AgentContextItem[] = window.map((turn) => ({ contextItemId: `conversation:${turn.id}`, kind: "task-history",
    content: { user: turn.user, assistant: turn.assistant }, sourceType: "conversation", sourceId: turn.id,
    documentId: null, documentVersion: null, scope: "evaluation-session", trustLevel: "user-provided", priority: "high",
    createdAt: 1, expiresAt: null, estimatedTokens: Math.ceil(JSON.stringify({ user: turn.user, assistant: turn.assistant }).length / 4) }));
  let plan: ContextSelectionPlan | undefined;
  const baseline = new ContextBuilder().build({ runId: `evaluation:${sample.id}`, goal: sample.goal, turnInput: sample.goal,
    runState: { lifecycle: "active", phase: "planning" }, workspace: { workspaceId: "evaluation-session", documentId: null, documentVersion: null, selection: null },
    items, now: 10, budget: { tokenBudget: parameters.tokenBudget, itemCountBudget: 4 + recent.length + sample.optionalSlots,
      historyTurnBudget: sample.historyTurnBudget, toolResultSizeBudget: 16384, rangeBudget: 0 } },
  { policy: STANDALONE_CONTEXT_POLICY, turnId: `turn:${sample.id}`, executedResultIds: new Set(), onSelection: (value) => { plan = value; } });
  assert.ok(plan); assert.equal(plan.report.status, "ready"); assert.equal(baseline.budget.exceeded, false);
  assert.deepEqual(plan.report.selected.filter((item) => item.reason === "recent-conversation").map((item) => item.contextItemId),
    recent.map((turn) => `conversation:${turn.id}`));
  const actual = baseline.contextItems.filter((item) => item.sourceType === "conversation" && !recentIds.has(item.sourceId)).map((item) => item.sourceId);
  assert.deepEqual(actual, sample.optionalSlots ? eligible.slice(-sample.optionalSlots).map((turn) => turn.id) : []);
  for (const item of baseline.contextItems.filter((item) => item.sourceType === "conversation")) {
    const source = window.find((turn) => turn.id === item.sourceId)!;
    assert.deepEqual(item.content, { user: source.user, assistant: source.assistant }, "Never clip a selected pair");
  }
  const current = rank(eligible, terms(sample.goal), sample.optionalSlots);
  const combined = rank(eligible, terms([sample.goal, ...recent.map((turn) => turn.user)].join("\n")), sample.optionalSlots);
  const selected: Record<Strategy, string[]> = { recency: actual, "lexical-current": current.selected, "lexical-current-and-recent": combined.selected };
  for (const strategy of strategies) {
    assert.ok(selected[strategy].length <= sample.optionalSlots);
    assert.ok(selected[strategy].every((id) => eligible.some((turn) => turn.id === id)));
  }
  return { id: sample.id, category: sample.category, split: sample.split, critical: sample.critical,
    needed: sample.neededTurnIds, whyNeeded: sample.whyNeeded, protected: [...recentIds], eligible: eligible.map((turn) => turn.id),
    excludedUnsuccessful: sample.turns.filter((turn) => turn.status !== "complete").map((turn) => turn.id),
    outsideWindowNeeded: sample.neededTurnIds.filter((id) => !window.some((turn) => turn.id === id)),
    selected, scores: { current: current.scores, currentAndRecent: combined.scores } };
});
function metrics(rows: typeof results, strategy: Strategy) {
  const evidence = rows.filter((row) => row.needed.length > 0);
  const hits = (row: typeof results[number]) => row.needed.filter((id) => row.selected[strategy].includes(id)).length;
  const needed = evidence.reduce((sum, row) => sum + row.needed.length, 0);
  const retained = evidence.reduce((sum, row) => sum + hits(row), 0);
  const availableNeeded = evidence.reduce((sum, row) => sum + row.needed.length - row.outsideWindowNeeded.length, 0);
  return { evidenceCases: evidence.length, retainedSourceUnits: retained, neededSourceUnits: needed,
    sourceRecall: needed ? retained / needed : null, availableSourceUnits: availableNeeded,
    inWindowSourceRecall: availableNeeded ? retained / availableNeeded : null,
    fullyCoveredCases: evidence.filter((row) => hits(row) === row.needed.length).length,
    wins: evidence.filter((row) => hits(row) > row.needed.filter((id) => row.selected.recency.includes(id)).length).map((row) => row.id),
    losses: evidence.filter((row) => hits(row) < row.needed.filter((id) => row.selected.recency.includes(id)).length).map((row) => row.id),
    criticalLosses: evidence.filter((row) => row.critical && hits(row) < row.needed.filter((id) => row.selected.recency.includes(id)).length).map((row) => row.id) };
}
const summary = Object.fromEntries(["all", "development", "holdout"].map((split) => [split,
  Object.fromEntries(strategies.map((strategy) => [strategy, metrics(results.filter((row) => split === "all" || row.split === split), strategy)]))]));
const gate = Object.fromEntries(strategies.filter((strategy) => strategy !== "recency").map((strategy) => {
  const all = metrics(results, strategy), base = metrics(results, "recency");
  const held = metrics(results.filter((row) => row.split === "holdout"), strategy);
  const heldBase = metrics(results.filter((row) => row.split === "holdout"), "recency");
  return [strategy, { recallImproved: all.inWindowSourceRecall! > base.inWindowSourceRecall!,
    holdoutImproved: held.inWindowSourceRecall! > heldBase.inWindowSourceRecall!, noCriticalRegression: all.criticalLosses.length === 0,
    passes: all.inWindowSourceRecall! > base.inWindowSourceRecall! && held.inWindowSourceRecall! > heldBase.inWindowSourceRecall! && all.criticalLosses.length === 0 }];
}));
const output = { schemaVersion: 1, evaluatorVersion: "lexical-eval-v1", scope: "offline-synthetic-source-retrieval-not-answer-quality",
  datasetSha256: createHash("sha256").update(canonicalDataset, "utf8").digest("hex"), datasetHashEncoding: "utf8-lf",
  parameters, casesEvaluated: results.length, summary, gate,
  recommendation: Object.values(gate).some((value) => value.passes) ? "further-validation-only" : "retain-recency", results };
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === "--output", "Usage: compare-context-selection.mts [--output results.json]");
if (args.length) await writeFile(args[1]!, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ cases: output.casesEvaluated, datasetSha256: output.datasetSha256, summary, gate, recommendation: output.recommendation }, null, 2));
