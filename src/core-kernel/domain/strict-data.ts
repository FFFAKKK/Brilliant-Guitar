interface DataDescriptor extends PropertyDescriptor {
  readonly value: unknown;
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
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
      Array.isArray(value) ||
      !hasPlainRecordPrototype(value)
    ) {
      return undefined;
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== expectedKeys.length) {
      return undefined;
    }
    for (const key of ownKeys) {
      if (typeof key !== "string" || !expectedKeys.includes(key)) {
        return undefined;
      }
    }

    const values: unknown[] = [];
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!isEnumerableDataDescriptor(descriptor)) {
        return undefined;
      }
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return undefined;
  }
}

function readJsonObjectValues(value: object): readonly unknown[] | undefined {
  if (!hasPlainRecordPrototype(value)) {
    return undefined;
  }

  const ownKeys = Reflect.ownKeys(value);
  const values: unknown[] = [];
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      return undefined;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    values.push(descriptor.value);
  }
  return values;
}

function isCanonicalArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== "string" || key === "length") {
    return false;
  }
  const index = Number(key);
  return (
    Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function readDenseJsonArrayValues(
  value: readonly unknown[],
): readonly unknown[] | undefined {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }

  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) {
    return undefined;
  }
  for (const key of ownKeys) {
    if (key !== "length" && !isCanonicalArrayIndex(key, length)) {
      return undefined;
    }
  }

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!isEnumerableDataDescriptor(descriptor)) {
      return undefined;
    }
    values.push(descriptor.value);
  }
  return values;
}

/**
 * Captures the immediate children of an exact JSON object or dense JSON array.
 * No input property is read through ordinary property access.
 */
export function readJsonContainerValues(
  value: object,
): readonly unknown[] | undefined {
  try {
    return Array.isArray(value)
      ? readDenseJsonArrayValues(value)
      : readJsonObjectValues(value);
  } catch {
    return undefined;
  }
}
