import type { ExactFraction } from "../contracts/notation.ts";

function gcd(left: number, right: number): number {
  let a = Math.abs(left), b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

function safe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError("Playback fraction exceeds safe integer range");
  return value;
}

export function fraction(numerator: number, denominator: number): ExactFraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new RangeError("Invalid playback fraction");
  }
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return { numerator: safe(sign * numerator / divisor), denominator: safe(Math.abs(denominator) / divisor) };
}

export function addFractions(left: ExactFraction, right: ExactFraction): ExactFraction {
  return fraction(safe(safe(left.numerator * right.denominator) + safe(right.numerator * left.denominator)),
    safe(left.denominator * right.denominator));
}

export function compareFractions(left: ExactFraction, right: ExactFraction): number {
  const a = safe(left.numerator * right.denominator), b = safe(right.numerator * left.denominator);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function maxFraction(left: ExactFraction, right: ExactFraction): ExactFraction {
  return compareFractions(left, right) >= 0 ? fraction(left.numerator, left.denominator)
    : fraction(right.numerator, right.denominator);
}

export function fractionToNumber(value: ExactFraction): number {
  return value.numerator / value.denominator;
}
