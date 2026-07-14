export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

export type FractionErrorCode =
  | "fraction-component-not-safe-integer"
  | "fraction-denominator-not-positive"
  | "fraction-overflow";

export type FractionResult =
  | { readonly ok: true; readonly value: Fraction }
  | { readonly ok: false; readonly code: FractionErrorCode };

export type FractionComparisonResult =
  | { readonly ok: true; readonly value: -1 | 0 | 1 }
  | { readonly ok: false; readonly code: FractionErrorCode };

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

export function createFraction(
  numerator: number,
  denominator: number,
): FractionResult {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator)
  ) {
    return { ok: false, code: "fraction-component-not-safe-integer" };
  }

  if (denominator <= 0) {
    return { ok: false, code: "fraction-denominator-not-positive" };
  }

  if (numerator === 0) {
    return { ok: true, value: { numerator: 0, denominator: 1 } };
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    ok: true,
    value: {
      numerator: numerator / divisor,
      denominator: denominator / divisor,
    },
  };
}

export function isCanonicalFraction(value: Fraction): boolean {
  if (
    !Number.isSafeInteger(value.numerator) ||
    !Number.isSafeInteger(value.denominator) ||
    value.denominator <= 0
  ) {
    return false;
  }

  if (value.numerator === 0) {
    return value.denominator === 1;
  }

  return greatestCommonDivisor(value.numerator, value.denominator) === 1;
}

function normalizeFraction(value: Fraction): FractionResult {
  return createFraction(value.numerator, value.denominator);
}

function safeMultiply(left: number, right: number): number | undefined {
  const value = left * right;
  return Number.isSafeInteger(value) ? value : undefined;
}

function safeAdd(left: number, right: number): number | undefined {
  const value = left + right;
  return Number.isSafeInteger(value) ? value : undefined;
}

function safeSubtract(left: number, right: number): number | undefined {
  const value = left - right;
  return Number.isSafeInteger(value) ? value : undefined;
}

function combineFractions(
  left: Fraction,
  right: Fraction,
  combine: (leftNumerator: number, rightNumerator: number) =>
    | number
    | undefined,
): FractionResult {
  const normalizedLeft = normalizeFraction(left);
  if (!normalizedLeft.ok) {
    return normalizedLeft;
  }
  const normalizedRight = normalizeFraction(right);
  if (!normalizedRight.ok) {
    return normalizedRight;
  }

  const denominatorDivisor = greatestCommonDivisor(
    normalizedLeft.value.denominator,
    normalizedRight.value.denominator,
  );
  const leftScale = normalizedRight.value.denominator / denominatorDivisor;
  const rightScale = normalizedLeft.value.denominator / denominatorDivisor;
  const scaledLeft = safeMultiply(normalizedLeft.value.numerator, leftScale);
  const scaledRight = safeMultiply(normalizedRight.value.numerator, rightScale);
  const denominator = safeMultiply(
    normalizedLeft.value.denominator,
    leftScale,
  );

  if (
    scaledLeft === undefined ||
    scaledRight === undefined ||
    denominator === undefined
  ) {
    return { ok: false, code: "fraction-overflow" };
  }

  const numerator = combine(scaledLeft, scaledRight);
  if (numerator === undefined) {
    return { ok: false, code: "fraction-overflow" };
  }

  return createFraction(numerator, denominator);
}

export function addFractions(left: Fraction, right: Fraction): FractionResult {
  return combineFractions(left, right, safeAdd);
}

export function subtractFractions(
  left: Fraction,
  right: Fraction,
): FractionResult {
  return combineFractions(left, right, safeSubtract);
}

export function multiplyFractions(
  left: Fraction,
  right: Fraction,
): FractionResult {
  const normalizedLeft = normalizeFraction(left);
  if (!normalizedLeft.ok) {
    return normalizedLeft;
  }
  const normalizedRight = normalizeFraction(right);
  if (!normalizedRight.ok) {
    return normalizedRight;
  }

  const leftCrossDivisor = greatestCommonDivisor(
    normalizedLeft.value.numerator,
    normalizedRight.value.denominator,
  );
  const rightCrossDivisor = greatestCommonDivisor(
    normalizedRight.value.numerator,
    normalizedLeft.value.denominator,
  );
  const numerator = safeMultiply(
    normalizedLeft.value.numerator / leftCrossDivisor,
    normalizedRight.value.numerator / rightCrossDivisor,
  );
  const denominator = safeMultiply(
    normalizedLeft.value.denominator / rightCrossDivisor,
    normalizedRight.value.denominator / leftCrossDivisor,
  );

  if (numerator === undefined || denominator === undefined) {
    return { ok: false, code: "fraction-overflow" };
  }

  return createFraction(numerator, denominator);
}

export function compareFractions(
  left: Fraction,
  right: Fraction,
): FractionComparisonResult {
  const normalizedLeft = normalizeFraction(left);
  if (!normalizedLeft.ok) {
    return normalizedLeft;
  }
  const normalizedRight = normalizeFraction(right);
  if (!normalizedRight.ok) {
    return normalizedRight;
  }

  const leftProduct = safeMultiply(
    normalizedLeft.value.numerator,
    normalizedRight.value.denominator,
  );
  const rightProduct = safeMultiply(
    normalizedRight.value.numerator,
    normalizedLeft.value.denominator,
  );

  if (leftProduct === undefined || rightProduct === undefined) {
    return { ok: false, code: "fraction-overflow" };
  }

  return {
    ok: true,
    value: leftProduct < rightProduct ? -1 : leftProduct > rightProduct ? 1 : 0,
  };
}
