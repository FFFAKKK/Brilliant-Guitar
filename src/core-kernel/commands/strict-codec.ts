import { captureStrictInput } from "../codec/strict-input-capture";
import { deepFreezeValue } from "../read/deep-freeze";
import {
  readDenseArray as readPrimordialDenseArray,
  readExactDataRecord,
} from "../registry/strict-codec";
import type { CommandFailure, CoreCommandEnvelope } from "./contracts";
import {
  decodeCoreCommandTarget,
  decodeCoreCommandTargetKind,
} from "./core-command-adapters";
import {
  DEFAULT_CORE_EXECUTION_ASSEMBLY,
  findCoreExecutionDefinition,
  type CoreExecutionAssembly,
} from "./execution-assembly";

export type DecodeResult =
  | { readonly ok: true; readonly value: CoreCommandEnvelope }
  | { readonly ok: false; readonly failure: CommandFailure };

const reflectObject = Reflect;
const reflectApply = reflectObject.apply;
const reflectGetOwnPropertyDescriptor = reflectObject.getOwnPropertyDescriptor;
const reflectGetPrototypeOf = reflectObject.getPrototypeOf;
const reflectOwnKeys = reflectObject.ownKeys;
const arrayConstructor = Array;
const arrayIsArray = Array.isArray;
const arrayEvery = Array.prototype.every;
const arrayFilter = Array.prototype.filter;
const arrayFind = Array.prototype.find;
const arrayForEach = Array.prototype.forEach;
const arrayPush = Array.prototype.push;
const arrayPop = Array.prototype.pop;
const arrayReverse = Array.prototype.reverse;
const arraySlice = Array.prototype.slice;
const arraySort = Array.prototype.sort;
const arraySplice = Array.prototype.splice;
const arrayUnshift = Array.prototype.unshift;
const arrayMap = Array.prototype.map;
const arraySome = Array.prototype.some;
const arrayIncludes = Array.prototype.includes;
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const objectConstructor = Object;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setDelete = setConstructor.prototype.delete;
const setHas = setConstructor.prototype.has;
const mapConstructor = Map;
const mapGet = mapConstructor.prototype.get;
const mapHas = mapConstructor.prototype.has;
const mapSet = mapConstructor.prototype.set;
const weakMapConstructor = WeakMap;
const weakMapGet = weakMapConstructor.prototype.get;
const weakMapSet = weakMapConstructor.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetAdd = weakSetConstructor.prototype.add;
const weakSetHas = weakSetConstructor.prototype.has;
const stringConstructor = String;

function hasDataValue(owner: object, key: PropertyKey, expected: unknown): boolean {
  const descriptor = reflectGetOwnPropertyDescriptor(owner, key);
  return descriptor !== undefined && "value" in descriptor && descriptor.value === expected;
}

/**
 * A bounded input capture may invoke Proxy reflection traps. Reject before
 * decoding or preparation if such a trap changed a mutable intrinsic used by
 * the command/effect spine.
 */
