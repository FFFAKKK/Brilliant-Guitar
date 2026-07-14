export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type ExtensionOwner =
  | { readonly kind: "score" }
  | { readonly kind: "part"; readonly partId: string };

export interface ExtensionBlock {
  readonly namespace: string;
  readonly schemaVersion: number;
  readonly owner: ExtensionOwner;
  readonly payload: JsonObject;
}

function isJsonValueInternal(value: unknown, active: Set<object>): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (active.has(value)) {
    return false;
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (
          !Object.prototype.hasOwnProperty.call(value, index) ||
          !isJsonValueInternal(value[index], active)
        ) {
          return false;
        }
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    return Object.keys(value).every((key) =>
      isJsonValueInternal((value as Record<string, unknown>)[key], active),
    );
  } catch {
    return false;
  } finally {
    active.delete(value);
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueInternal(value, new Set<object>());
}
