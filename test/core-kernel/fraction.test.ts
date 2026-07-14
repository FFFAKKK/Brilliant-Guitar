import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

type Fraction = { readonly numerator: number; readonly denominator: number };
type FractionResult =
  | { readonly ok: true; readonly value: Fraction }
  | { readonly ok: false; readonly code: string };
type CreateFraction = (
  numerator: number,
  denominator: number,
) => FractionResult;
type FractionOperation = (left: Fraction, right: Fraction) => FractionResult;
type FractionComparisonResult =
  | { readonly ok: true; readonly value: -1 | 0 | 1 }
  | { readonly ok: false; readonly code: string };
type CompareFractions = (
  left: Fraction,
  right: Fraction,
) => FractionComparisonResult;
type IsCanonicalFraction = (value: Fraction) => boolean;

test("createFraction normalizes an exact rational value", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(
    typeof api.createFraction,
    "function",
    "Core must export createFraction",
  );

  const createFraction = api.createFraction as CreateFraction;
  assert.deepEqual(createFraction(2, 4), {
    ok: true,
    value: { numerator: 1, denominator: 2 },
  });
});

test("canonical fractions require safe reduced components and a positive denominator", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.isCanonicalFraction, "function");
  const isCanonicalFraction = api.isCanonicalFraction as IsCanonicalFraction;

  assert.equal(isCanonicalFraction({ numerator: 0, denominator: 1 }), true);
  assert.equal(isCanonicalFraction({ numerator: 1, denominator: 2 }), true);
  assert.equal(isCanonicalFraction({ numerator: 2, denominator: 4 }), false);
  assert.equal(isCanonicalFraction({ numerator: 0, denominator: 2 }), false);
  assert.equal(isCanonicalFraction({ numerator: 1, denominator: -2 }), false);
  assert.equal(
    isCanonicalFraction({
      numerator: Number.MAX_SAFE_INTEGER + 1,
      denominator: 1,
    }),
    false,
  );
});

test("createFraction returns stable failures for malformed components", () => {
  const createFraction = (
    coreKernel as unknown as Record<string, unknown>
  ).createFraction as CreateFraction;

  assert.deepEqual(createFraction(1.5, 2), {
    ok: false,
    code: "fraction-component-not-safe-integer",
  });
  assert.deepEqual(createFraction(1, 0), {
    ok: false,
    code: "fraction-denominator-not-positive",
  });
  assert.deepEqual(createFraction(1, -2), {
    ok: false,
    code: "fraction-denominator-not-positive",
  });
});

test("fraction arithmetic remains exact and canonical", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.addFractions, "function");
  assert.equal(typeof api.subtractFractions, "function");
  assert.equal(typeof api.multiplyFractions, "function");
  const addFractions = api.addFractions as FractionOperation;
  const subtractFractions = api.subtractFractions as FractionOperation;
  const multiplyFractions = api.multiplyFractions as FractionOperation;

  assert.deepEqual(
    addFractions(
      { numerator: 1, denominator: 3 },
      { numerator: 1, denominator: 6 },
    ),
    { ok: true, value: { numerator: 1, denominator: 2 } },
  );
  assert.deepEqual(
    subtractFractions(
      { numerator: 1, denominator: 3 },
      { numerator: 5, denominator: 6 },
    ),
    { ok: true, value: { numerator: -1, denominator: 2 } },
  );
  assert.deepEqual(
    multiplyFractions(
      { numerator: 1, denominator: 8 },
      { numerator: 2, denominator: 3 },
    ),
    { ok: true, value: { numerator: 1, denominator: 12 } },
  );
});

test("fraction arithmetic and comparison fail instead of rounding on overflow", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.addFractions, "function");
  assert.equal(typeof api.multiplyFractions, "function");
  assert.equal(typeof api.compareFractions, "function");
  const addFractions = api.addFractions as FractionOperation;
  const multiplyFractions = api.multiplyFractions as FractionOperation;
  const compareFractions = api.compareFractions as CompareFractions;
  const maximum = Number.MAX_SAFE_INTEGER;

  assert.deepEqual(
    addFractions(
      { numerator: maximum, denominator: 1 },
      { numerator: 1, denominator: 1 },
    ),
    { ok: false, code: "fraction-overflow" },
  );
  assert.deepEqual(
    multiplyFractions(
      { numerator: maximum, denominator: 1 },
      { numerator: 2, denominator: 1 },
    ),
    { ok: false, code: "fraction-overflow" },
  );
  assert.deepEqual(
    compareFractions(
      { numerator: maximum, denominator: 1 },
      { numerator: 1, denominator: maximum },
    ),
    { ok: false, code: "fraction-overflow" },
  );
});

test("fraction comparison returns exact ordering", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.compareFractions, "function");
  const compareFractions = api.compareFractions as CompareFractions;

  assert.deepEqual(
    compareFractions(
      { numerator: 1, denominator: 3 },
      { numerator: 2, denominator: 5 },
    ),
    { ok: true, value: -1 },
  );
  assert.deepEqual(
    compareFractions(
      { numerator: 2, denominator: 4 },
      { numerator: 1, denominator: 2 },
    ),
    { ok: true, value: 0 },
  );
});
