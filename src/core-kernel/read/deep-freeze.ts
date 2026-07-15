export function deepFreezeValue<T>(
  value: T,
  seen: WeakSet<object> = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreezeValue(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}