function hasIntactCommandPrimordials(): boolean {
  return hasDataValue(globalThis, "Reflect", reflectObject) &&
    hasDataValue(reflectObject, "apply", reflectApply) &&
    hasDataValue(reflectObject, "getOwnPropertyDescriptor", reflectGetOwnPropertyDescriptor) &&
    hasDataValue(reflectObject, "getPrototypeOf", reflectGetPrototypeOf) &&
    hasDataValue(reflectObject, "ownKeys", reflectOwnKeys) &&
    hasDataValue(globalThis, "Array", arrayConstructor) &&
    hasDataValue(arrayConstructor, "isArray", arrayIsArray) &&
    hasDataValue(arrayConstructor.prototype, "every", arrayEvery) &&
    hasDataValue(arrayConstructor.prototype, "filter", arrayFilter) &&
    hasDataValue(arrayConstructor.prototype, "find", arrayFind) &&
    hasDataValue(arrayConstructor.prototype, "forEach", arrayForEach) &&
    hasDataValue(arrayConstructor.prototype, "push", arrayPush) &&
    hasDataValue(arrayConstructor.prototype, "pop", arrayPop) &&
    hasDataValue(arrayConstructor.prototype, "reverse", arrayReverse) &&
    hasDataValue(arrayConstructor.prototype, "slice", arraySlice) &&
    hasDataValue(arrayConstructor.prototype, "sort", arraySort) &&
    hasDataValue(arrayConstructor.prototype, "splice", arraySplice) &&
    hasDataValue(arrayConstructor.prototype, "unshift", arrayUnshift) &&
    hasDataValue(arrayConstructor.prototype, "map", arrayMap) &&
    hasDataValue(arrayConstructor.prototype, "some", arraySome) &&
    hasDataValue(arrayConstructor.prototype, "includes", arrayIncludes) &&
    hasDataValue(globalThis, "Number", numberConstructor) &&
    hasDataValue(numberConstructor, "isFinite", numberIsFinite) &&
    hasDataValue(numberConstructor, "isSafeInteger", numberIsSafeInteger) &&
    hasDataValue(numberConstructor, "MAX_SAFE_INTEGER", numberMaxSafeInteger) &&
    hasDataValue(globalThis, "Object", objectConstructor) &&
    hasDataValue(objectConstructor, "create", objectCreate) &&
    hasDataValue(objectConstructor, "freeze", objectFreeze) &&
    hasDataValue(objectConstructor, "getOwnPropertyDescriptor", objectGetOwnPropertyDescriptor) &&
    hasDataValue(objectConstructor, "getPrototypeOf", objectGetPrototypeOf) &&
    hasDataValue(objectConstructor, "hasOwn", objectHasOwn) &&
    hasDataValue(objectConstructor, "keys", objectKeys) &&
    hasDataValue(globalThis, "Set", setConstructor) &&
    hasDataValue(setConstructor.prototype, "add", setAdd) &&
    hasDataValue(setConstructor.prototype, "delete", setDelete) &&
    hasDataValue(setConstructor.prototype, "has", setHas) &&
    hasDataValue(globalThis, "Map", mapConstructor) &&
    hasDataValue(mapConstructor.prototype, "get", mapGet) &&
    hasDataValue(mapConstructor.prototype, "has", mapHas) &&
    hasDataValue(mapConstructor.prototype, "set", mapSet) &&
    hasDataValue(globalThis, "WeakMap", weakMapConstructor) &&
    hasDataValue(weakMapConstructor.prototype, "get", weakMapGet) &&
    hasDataValue(weakMapConstructor.prototype, "set", weakMapSet) &&
    hasDataValue(globalThis, "WeakSet", weakSetConstructor) &&
    hasDataValue(weakSetConstructor.prototype, "add", weakSetAdd) &&
    hasDataValue(weakSetConstructor.prototype, "has", weakSetHas) &&
    hasDataValue(globalThis, "String", stringConstructor);
}

function ownDataValue(record: object, key: string): unknown {
  const descriptor = reflectGetOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function invalidEnvelope(): DecodeResult {
  return { ok: false, failure: { code: "command.invalid-envelope" } };
}

function preflightBatchInput(input: unknown): DecodeResult | undefined {
  const envelope = readExactDataRecord(input, [
    "commandVersion",
    "commandId",
    "target",
    "payload",
  ]);
  const payload = readExactDataRecord(
    envelope === undefined ? undefined : ownDataValue(envelope, "payload"),
    ["commands"],
  );
  if (payload === undefined) {
    return invalidEnvelope();
  }
  const rawCommands = ownDataValue(payload, "commands");
  if (reflectApply(arrayIsArray, arrayConstructor, [rawCommands]) !== true) {
    return invalidEnvelope();
  }
  const lengthDescriptor = reflectGetOwnPropertyDescriptor(rawCommands as object, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    reflectApply(numberIsSafeInteger, numberConstructor, [lengthDescriptor.value]) !== true ||
    lengthDescriptor.value < 0
  ) {
    return invalidEnvelope();
  }
  const length = lengthDescriptor.value;
  if (length > 100) {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "batch-children",
        limit: 100,
        actual: length,
      },
    };
  }
  const commands = readPrimordialDenseArray(rawCommands);
  if (commands === undefined) {
    return invalidEnvelope();
  }
  return length === 0
    ? { ok: false, failure: { code: "command.batch-empty" } }
    : undefined;
}

