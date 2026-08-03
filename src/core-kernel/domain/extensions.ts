import {
  areCachedRealmArrayPrototypesValid,
  hasUnchangedBuiltinDataValue,
  readJsonContainerValues,
} from "./strict-data";

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

const reflectApply = Reflect.apply;
const arrayConstructor = Array;
const arrayPop = arrayConstructor.prototype.pop;
const arrayPush = arrayConstructor.prototype.push;
const numberConstructor = Number;
const numberIsFinite = numberConstructor.isFinite;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setDelete = setConstructor.prototype.delete;
const setHas = setConstructor.prototype.has;

function hasIntactTraversalPrimordials(): boolean {
  return (
    hasUnchangedBuiltinDataValue(
      arrayConstructor.prototype,
      "pop",
      arrayPop,
    ) &&
    hasUnchangedBuiltinDataValue(
      arrayConstructor.prototype,
      "push",
      arrayPush,
    ) &&
    hasUnchangedBuiltinDataValue(
      numberConstructor,
      "isFinite",
      numberIsFinite,
    ) &&
    hasUnchangedBuiltinDataValue(setConstructor.prototype, "add", setAdd) &&
    hasUnchangedBuiltinDataValue(
      setConstructor.prototype,
      "delete",
      setDelete,
    ) &&
    hasUnchangedBuiltinDataValue(setConstructor.prototype, "has", setHas)
  );
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    const activePath = new setConstructor<object>();
    const completed = new setConstructor<object>();
    const validatedArrayPrototypes: object[] = [];
    const stack: JsonTraversalFrame[] = [{ kind: "enter", value }];

    while (stack.length > 0) {
      const frame = reflectApply(arrayPop, stack, []) as
        | JsonTraversalFrame
        | undefined;
      if (frame === undefined) {
        return false;
      }
      if (frame.kind === "exit") {
        reflectApply(setDelete, activePath, [frame.value]);
        reflectApply(setAdd, completed, [frame.value]);
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
        if (
          reflectApply(numberIsFinite, numberConstructor, [current]) !== true
        ) {
          return false;
        }
        continue;
      }
      if (typeof current !== "object") {
        return false;
      }
      if (reflectApply(setHas, completed, [current]) === true) {
        continue;
      }
      if (reflectApply(setHas, activePath, [current]) === true) {
        return false;
      }

      const children = readJsonContainerValues(
        current,
        validatedArrayPrototypes,
      );
      if (children === undefined || !hasIntactTraversalPrimordials()) {
        return false;
      }
      reflectApply(setAdd, activePath, [current]);
      reflectApply(arrayPush, stack, [{ kind: "exit", value: current }]);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        reflectApply(arrayPush, stack, [
          { kind: "enter", value: children[index] },
        ]);
      }
    }

    return (
      hasIntactTraversalPrimordials() &&
      areCachedRealmArrayPrototypesValid(validatedArrayPrototypes)
    );
  } catch {
    return false;
  }
}
