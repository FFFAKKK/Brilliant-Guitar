interface DataDescriptor extends PropertyDescriptor {
  readonly value: unknown;
}

const reflectObject = Reflect;
const arrayConstructor = Array;
const objectConstructor = Object;
const reflectApply = reflectObject.apply;
const reflectGetOwnPropertyDescriptor = reflectObject.getOwnPropertyDescriptor;
const reflectGetPrototypeOf = reflectObject.getPrototypeOf;
const reflectOwnKeys = reflectObject.ownKeys;
const arrayIncludes = arrayConstructor.prototype.includes;
const arrayIsArray = arrayConstructor.isArray;
const arrayPush = arrayConstructor.prototype.push;
const numberConstructor = Number;
const numberIsSafeInteger = numberConstructor.isSafeInteger;
const objectPrototype = objectConstructor.prototype;
const stringConstructor = String;
const functionPrototype = Function.prototype;
const functionToString = functionPrototype.toString;
const intrinsicArrayConstructorSource = functionSource(arrayConstructor);
const intrinsicObjectConstructorSource = functionSource(objectConstructor);

export function hasUnchangedBuiltinDataValue(
  owner: object,
  key: PropertyKey,
  expected: unknown,
): boolean {
  const descriptor = reflectGetOwnPropertyDescriptor(owner, key);
  return descriptor !== undefined && "value" in descriptor && descriptor.value === expected;
}

function hasIntactStrictDataPrimordials(): boolean {
  return (
    hasUnchangedBuiltinDataValue(reflectObject, "apply", reflectApply) &&
    hasUnchangedBuiltinDataValue(
      reflectObject,
      "getOwnPropertyDescriptor",
      reflectGetOwnPropertyDescriptor,
    ) &&
    hasUnchangedBuiltinDataValue(
      reflectObject,
      "getPrototypeOf",
      reflectGetPrototypeOf,
    ) &&
    hasUnchangedBuiltinDataValue(reflectObject, "ownKeys", reflectOwnKeys) &&
    hasUnchangedBuiltinDataValue(arrayConstructor, "isArray", arrayIsArray) &&
    hasUnchangedBuiltinDataValue(
      arrayConstructor.prototype,
      "includes",
      arrayIncludes,
    ) &&
    hasUnchangedBuiltinDataValue(
      arrayConstructor.prototype,
      "push",
      arrayPush,
    ) &&
    hasUnchangedBuiltinDataValue(
      numberConstructor,
      "isSafeInteger",
      numberIsSafeInteger,
    ) &&
    hasUnchangedBuiltinDataValue(
      functionPrototype,
      "toString",
      functionToString,
    )
  );
}

function functionSource(value: Function): string {
  return reflectApply(functionToString, value, []) as string;
}

function hasOwnKey(keys: readonly PropertyKey[], expected: PropertyKey): boolean {
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === expected) {
      return true;
    }
  }
  return false;
}

function isEnumerableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is DataDescriptor {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor
  );
}

function hasPlainRecordPrototype(value: object): boolean {
  const prototype = reflectGetPrototypeOf(value);
  return prototype === objectPrototype || prototype === null;
}

function hasNativeConstructorBackReference(
  prototype: object,
  constructorSource: string,
): boolean {
  const constructorDescriptor = reflectGetOwnPropertyDescriptor(
    prototype,
    "constructor",
  );
  if (
    constructorDescriptor === undefined ||
    constructorDescriptor.enumerable !== false ||
    !("value" in constructorDescriptor) ||
    typeof constructorDescriptor.value !== "function" ||
    functionSource(constructorDescriptor.value) !== constructorSource
  ) {
    return false;
  }
  const constructorPrototypeDescriptor = reflectGetOwnPropertyDescriptor(
    constructorDescriptor.value,
    "prototype",
  );
  return (
    constructorPrototypeDescriptor !== undefined &&
    constructorPrototypeDescriptor.enumerable === false &&
    "value" in constructorPrototypeDescriptor &&
    constructorPrototypeDescriptor.value === prototype
  );
}

/**
 * `toJSON` is the only inherited Array-prototype member that changes the JSON
 * serialization of an otherwise dense array. Other Array methods are not part
 * of the JsonValue boundary and are deliberately not fingerprinted: native
 * functions from different intrinsics can have indistinguishable source text.
 */
function hasNoOwnJsonSerializationHook(value: object): boolean {
  return reflectGetOwnPropertyDescriptor(value, "toJSON") === undefined;
}

function hasRealmObjectPrototype(value: object): boolean {
  return (
    hasNativeConstructorBackReference(value, intrinsicObjectConstructorSource) &&
    reflectGetPrototypeOf(value) === null &&
    hasNoOwnJsonSerializationHook(value)
  );
}

/**
 * Recognizes an ordinary Array prototype from any Realm without comparing its
 * identity to the current Realm. The check covers the prototype-chain and
 * JSON-serialization surface only: array branding, native constructor
 * back-reference, an Object-prototype parent rooted at null, and no `toJSON`
 * hook. Unrelated Array methods are intentionally outside this JsonValue
 * contract.
 */
