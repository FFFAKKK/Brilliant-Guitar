import { readJsonContainerValues } from "./strict-data";

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

type JsonTraversalFrame =
  | { readonly kind: "enter"; readonly value: unknown }
  | { readonly kind: "exit"; readonly value: object };

export function isJsonValue(value: unknown): value is JsonValue {
  const activePath = new Set<object>();
  const completed = new Set<object>();
  const stack: JsonTraversalFrame[] = [{ kind: "enter", value }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      return false;
    }
    if (frame.kind === "exit") {
      activePath.delete(frame.value);
      completed.add(frame.value);
      continue;
    }

    const current = frame.value;
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        return false;
      }
      continue;
    }
    if (typeof current !== "object") {
      return false;
    }
    if (completed.has(current)) {
      continue;
    }
    if (activePath.has(current)) {
      return false;
    }

    const children = readJsonContainerValues(current);
    if (children === undefined) {
      return false;
    }
    activePath.add(current);
    stack.push({ kind: "exit", value: current });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ kind: "enter", value: children[index] });
    }
  }

  return true;
}
