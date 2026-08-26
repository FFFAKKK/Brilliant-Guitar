import type { JsonObject } from "../domain/extensions";
import {
  createDiagnostic,
  type DecodeDiagnostic,
  type DiagnosticPath,
} from "../validation/diagnostics";

export const STRICT_INPUT_MAX_DEPTH = 64 as const;
export const STRICT_INPUT_MAX_PROPERTIES = 1_048_576 as const;
const STRICT_INPUT_NATIVE_WIRE_MAX_PROPERTIES = 1_572_864 as const;

type StrictInputCaptureProfile = "default" | "native-wire-v1";
type StrictInputPropertyLimit =
  | typeof STRICT_INPUT_MAX_PROPERTIES
  | typeof STRICT_INPUT_NATIVE_WIRE_MAX_PROPERTIES;

export type StrictInputLimitKind = "input-depth" | "input-properties";

export type CaptureStrictInputResult =
  | { readonly status: "captured"; readonly value: unknown }
  | { readonly status: "invalid"; readonly diagnostic: DecodeDiagnostic }
  | {
      readonly status: "resource-limit-exceeded";
      readonly limitKind: "input-depth";
      readonly limit: 64;
      readonly actual: 65;
    }
  | {
      readonly status: "resource-limit-exceeded";
      readonly limitKind: "input-properties";
      readonly limit: 1_048_576;
      readonly actual: 1_048_577;
    }
  | {
      readonly status: "resource-limit-exceeded";
      readonly limitKind: "input-properties";
      readonly limit: 1_572_864;
      readonly actual: 1_572_865;
    };

interface DataDescriptor extends PropertyDescriptor {
  readonly value: unknown;
}

interface ValueTask {
  readonly kind: "value";
  readonly value: unknown;
  readonly path: DiagnosticPath;
  readonly depth: number;
  readonly assign: (value: unknown) => void;
}

interface RecordFrame {
  readonly kind: "record";
  readonly input: object;
  readonly output: object;
  readonly path: DiagnosticPath;
  readonly depth: number;
  readonly keys: readonly string[];
  index: number;
}

interface ArrayFrame {
  readonly kind: "array";
  readonly input: object;
  readonly output: object;
  readonly path: DiagnosticPath;
  readonly depth: number;
  readonly length: number;
  index: number;
}

type CaptureTask = ValueTask | RecordFrame | ArrayFrame;

type ContainerDescription =
  | { readonly kind: "record"; readonly keys: readonly string[] }
  | { readonly kind: "array"; readonly length: number };

const reflectObject = Reflect;
const reflectApply = reflectObject.apply;
const reflectGetOwnPropertyDescriptor = reflectObject.getOwnPropertyDescriptor;
const reflectGetPrototypeOf = reflectObject.getPrototypeOf;
const reflectOwnKeys = reflectObject.ownKeys;

const arrayConstructor = Array;
const arrayIsArray = arrayConstructor.isArray;

const objectConstructor = Object;
const objectCreate = objectConstructor.create;
const objectDefineProperty = objectConstructor.defineProperty;
const objectFreeze = objectConstructor.freeze;
const objectPrototype = objectConstructor.prototype;

const numberConstructor = Number;
const numberIsFinite = numberConstructor.isFinite;
const numberIsSafeInteger = numberConstructor.isSafeInteger;
const stringConstructor = String;

const functionPrototype = Function.prototype;
const functionToString = functionPrototype.toString;
const weakMapConstructor = WeakMap;
const weakMapGet = weakMapConstructor.prototype.get;
const weakMapSet = weakMapConstructor.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetAdd = weakSetConstructor.prototype.add;
const weakSetDelete = weakSetConstructor.prototype.delete;
const weakSetHas = weakSetConstructor.prototype.has;

const intrinsicArrayConstructorSource = functionSource(arrayConstructor);
const intrinsicObjectConstructorSource = functionSource(objectConstructor);