function decodeBoundedVnextCommand(
  input: unknown,
  commandVersion: number,
  commandId: string,
  assembly: CoreExecutionAssembly,
): DecodeResult {
  if (commandId === "core.transaction.batch") {
    const preflight = preflightBatchInput(input);
    if (preflight !== undefined) {
      return preflight;
    }
  }
  const captured = captureStrictInput(input);
  if (captured.status === "resource-limit-exceeded") {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: captured.limitKind,
        limit: captured.limit,
        actual: captured.actual,
      },
    };
  }
  if (captured.status === "invalid") {
    return invalidEnvelope();
  }

  if (!hasIntactCommandPrimordials()) {
    return invalidEnvelope();
  }

  const envelope = readExactDataRecord(captured.value, [
    "commandVersion",
    "commandId",
    "target",
    "payload",
  ]);
  if (envelope === undefined) {
    return invalidEnvelope();
  }
  const capturedVersion = ownDataValue(envelope, "commandVersion");
  const capturedId = ownDataValue(envelope, "commandId");
  const capturedTarget = ownDataValue(envelope, "target");
  const capturedPayload = ownDataValue(envelope, "payload");
  if (capturedVersion !== commandVersion || capturedId !== commandId) {
    return invalidEnvelope();
  }
  const definition = findCoreExecutionDefinition(assembly, commandId);
  if (definition === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const capturedTargetKind = decodeCoreCommandTargetKind(capturedTarget);
  if (capturedTargetKind !== definition.targetKind) {
    return invalidEnvelope();
  }
  const target = decodeCoreCommandTarget(capturedTarget, definition.targetKind);
  if (target === undefined) {
    return invalidEnvelope();
  }
  const decoded = definition.decodePayload(capturedPayload, target);
  return decoded === undefined
    ? invalidEnvelope()
    : { ok: true, value: deepFreezeValue(decoded) };
}

export function decodeCoreCommand(
  input: unknown,
  assembly: CoreExecutionAssembly = DEFAULT_CORE_EXECUTION_ASSEMBLY,
): DecodeResult {
  try {
    const envelope = readExactDataRecord(input, [
      "commandVersion",
      "commandId",
      "target",
      "payload",
    ]);
    if (envelope === undefined) {
      return invalidEnvelope();
    }
    const commandVersion = ownDataValue(envelope, "commandVersion");
    if (
      typeof commandVersion !== "number" ||
      reflectApply(numberIsSafeInteger, numberConstructor, [commandVersion]) !== true
    ) {
      return invalidEnvelope();
    }
    if (commandVersion !== 1) {
      return { ok: false, failure: { code: "command.unsupported-version" } };
    }
    const commandId = ownDataValue(envelope, "commandId");
    if (typeof commandId !== "string") {
      return invalidEnvelope();
    }
    const definition = findCoreExecutionDefinition(assembly, commandId);
    if (definition === undefined) {
      return { ok: false, failure: { code: "command.unknown-id" } };
    }
    const rawTarget = ownDataValue(envelope, "target");
    const actualTargetKind = decodeCoreCommandTargetKind(rawTarget);
    if (actualTargetKind === undefined) {
      return invalidEnvelope();
    }
    if (actualTargetKind !== definition.targetKind) {
      return { ok: false, failure: { code: "command.target-mismatch" } };
    }
    if (definition.inputBoundary === "vnext-bounded-v1") {
      return decodeBoundedVnextCommand(
        input,
        commandVersion,
        commandId,
        assembly,
      );
    }

    const target = decodeCoreCommandTarget(rawTarget, definition.targetKind);
    if (target === undefined) {
      return invalidEnvelope();
    }
    const decoded = definition.decodePayload(
      ownDataValue(envelope, "payload"),
      target,
    );
    return decoded === undefined
      ? invalidEnvelope()
      : { ok: true, value: deepFreezeValue(decoded) };
  } catch {
    return invalidEnvelope();
  }
}