function isRealmArrayPrototype(prototype: object): boolean {
  if (!reflectApply(arrayIsArray, arrayConstructor, [prototype])) {
    return false;
  }
  if (
    !hasNativeConstructorBackReference(
      prototype,
      intrinsicArrayConstructorSource,
    )
  ) {
    return false;
  }

  const parent = reflectGetPrototypeOf(prototype);
  return (
    parent !== null &&
    !reflectApply(arrayIsArray, arrayConstructor, [parent]) &&
    hasRealmObjectPrototype(parent) &&
    hasNoOwnJsonSerializationHook(prototype)
  );
}

function hasRealmArrayPrototype(
  value: readonly unknown[],
  validatedArrayPrototypes: object[] | undefined,
): boolean {
  const prototype = reflectGetPrototypeOf(value);
  if (prototype === null) {
    return false;
  }
  if (
    validatedArrayPrototypes !== undefined &&
    reflectApply(arrayIncludes, validatedArrayPrototypes, [prototype]) === true
  ) {
    return true;
  }
  if (!isRealmArrayPrototype(prototype)) {
    return false;
  }
  if (validatedArrayPrototypes !== undefined) {
    reflectApply(arrayPush, validatedArrayPrototypes, [prototype]);
  }
  return true;
}

export function areCachedRealmArrayPrototypesValid(
  validatedArrayPrototypes: readonly object[],
): boolean {
  try {
    for (let index = 0; index < validatedArrayPrototypes.length; index += 1) {
      const prototype = validatedArrayPrototypes[index];
      if (prototype === undefined || !isRealmArrayPrototype(prototype)) {
        return false;
      }
    }
    return hasIntactStrictDataPrimordials();
  } catch {
    return false;
  }
}

/**
 * Captures an exact plain record through own data descriptors only.
 *
 * The returned values follow `expectedKeys` order. All reflection stays inside
 * this total boundary so callers never execute an input getter or receive a
 * Proxy/reflection exception.
 */
export function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): readonly unknown[] | undefined {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      reflectApply(arrayIsArray, arrayConstructor, [value]) ||
      !hasPlainRecordPrototype(value)
    ) {
      return undefined;
    }

    const ownKeys = reflectOwnKeys(value);
    if (ownKeys.length !== expectedKeys.length) {
      return undefined;
    }
    for (let index = 0; index < ownKeys.length; index += 1) {
      const key = ownKeys[index];
      if (key === undefined) {
        return undefined;
      }
      if (
        typeof key !== "string" ||
        !reflectApply(arrayIncludes, expectedKeys, [key])
      ) {
        return undefined;
      }
    }

    const values: unknown[] = [];
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      if (key === undefined) {
        return undefined;
      }
      const descriptor = reflectGetOwnPropertyDescriptor(value, key);
      if (!isEnumerableDataDescriptor(descriptor)) {
        return undefined;
      }
      reflectApply(arrayPush, values, [descriptor.value]);
    }
    return hasIntactStrictDataPrimordials() ? values : undefined;
  } catch {
    return undefined;
  }
}

function readJsonObjectValues(value: object): readonly unknown[] | undefined {
  if (!hasPlainRecordPrototype(value)) {
    return undefined;
  }

  const ownKeys = reflectOwnKeys(value);
  const values: unknown[] = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (key === undefined) {
      return undefined;
    }
    if (typeof key !== "string") {
      return undefined;
    }
    const descriptor = reflectGetOwnPropertyDescriptor(value, key);
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    reflectApply(arrayPush, values, [descriptor.value]);
  }
  return values;
}

function isCanonicalArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== "string" || key === "length") {
    return false;
  }
  const index = reflectApply(numberConstructor, undefined, [key]) as number;
  return (
    reflectApply(numberIsSafeInteger, numberConstructor, [index]) === true &&
    index >= 0 &&
    index < length &&
    (reflectApply(stringConstructor, undefined, [index]) as string) === key
  );
}

function readDenseJsonArrayValues(
  value: readonly unknown[],
  validatedArrayPrototypes: object[] | undefined,
): readonly unknown[] | undefined {
  if (!hasRealmArrayPrototype(value, validatedArrayPrototypes)) {
    return undefined;
  }

  const lengthDescriptor = reflectGetOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    reflectApply(numberIsSafeInteger, numberConstructor, [lengthDescriptor.value]) !==
      true ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;

  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== length + 1 || !hasOwnKey(ownKeys, "length")) {
    return undefined;
  }
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (key === undefined) {
      return undefined;
    }
    if (key !== "length" && !isCanonicalArrayIndex(key, length)) {
      return undefined;
    }
  }

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = reflectGetOwnPropertyDescriptor(
      value,
      reflectApply(stringConstructor, undefined, [index]) as string,
    );
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    reflectApply(arrayPush, values, [descriptor.value]);
  }
  return values;
}

/**
 * Captures the immediate children of an exact JSON object or dense JSON array.
 * No input property is read through ordinary property access.
 */
export function readJsonContainerValues(
  value: object,
  validatedArrayPrototypes?: object[],
): readonly unknown[] | undefined {
  try {
    const values = reflectApply(arrayIsArray, arrayConstructor, [value])
      ? readDenseJsonArrayValues(
          value as readonly unknown[],
          validatedArrayPrototypes,
        )
      : readJsonObjectValues(value);
    return hasIntactStrictDataPrimordials() ? values : undefined;
  } catch {
    return undefined;
  }
}