function functionSource(value: Function): string {
  return reflectApply(functionToString, value, []) as string;
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

function hasNoOwnJsonSerializationHook(value: object): boolean {
  return reflectGetOwnPropertyDescriptor(value, "toJSON") === undefined;
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

function hasRealmObjectPrototype(value: object): boolean {
  return (
    hasNativeConstructorBackReference(value, intrinsicObjectConstructorSource) &&
    reflectGetPrototypeOf(value) === null &&
    hasNoOwnJsonSerializationHook(value)
  );
}

function isRealmArrayPrototype(prototype: object): boolean {
  if (reflectApply(arrayIsArray, arrayConstructor, [prototype]) !== true) {
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
    reflectApply(arrayIsArray, arrayConstructor, [parent]) !== true &&
    hasRealmObjectPrototype(parent) &&
    hasNoOwnJsonSerializationHook(prototype)
  );
}

function isPlainRecord(value: object): boolean {
  const prototype = reflectGetPrototypeOf(value);
  return prototype === objectPrototype || prototype === null;
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

function invalid(
  code: DecodeDiagnostic["code"],
  path: DiagnosticPath,
  details?: JsonObject,
): CaptureStrictInputResult {
  return {
    status: "invalid",
    diagnostic: createDiagnostic(code, path, details),
  };
}

function depthLimit(): CaptureStrictInputResult {
  return {
    status: "resource-limit-exceeded",
    limitKind: "input-depth",
    limit: STRICT_INPUT_MAX_DEPTH,
    actual: 65,
  };
}

function propertyLimit(limit: StrictInputPropertyLimit): CaptureStrictInputResult {
  return limit === STRICT_INPUT_MAX_PROPERTIES
    ? {
        status: "resource-limit-exceeded",
        limitKind: "input-properties",
        limit: STRICT_INPUT_MAX_PROPERTIES,
        actual: 1_048_577,
      }
    : {
        status: "resource-limit-exceeded",
        limitKind: "input-properties",
        limit: STRICT_INPUT_NATIVE_WIRE_MAX_PROPERTIES,
        actual: 1_572_865,
      };
}

function propertyLimitForProfile(
  profile: StrictInputCaptureProfile,
): StrictInputPropertyLimit | undefined {
  switch (profile) {
    case "default":
      return STRICT_INPUT_MAX_PROPERTIES;
    case "native-wire-v1":
      return STRICT_INPUT_NATIVE_WIRE_MAX_PROPERTIES;
    default:
      return undefined;
  }
}

function describeArray(
  value: object,
  path: DiagnosticPath,
): ContainerDescription | CaptureStrictInputResult {
  const prototype = reflectGetPrototypeOf(value);
  if (prototype === null || !isRealmArrayPrototype(prototype)) {
    return invalid("decode.json-value", path, { reason: "sparse-array" });
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
    return invalid("decode.json-value", path, { reason: "sparse-array" });
  }
  const length = lengthDescriptor.value;
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== length + 1) {
    return invalid("decode.json-value", path, { reason: "sparse-array" });
  }
  let hasLength = false;
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (key === undefined) {
      return invalid("decode.unreadable-input", path);
    }
    if (typeof key === "symbol") {
      return invalid("decode.json-value", path, { reason: "symbol-key" });
    }
    if (key === "length") {
      hasLength = true;
      continue;
    }
    if (!isCanonicalArrayIndex(key, length)) {
      return invalid("decode.json-value", path, { reason: "sparse-array" });
    }
  }
  return hasLength
    ? { kind: "array", length }
    : invalid("decode.json-value", path, { reason: "sparse-array" });
}

function describeRecord(
  value: object,
  path: DiagnosticPath,
): ContainerDescription | CaptureStrictInputResult {
  if (!isPlainRecord(value)) {
    return invalid("decode.json-value", path, { reason: "non-plain-record" });
  }
  const ownKeys = reflectOwnKeys(value);
  const keys: string[] = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (key === undefined) {
      return invalid("decode.unreadable-input", path);
    }
    if (typeof key !== "string") {
      return invalid("decode.json-value", path, { reason: "symbol-key" });
    }
    keys[keys.length] = key;
  }
  return { kind: "record", keys };
}

function defineCapturedProperty(
  target: object,
  key: string,
  value: unknown,
): void {
  reflectApply(objectDefineProperty, objectConstructor, [target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  }]);
}

function freezeCapturedContainers(containers: readonly object[]): void {
  for (let index = containers.length - 1; index >= 0; index -= 1) {
    const container = containers[index];
    if (container === undefined) {
      throw new TypeError("captured container is missing");
    }
    reflectApply(objectFreeze, objectConstructor, [container]);
  }
}

/**
 * Descriptor-first bounded capture for CVN-3 inputs. It never reads an input
 * through ordinary property access and creates a fresh, deeply frozen graph.
 */
