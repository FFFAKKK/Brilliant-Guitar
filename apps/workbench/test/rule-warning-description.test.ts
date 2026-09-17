import assert from "node:assert/strict";
import test from "node:test";
import type { StaffMeasure } from "../src/contracts/notation.ts";
import { describeMeasureRuleWarnings } from "../src/notation/rule-warning-description.ts";

function measure(denominator: number, overflow: { numerator: number; denominator: number } | null): StaffMeasure {
  return { id: "measure", voiceId: "voice", meter: { numerator: 4, denominator }, events: [],
    ruleWarnings: overflow ? [{ code: "rule.sequence-exceeds-measure", nominalDuration: { numerator: 1, denominator: 1 },
      actualDuration: { numerator: 1, denominator: 1 }, overflow }] : [] };
}

test("compact score warnings describe overflow in the current meter's beats", () => {
  assert.equal(describeMeasureRuleWarnings(3, measure(4, { numerator: 1, denominator: 4 })), "第 3 小节超出 1 拍");
  assert.equal(describeMeasureRuleWarnings(2, measure(8, { numerator: 3, denominator: 16 })), "第 2 小节超出 3/2 拍");
  assert.equal(describeMeasureRuleWarnings(1, measure(4, null)), null);
});
