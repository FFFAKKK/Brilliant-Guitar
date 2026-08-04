import { test } from "node:test";
import assert = require("node:assert/strict");
import { runInNewContext } from "node:vm";

import * as coreKernel from "../../src/core-kernel/index";
import type {
  JsonValue,
  Transposition,
  WrittenPitch,
} from "../../src/core-kernel/index";

type UnknownGuard = (value: unknown) => boolean;

const jsonValueGuard: (value: unknown) => value is JsonValue =
  coreKernel.isJsonValue;
const writtenPitchGuard: (value: unknown) => value is WrittenPitch =
  coreKernel.isWrittenPitch;
const transpositionGuard: (value: unknown) => value is Transposition =
  coreKernel.isTransposition;

function nullPrototypeRecord<T extends object>(value: T): T {
  return Object.assign(Object.create(null) as T, value);
}

function withEnumerableGetter(
  values: Readonly<Record<string, unknown>>,
  getterKey: string,
  getterValue: unknown,
  onGet: () => void,
): object {
  const result: Record<string, unknown> = { ...values };
  Object.defineProperty(result, getterKey, {
    configurable: true,
    enumerable: true,
    get() {
      onGet();
      return getterValue;
    },
  });
  return result;
}

function assertGuardReturnsFalse(guard: UnknownGuard, value: unknown): void {
  assert.equal(guard(value), false);
}

function requireOwnDescriptor(
  value: object,
  key: PropertyKey,
): PropertyDescriptor {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new Error(`Missing test fixture descriptor: ${String(key)}`);
  }
  return descriptor;
}

