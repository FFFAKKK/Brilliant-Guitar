import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL_INPUT_POLICY, parseModelInputPolicy, parseModelInputTokenBudget } from "../src/contracts/model-input-policy.ts";

test("input policy has exact versioned fields, bounded integers and explicit capacity reserve", () => {
  assert.deepEqual(parseModelInputPolicy(DEFAULT_MODEL_INPUT_POLICY), { schemaVersion: 1, inputTokenBudget: 8192, declaredContextWindow: null });
  for (const inputTokenBudget of [1024, 65536]) assert.equal(parseModelInputTokenBudget(inputTokenBudget), inputTokenBudget);
  for (const inputTokenBudget of [null, "16384", 1023, 65537, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => parseModelInputTokenBudget(inputTokenBudget));
  for (const value of [null, [], {}, { ...DEFAULT_MODEL_INPUT_POLICY, schemaVersion: 2 }, { ...DEFAULT_MODEL_INPUT_POLICY, extra: true },
    { ...DEFAULT_MODEL_INPUT_POLICY, declaredContextWindow: 0 }, { ...DEFAULT_MODEL_INPUT_POLICY, declaredContextWindow: 1048577 },
    { ...DEFAULT_MODEL_INPUT_POLICY, declaredContextWindow: 9691 }, { ...DEFAULT_MODEL_INPUT_POLICY, declaredContextWindow: 9692.5 }]) assert.throws(() => parseModelInputPolicy(value));
  const policy = parseModelInputPolicy({ ...DEFAULT_MODEL_INPUT_POLICY, declaredContextWindow: 9692 });
  assert.equal(policy.declaredContextWindow, 9692); assert.ok(Object.isFrozen(policy));
});