export function captureStrictInput(
  input: unknown,
  profile: StrictInputCaptureProfile = "default",
): CaptureStrictInputResult {
  const maxProperties = propertyLimitForProfile(profile);
  if (maxProperties === undefined) {
    return invalid("decode.unreadable-input", []);
  }
  let unreadablePath: DiagnosticPath = [];
  try {
    const activePath = new weakSetConstructor<object>();
    const completed = new weakMapConstructor<object, object>();
    const tasks: CaptureTask[] = [];
    const capturedContainers: object[] = [];
    let taskCount = 0;
    let capturedContainerCount = 0;
    let propertyCount = 0;
    let rootValue: unknown;
    let rootAssigned = false;

    const pushTask = (task: CaptureTask): void => {
      tasks[taskCount] = task;
      taskCount += 1;
    };

    pushTask({
      kind: "value",
      value: input,
      path: [],
      depth: 0,
      assign: (value) => {
        rootValue = value;
        rootAssigned = true;
      },
    });

    while (taskCount > 0) {
      taskCount -= 1;
      const task = tasks[taskCount];
      delete tasks[taskCount];
      if (task === undefined) {
        return invalid("decode.unreadable-input", unreadablePath);
      }

      if (task.kind === "value") {
        const { value, path, depth, assign } = task;
        unreadablePath = path;
        if (
          value === null ||
          typeof value === "boolean" ||
          typeof value === "string"
        ) {
          assign(value);
          continue;
        }
        if (typeof value === "number") {
          if (
            reflectApply(numberIsFinite, numberConstructor, [value]) !== true
          ) {
            return invalid("decode.non-finite-number", path);
          }
          assign(value);
          continue;
        }
        if (typeof value !== "object") {
          return invalid("decode.json-value", path, {
            reason: "unsupported-value",
          });
        }

        if (reflectApply(weakSetHas, activePath, [value]) === true) {
          return invalid("decode.json-value", path, { reason: "cycle" });
        }
        const completedValue = reflectApply(weakMapGet, completed, [value]) as
          | object
          | undefined;
        if (completedValue !== undefined) {
          assign(completedValue);
          continue;
        }

        const description = reflectApply(arrayIsArray, arrayConstructor, [value])
          ? describeArray(value, path)
          : describeRecord(value, path);
        if ("status" in description) {
          return description;
        }
        const output =
          description.kind === "array"
            ? []
            : (reflectApply(objectCreate, objectConstructor, [null]) as object);
        assign(output);
        reflectApply(weakSetAdd, activePath, [value]);
        capturedContainers[capturedContainerCount] = output;
        capturedContainerCount += 1;
        if (description.kind === "array") {
          pushTask({
            kind: "array",
            input: value,
            output,
            path,
            depth,
            length: description.length,
            index: 0,
          });
        } else {
          pushTask({
            kind: "record",
            input: value,
            output,
            path,
            depth,
            keys: description.keys,
            index: 0,
          });
        }
        continue;
      }

      const isArray = task.kind === "array";
      const propertyCountForContainer = isArray ? task.length : task.keys.length;
      if (task.index >= propertyCountForContainer) {
        unreadablePath = task.path;
        reflectApply(weakSetDelete, activePath, [task.input]);
        reflectApply(weakMapSet, completed, [task.input, task.output]);
        continue;
      }

      const index = task.index;
      task.index += 1;
      const key = isArray
        ? (reflectApply(stringConstructor, undefined, [index]) as string)
        : task.keys[index];
      if (key === undefined) {
        return invalid("decode.unreadable-input", task.path);
      }
      const pathSegment: string | number = isArray ? index : key;
      const propertyPath: DiagnosticPath = [...task.path, pathSegment];
      const childDepth = task.depth + 1;
      if (childDepth > STRICT_INPUT_MAX_DEPTH) {
        return depthLimit();
      }
      if (propertyCount >= maxProperties) {
        return propertyLimit(maxProperties);
      }
      propertyCount += 1;

      unreadablePath = propertyPath;
      const descriptor = reflectGetOwnPropertyDescriptor(task.input, key);
      if (!isEnumerableDataDescriptor(descriptor)) {
        return invalid("decode.unreadable-input", propertyPath);
      }
      pushTask(task);
      pushTask({
        kind: "value",
        value: descriptor.value,
        path: propertyPath,
        depth: childDepth,
        assign: (capturedValue) => {
          defineCapturedProperty(task.output, key, capturedValue);
        },
      });
    }

    if (!rootAssigned) {
      return invalid("decode.unreadable-input", []);
    }
    unreadablePath = [];
    freezeCapturedContainers(capturedContainers);
    return { status: "captured", value: rootValue };
  } catch {
    return invalid("decode.unreadable-input", unreadablePath);
  }
}