test("UG-T01 public guards preserve ordinary primitive and nested decisions", () => {
  for (const value of [null, true, false, 0, -3.5, "value"]) {
    assert.equal(jsonValueGuard(value), true);
  }
  for (const value of [
    undefined,
    1n,
    Symbol("value"),
    () => undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(jsonValueGuard(value), false);
  }

  assert.equal(
    jsonValueGuard({
      nested: [null, true, 42.5, "value", { order: [3, 2, 1] }],
    }),
    true,
  );
  assert.equal(
    jsonValueGuard(
      nullPrototypeRecord({ nested: nullPrototypeRecord({ value: 1 }) }),
    ),
    true,
  );
  assert.equal(jsonValueGuard(Object.freeze([1, { value: true }])), true);
});

test("UG-T01 dense arrays from another Realm preserve JsonValue compatibility", () => {
  const value: unknown = runInNewContext("[1, true, null]");

  assert.equal(Array.isArray(value), true);
  assert.equal(jsonValueGuard(value), true);
});

test("UG-T02 and UG-T03 exact pitch records preserve domain boundaries", () => {
  const writtenPitches = [
    { step: "C", alter: -2, octave: 0 },
    { step: "G", alter: 0, octave: 4 },
    { step: "B", alter: 2, octave: 8 },
    nullPrototypeRecord({ step: "D", alter: 1, octave: 3 }),
  ];
  writtenPitches.forEach((value) => assert.equal(writtenPitchGuard(value), true));

  const transpositions = [
    {
      diatonicSteps: Number.MIN_SAFE_INTEGER,
      chromaticSemitones: Number.MAX_SAFE_INTEGER,
    },
    { diatonicSteps: 0, chromaticSemitones: 0 },
    nullPrototypeRecord({ diatonicSteps: -7, chromaticSemitones: -12 }),
  ];
  transpositions.forEach((value) => assert.equal(transpositionGuard(value), true));

  for (const value of [
    { step: "H", alter: 0, octave: 4 },
    { step: "C", alter: -3, octave: 4 },
    { step: "C", alter: 3, octave: 4 },
    { step: "C", alter: 0.5, octave: 4 },
    { step: "C", alter: 0, octave: -1 },
    { step: "C", alter: 0, octave: 9 },
    { step: "C", alter: 0, octave: 4.5 },
  ]) {
    assert.equal(writtenPitchGuard(value), false);
  }
  for (const value of [
    { diatonicSteps: 0.5, chromaticSemitones: 0 },
    { diatonicSteps: 0, chromaticSemitones: Number.NaN },
    { diatonicSteps: Number.MAX_SAFE_INTEGER + 1, chromaticSemitones: 0 },
  ]) {
    assert.equal(transpositionGuard(value), false);
  }
});

test("UG-T04 accessors are rejected without executing getters", () => {
  const pitchValues = { step: "C", alter: 0, octave: 4 };
  for (const key of Object.keys(pitchValues)) {
    let getterCalls = 0;
    const value = withEnumerableGetter(
      pitchValues,
      key,
      pitchValues[key as keyof typeof pitchValues],
      () => {
        getterCalls += 1;
      },
    );
    assert.equal(writtenPitchGuard(value), false);
    assert.equal(getterCalls, 0);
  }

  const transpositionValues = { diatonicSteps: -7, chromaticSemitones: -12 };
  for (const key of Object.keys(transpositionValues)) {
    let getterCalls = 0;
    const value = withEnumerableGetter(
      transpositionValues,
      key,
      transpositionValues[key as keyof typeof transpositionValues],
      () => {
        getterCalls += 1;
      },
    );
    assert.equal(transpositionGuard(value), false);
    assert.equal(getterCalls, 0);
  }

  let objectGetterCalls = 0;
  const jsonObject = withEnumerableGetter({}, "value", 1, () => {
    objectGetterCalls += 1;
  });
  assert.equal(jsonValueGuard(jsonObject), false);
  assert.equal(objectGetterCalls, 0);

  let arrayGetterCalls = 0;
  const jsonArray: unknown[] = [];
  Object.defineProperty(jsonArray, "0", {
    configurable: true,
    enumerable: true,
    get() {
      arrayGetterCalls += 1;
      return 1;
    },
  });
  jsonArray.length = 1;
  assert.equal(jsonValueGuard(jsonArray), false);
  assert.equal(arrayGetterCalls, 0);
});

test("UG-T05 Proxy get traps remain untouched for valid records and arrays", () => {
  const fixtures: readonly [UnknownGuard, object][] = [
    [writtenPitchGuard, { step: "C", alter: 0, octave: 4 }],
    [transpositionGuard, { diatonicSteps: -7, chromaticSemitones: -12 }],
    [jsonValueGuard, { nested: [1, true, null] }],
    [jsonValueGuard, [1, true, null]],
  ];

  for (const [guard, target] of fixtures) {
    let getCalls = 0;
    const value = new Proxy(target, {
      get() {
        getCalls += 1;
        throw new Error("PRIVATE_UG_GET");
      },
    });
    assert.equal(guard(value), true);
    assert.equal(getCalls, 0);
  }
});

test("UG-T05 descriptor values are captured exactly once per visit", () => {
  const pitchDescriptorCalls = new Map<PropertyKey, number>();
  const pitch = new Proxy(
    { step: "C", alter: 0, octave: 4 },
    {
      getOwnPropertyDescriptor(target, key) {
        pitchDescriptorCalls.set(key, (pitchDescriptorCalls.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  assert.equal(writtenPitchGuard(pitch), true);
  assert.deepEqual(Object.fromEntries(pitchDescriptorCalls), {
    step: 1,
    alter: 1,
    octave: 1,
  });

  const jsonDescriptorCalls = new Map<PropertyKey, number>();
  const jsonArray = new Proxy([1, { value: true }], {
    getOwnPropertyDescriptor(target, key) {
      jsonDescriptorCalls.set(key, (jsonDescriptorCalls.get(key) ?? 0) + 1);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(jsonValueGuard(jsonArray), true);
  assert.deepEqual(Object.fromEntries(jsonDescriptorCalls), {
    "0": 1,
    "1": 1,
    length: 1,
  });
});

test("UG-T06 reflection failures and revoked Proxies return false", () => {
  const fixtures: readonly [UnknownGuard, () => object][] = [
    [writtenPitchGuard, () => ({ step: "C", alter: 0, octave: 4 })],
    [transpositionGuard, () => ({ diatonicSteps: -7, chromaticSemitones: -12 })],
    [jsonValueGuard, () => ({ value: 1 })],
    [jsonValueGuard, () => [1]],
  ];

  for (const [guard, createTarget] of fixtures) {
    assertGuardReturnsFalse(
      guard,
      new Proxy(createTarget(), {
        getPrototypeOf() {
          throw new Error("PRIVATE_UG_PROTOTYPE");
        },
      }),
    );
    assertGuardReturnsFalse(
      guard,
      new Proxy(createTarget(), {
        ownKeys() {
          throw new Error("PRIVATE_UG_KEYS");
        },
      }),
    );
    assertGuardReturnsFalse(
      guard,
      new Proxy(createTarget(), {
        getOwnPropertyDescriptor() {
          throw new Error("PRIVATE_UG_DESCRIPTOR");
        },
      }),
    );

    const revocable = Proxy.revocable(createTarget(), {});
    revocable.revoke();
    assertGuardReturnsFalse(guard, revocable.proxy);
  }
});

test("UG-T06 public guards contain synchronous reflection side effects", () => {
  const setAddDescriptor = requireOwnDescriptor(Set.prototype, "add");
  let setAddReplaced = false;
  let jsonResult: boolean | undefined;
  try {
    const value = new Proxy(
      { value: 1 },
      {
        ownKeys(target) {
          setAddReplaced = Reflect.defineProperty(Set.prototype, "add", {
            configurable: true,
            writable: true,
            value() {
              throw new Error("PRIVATE_UG_SET_ADD_SIDE_EFFECT");
            },
          });
          return Reflect.ownKeys(target);
        },
      },
    );
    jsonResult = jsonValueGuard(value);
  } finally {
    Reflect.defineProperty(Set.prototype, "add", setAddDescriptor);
  }
  assert.equal(setAddReplaced, true);
  assert.equal(jsonResult, false);

  const includesDescriptor = requireOwnDescriptor(Array.prototype, "includes");
  let includesReplaced = false;
  let pitchResult: boolean | undefined;
  try {
    const value = new Proxy(
      { step: "C", alter: 0, octave: 4 },
      {
        getOwnPropertyDescriptor(target, key) {
          includesReplaced = Reflect.defineProperty(Array.prototype, "includes", {
            configurable: true,
            writable: true,
            value() {
              throw new Error("PRIVATE_UG_INCLUDES_SIDE_EFFECT");
            },
          });
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    pitchResult = writtenPitchGuard(value);
  } finally {
    Reflect.defineProperty(Array.prototype, "includes", includesDescriptor);
  }
  assert.equal(includesReplaced, true);
  assert.equal(pitchResult, false);

  const safeIntegerDescriptor = requireOwnDescriptor(Number, "isSafeInteger");
  let safeIntegerReplaced = false;
  let transpositionResult: boolean | undefined;
  try {
    const value = new Proxy(
      { diatonicSteps: -7, chromaticSemitones: -12 },
      {
        getOwnPropertyDescriptor(target, key) {
          safeIntegerReplaced = Reflect.defineProperty(Number, "isSafeInteger", {
            configurable: true,
            writable: true,
            value() {
              throw new Error("PRIVATE_UG_SAFE_INTEGER_SIDE_EFFECT");
            },
          });
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    transpositionResult = transpositionGuard(value);
  } finally {
    Reflect.defineProperty(Number, "isSafeInteger", safeIntegerDescriptor);
  }
  assert.equal(safeIntegerReplaced, true);
  assert.equal(transpositionResult, false);
});

test("UG-T06 public guards reject forged synchronous built-in outcomes", () => {
  const pushDescriptor = requireOwnDescriptor(Array.prototype, "push");
  let pushReplaced = false;
  let jsonResult: boolean | undefined;
  try {
    const value = new Proxy(
      { invalid: undefined },
      {
        ownKeys(target) {
          pushReplaced = Reflect.defineProperty(Array.prototype, "push", {
            configurable: true,
            writable: true,
            value() {},
          });
          return Reflect.ownKeys(target);
        },
      },
    );
    jsonResult = jsonValueGuard(value);
  } finally {
    Reflect.defineProperty(Array.prototype, "push", pushDescriptor);
  }
  assert.equal(pushReplaced, true);
  assert.equal(jsonResult, false);

  const includesDescriptor = requireOwnDescriptor(Array.prototype, "includes");
  let includesReplaced = false;
  let pitchResult: boolean | undefined;
  try {
    const value = new Proxy(
      { step: "H", alter: 0, octave: 4 },
      {
        getOwnPropertyDescriptor(target, key) {
          includesReplaced = Reflect.defineProperty(Array.prototype, "includes", {
            configurable: true,
            writable: true,
            value() {
              return true;
            },
          });
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    pitchResult = writtenPitchGuard(value);
  } finally {
    Reflect.defineProperty(Array.prototype, "includes", includesDescriptor);
  }
  assert.equal(includesReplaced, true);
  assert.equal(pitchResult, false);

  const safeIntegerDescriptor = requireOwnDescriptor(Number, "isSafeInteger");
  let safeIntegerReplaced = false;
  let transpositionResult: boolean | undefined;
  try {
    const value = new Proxy(
      { diatonicSteps: 0.5, chromaticSemitones: 0.5 },
      {
        getOwnPropertyDescriptor(target, key) {
          safeIntegerReplaced = Reflect.defineProperty(Number, "isSafeInteger", {
            configurable: true,
            writable: true,
            value() {
              return true;
            },
          });
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    transpositionResult = transpositionGuard(value);
  } finally {
    Reflect.defineProperty(Number, "isSafeInteger", safeIntegerDescriptor);
  }
  assert.equal(safeIntegerReplaced, true);
  assert.equal(transpositionResult, false);
});

test("UG-T07 exact record guards reject non-data and non-plain shapes", () => {
  const symbol = Symbol("extra");
  const pitchWithSymbol = { step: "C", alter: 0, octave: 4, [symbol]: true };
  const pitchWithHidden = { step: "C", alter: 0, octave: 4 };
  Object.defineProperty(pitchWithHidden, "hidden", { value: true });
  const inheritedPitch = Object.create({ step: "C", alter: 0, octave: 4 });
  class PitchRecord {
    readonly step = "C";
    readonly alter = 0;
    readonly octave = 4;
  }

  for (const value of [
    { step: "C", alter: 0, octave: 4, extra: true },
    pitchWithSymbol,
    pitchWithHidden,
    inheritedPitch,
    new PitchRecord(),
  ]) {
    assert.equal(writtenPitchGuard(value), false);
  }

  const transpositionWithHidden = {
    diatonicSteps: -7,
    chromaticSemitones: -12,
  };
  Object.defineProperty(transpositionWithHidden, "hidden", { value: true });
  for (const value of [
    { diatonicSteps: -7, chromaticSemitones: -12, extra: true },
    { diatonicSteps: -7, chromaticSemitones: -12, [symbol]: true },
    transpositionWithHidden,
    Object.create({ diatonicSteps: -7, chromaticSemitones: -12 }),
  ]) {
    assert.equal(transpositionGuard(value), false);
  }

  const jsonWithHidden = { value: 1 };
  Object.defineProperty(jsonWithHidden, "hidden", { value: true });
  for (const value of [
    { value: 1, [symbol]: true },
    jsonWithHidden,
    Object.create({ value: 1 }),
    new (class JsonRecord {
      readonly value = 1;
    })(),
  ]) {
    assert.equal(jsonValueGuard(value), false);
  }

  const arrayWithSymbol = [1];
  Object.defineProperty(arrayWithSymbol, symbol, { value: true, enumerable: true });
  const arrayWithHidden = [1];
  Object.defineProperty(arrayWithHidden, "hidden", { value: true });
  const arrayWithCustomPrototype = [1];
  Object.setPrototypeOf(arrayWithCustomPrototype, Object.create(Array.prototype));
  for (const value of [arrayWithSymbol, arrayWithHidden, arrayWithCustomPrototype]) {
    assert.equal(jsonValueGuard(value), false);
  }
});

test("UG-T07 Array-branded custom prototypes are rejected", () => {
  const customPrototype: unknown[] = [];
  const customPrototypeValue = [1];
  Object.setPrototypeOf(customPrototypeValue, customPrototype);

  const customToJsonPrototype: unknown[] = [];
  Object.defineProperty(customToJsonPrototype, "toJSON", {
    configurable: true,
    value() {
      return "changed";
    },
  });
  const inheritedToJsonValue = [1];
  Object.setPrototypeOf(inheritedToJsonValue, customToJsonPrototype);

  const mismatchedConstructorPrototype: unknown[] = [];
  Object.defineProperty(mismatchedConstructorPrototype, "constructor", {
    configurable: true,
    value: Array,
  });
  const mismatchedConstructorValue = [1];
  Object.setPrototypeOf(
    mismatchedConstructorValue,
    mismatchedConstructorPrototype,
  );

  const linkedConstructorPrototype: unknown[] = [];
  function CustomArrayPrototype(): void {}
  CustomArrayPrototype.prototype = linkedConstructorPrototype;
  Object.defineProperty(linkedConstructorPrototype, "constructor", {
    configurable: true,
    value: CustomArrayPrototype,
  });
  const linkedConstructorValue = [1];
  Object.setPrototypeOf(linkedConstructorValue, linkedConstructorPrototype);

  const structurallySpoofedPrototype: unknown[] = [];
  Object.setPrototypeOf(structurallySpoofedPrototype, Object.create(null));
  function StructurallySpoofedArray(): void {}
  StructurallySpoofedArray.prototype = structurallySpoofedPrototype;
  Object.defineProperty(structurallySpoofedPrototype, "constructor", {
    configurable: true,
    value: StructurallySpoofedArray,
  });
  const structurallySpoofedValue = [1];
  Object.setPrototypeOf(structurallySpoofedValue, structurallySpoofedPrototype);

  assert.equal(Array.isArray(Reflect.getPrototypeOf(customPrototypeValue)), true);
  assert.equal(jsonValueGuard(customPrototypeValue), false);
  assert.equal(JSON.stringify(inheritedToJsonValue), '"changed"');
  assert.equal(jsonValueGuard(inheritedToJsonValue), false);
  assert.equal(jsonValueGuard(mismatchedConstructorValue), false);
  assert.equal(jsonValueGuard(linkedConstructorValue), false);
  assert.equal(jsonValueGuard(structurallySpoofedValue), false);
});

test("UG-T07 modified cross-Realm Array prototypes are rejected", () => {
  const ownToJsonValue: unknown = runInNewContext(
    "Object.defineProperty(Array.prototype, 'toJSON', { value() { return 'changed'; } }); [1]",
  );
  const replacedParentValue: unknown = runInNewContext(
    "const parent = Object.create(null); Object.defineProperty(parent, 'toJSON', { value() { return 'changed'; } }); Object.setPrototypeOf(Array.prototype, parent); [1]",
  );

  assert.equal(Array.isArray(ownToJsonValue), true);
  assert.equal(JSON.stringify(ownToJsonValue), '"changed"');
  assert.equal(jsonValueGuard(ownToJsonValue), false);
  assert.equal(Array.isArray(replacedParentValue), true);
  assert.equal(JSON.stringify(replacedParentValue), '"changed"');
  assert.equal(jsonValueGuard(replacedParentValue), false);
});

test("UG-T07 ignores non-JSON cross-Realm Array method substitutions", () => {
  const value: unknown = runInNewContext(
    "Array.prototype.values = Set.prototype.values; [1]",
  );

  assert.equal(Array.isArray(value), true);
  assert.equal(JSON.stringify(value), "[1]");
  assert.throws(
    () => Reflect.apply((value as unknown[]).values, value, []),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "name") === "TypeError",
  );
  assert.equal(jsonValueGuard(value), true);
});

test("UG-T08 sparse arrays reject before index-proportional inspection", () => {
  let indexDescriptorCalls = 0;
  const hugeSparse = new Proxy(new Array<unknown>(0xffff_ffff), {
    getOwnPropertyDescriptor(target, key) {
      if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)) {
        indexDescriptorCalls += 1;
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  assert.equal(jsonValueGuard(new Array<unknown>(1)), false);
  assert.equal(jsonValueGuard(hugeSparse), false);
  assert.equal(indexDescriptorCalls, 0);
});

test("UG-T09 and UG-T10 cycles fail while shared acyclic values pass", () => {
  const cyclicObject: { self?: unknown } = {};
  cyclicObject.self = cyclicObject;
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);
  assert.equal(jsonValueGuard(cyclicObject), false);
  assert.equal(jsonValueGuard(cyclicArray), false);

  const shared = { nested: [1, 2, 3] };
  assert.equal(jsonValueGuard({ left: shared, right: shared }), true);
});

test("UG-T10 shared DAG containers are inspected once per call", () => {
  let descriptorCalls = 0;
  const observe = (target: Record<string, unknown>): object =>
    new Proxy(target, {
      getOwnPropertyDescriptor(currentTarget, key) {
        descriptorCalls += 1;
        return Reflect.getOwnPropertyDescriptor(currentTarget, key);
      },
    });

  const uniqueContainerCount = 18;
  let value = observe({ value: 1 });
  for (let index = 1; index < uniqueContainerCount; index += 1) {
    value = observe({ left: value, right: value });
  }

  assert.equal(jsonValueGuard(value), true);
  assert.equal(descriptorCalls, 35);

  assert.equal(jsonValueGuard(value), true);
  assert.equal(descriptorCalls, 70);
});

test("UG-T11 a 20,000-level dense value avoids recursive stack failure", () => {
  let value: unknown = null;
  for (let depth = 0; depth < 20_000; depth += 1) {
    value = [value];
  }
  assert.equal(jsonValueGuard(value), true);
});

test("UG-T12 every call observes current descriptors without retained cache", () => {
  const pitch: Record<string, unknown> = { step: "C", alter: 0, octave: 4 };
  assert.equal(writtenPitchGuard(pitch), true);
  pitch.step = "H";
  assert.equal(writtenPitchGuard(pitch), false);
  pitch.step = "G";
  assert.equal(writtenPitchGuard(pitch), true);

  const json: Record<PropertyKey, unknown> = { value: 1 };
  assert.equal(jsonValueGuard(json), true);
  const symbol = Symbol("later");
  json[symbol] = true;
  assert.equal(jsonValueGuard(json), false);
  delete json[symbol];
  assert.equal(jsonValueGuard(json), true);
});

test("UG-T13 guard signatures remain fixed while CVN-3 adds one factory export", () => {
  assert.strictEqual(jsonValueGuard, coreKernel.isJsonValue);
  assert.strictEqual(writtenPitchGuard, coreKernel.isWrittenPitch);
  assert.strictEqual(transpositionGuard, coreKernel.isTransposition);
  assert.equal(Object.keys(coreKernel).length, 49);
  assert.deepEqual(
    Object.keys(coreKernel)
      .filter((name) => name.startsWith("is"))
      .sort(),
    [
      "isCanonicalFraction",
      "isJsonValue",
      "isNoteValueBase",
      "isNoteValueDots",
      "isScoreDocumentSchemaVersion",
      "isTransposition",
      "isWrittenPitch",
    ],
  );
});
