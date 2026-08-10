import type {
  CoreSelectorRequest,
  KernelCapability,
  KernelModuleOrigin,
  KernelModuleRuntime,
  KernelRegistryStartupFailure,
  KernelTrustLevel,
} from "./contracts";

export type ExactDataRecord = Readonly<Record<string, unknown>>;

export interface DecodedKernelStartupModuleDeclaration {
  readonly moduleId: string;
  readonly origin: KernelModuleOrigin;
  readonly runtime: KernelModuleRuntime;
  readonly trustLevel: KernelTrustLevel;
  readonly apiVersion: number;
  readonly capabilities: readonly KernelCapability[];
  readonly registrationEntryIds: readonly string[];
}

export interface DecodedKernelStartupManifest {
  readonly startupManifestVersion: 1;
  readonly modules: readonly DecodedKernelStartupModuleDeclaration[];
}

export type KernelStartupManifestDecodeResult =
  | { readonly ok: true; readonly value: DecodedKernelStartupManifest }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

const MAX_REGISTRY_ID_LENGTH = 128;

const reflectApply = Reflect.apply;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const reflectGetPrototypeOf = Reflect.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const arrayConstructor = Array;
const arrayIncludes = arrayConstructor.prototype.includes;
const arrayIsArray = arrayConstructor.isArray;
const arrayPush = arrayConstructor.prototype.push;
const arraySort = arrayConstructor.prototype.sort;
const numberConstructor = Number;
const numberIsSafeInteger = numberConstructor.isSafeInteger;
const numberToString = numberConstructor.prototype.toString;
const objectPrototype = Object.prototype;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setHas = setConstructor.prototype.has;
const stringCharCodeAt = String.prototype.charCodeAt;

const KERNEL_CAPABILITIES: readonly KernelCapability[] = [
  "registry:read",
  "command:register",
  "selector:register",
  "command:execute",
  "selector:execute",
  "score:read",
  "event:subscribe",
];

function invalidStartupInput(): KernelStartupManifestDecodeResult {
  return {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  };
}

export function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): ExactDataRecord | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    reflectApply(arrayIsArray, arrayConstructor, [value]) === true
  ) {
    return undefined;
  }
  const prototype = reflectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    return undefined;
  }
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== expectedKeys.length) {
    return undefined;
  }
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (
      typeof key !== "string" ||
      reflectApply(arrayIncludes, expectedKeys, [key]) !== true
    ) {
      return undefined;
    }
  }
  const decoded: Record<string, unknown> = {};
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (key === undefined) {
      return undefined;
    }
    const descriptor = reflectGetOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    decoded[key] = descriptor.value;
  }
  return decoded;
}

export function readDenseArray(value: unknown): readonly unknown[] | undefined {
  if (reflectApply(arrayIsArray, arrayConstructor, [value]) !== true) {
    return undefined;
  }
  const arrayValue = value as object;
  const lengthDescriptor = reflectGetOwnPropertyDescriptor(
    arrayValue,
    "length",
  );
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    reflectApply(numberIsSafeInteger, numberConstructor, [
      lengthDescriptor.value,
    ]) !== true ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;
  const ownKeys = reflectOwnKeys(arrayValue);
  if (ownKeys.length !== length + 1) {
    return undefined;
  }

  const decoded: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const indexKey = reflectApply(numberToString, index, []) as string;
    const descriptor = reflectGetOwnPropertyDescriptor(
      arrayValue,
      indexKey,
    );
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    reflectApply(arrayPush, decoded, [descriptor.value]);
  }
  return decoded;
}

export function isSafeRegistryId(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_REGISTRY_ID_LENGTH
  ) {
    return false;
  }

  let previousWasSeparator = true;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = reflectApply(stringCharCodeAt, value, [index]) as number;
    const isLowercaseLetterOrDigit =
      (codeUnit >= 48 && codeUnit <= 57) ||
      (codeUnit >= 97 && codeUnit <= 122);
    if (isLowercaseLetterOrDigit) {
      previousWasSeparator = false;
      continue;
    }
    const isSeparator = codeUnit === 45 || codeUnit === 46;
    if (!isSeparator || previousWasSeparator) {
      return false;
    }
    previousWasSeparator = true;
  }

  return !previousWasSeparator;
}

function isKernelCapability(value: unknown): value is KernelCapability {
  return (
    typeof value === "string" &&
    reflectApply(arrayIncludes, KERNEL_CAPABILITIES, [value]) === true
  );
}

function decodeCapabilities(value: unknown): readonly KernelCapability[] | undefined {
  const input = readDenseArray(value);
  if (input === undefined) {
    return undefined;
  }
  const capabilities: KernelCapability[] = [];
  const seen = new setConstructor<KernelCapability>();
  for (let index = 0; index < input.length; index += 1) {
    const candidate = input[index];
    if (
      !isKernelCapability(candidate) ||
      reflectApply(setHas, seen, [candidate]) === true
    ) {
      return undefined;
    }
    reflectApply(setAdd, seen, [candidate]);
    reflectApply(arrayPush, capabilities, [candidate]);
  }
  return reflectApply(arraySort, capabilities, []) as KernelCapability[];
}

function decodeRegistrationEntryIds(value: unknown): readonly string[] | undefined {
  const input = readDenseArray(value);
  if (input === undefined) {
    return undefined;
  }
  const registrationEntryIds: string[] = [];
  const seen = new setConstructor<string>();
  for (let index = 0; index < input.length; index += 1) {
    const candidate = input[index];
    if (
      !isSafeRegistryId(candidate) ||
      reflectApply(setHas, seen, [candidate]) === true
    ) {
      return undefined;
    }
    reflectApply(setAdd, seen, [candidate]);
    reflectApply(arrayPush, registrationEntryIds, [candidate]);
  }
  return reflectApply(arraySort, registrationEntryIds, []) as string[];
}

function decodeOrigin(value: unknown): KernelModuleOrigin | undefined {
  return value === "official" || value === "third-party" ? value : undefined;
}

function decodeRuntime(value: unknown): KernelModuleRuntime | undefined {
  return value === "builtin" ||
    value === "internal-module" ||
    value === "javascript-typescript"
    ? value
    : undefined;
}

function decodeTrustLevel(value: unknown): KernelTrustLevel | undefined {
  return value === "system-trusted" || value === "sandboxed"
    ? value
    : undefined;
}

function decodeModule(
  value: unknown,
): DecodedKernelStartupModuleDeclaration | undefined {
  const record = readExactDataRecord(value, [
    "moduleId",
    "origin",
    "runtime",
    "trustLevel",
    "apiVersion",
    "capabilities",
    "registrationEntryIds",
  ]);
  if (record === undefined || !isSafeRegistryId(record.moduleId)) {
    return undefined;
  }
  const origin = decodeOrigin(record.origin);
  const runtime = decodeRuntime(record.runtime);
  const trustLevel = decodeTrustLevel(record.trustLevel);
  const capabilities = decodeCapabilities(record.capabilities);
  const registrationEntryIds = decodeRegistrationEntryIds(
    record.registrationEntryIds,
  );
  if (
    origin === undefined ||
    runtime === undefined ||
    trustLevel === undefined ||
    typeof record.apiVersion !== "number" ||
    reflectApply(numberIsSafeInteger, numberConstructor, [record.apiVersion]) !==
      true ||
    capabilities === undefined ||
    registrationEntryIds === undefined
  ) {
    return undefined;
  }
  return {
    moduleId: record.moduleId,
    origin,
    runtime,
    trustLevel,
    apiVersion: record.apiVersion,
    capabilities,
    registrationEntryIds,
  };
}

export function decodeKernelStartupManifest(
  input: unknown,
): KernelStartupManifestDecodeResult {
  try {
    const record = readExactDataRecord(input, [
      "startupManifestVersion",
      "modules",
    ]);
    const modules = readDenseArray(record?.modules);
    if (
      record === undefined ||
      record.startupManifestVersion !== 1 ||
      modules === undefined
    ) {
      return invalidStartupInput();
    }

    const decodedModules: DecodedKernelStartupModuleDeclaration[] = [];
    for (let index = 0; index < modules.length; index += 1) {
      const decoded = decodeModule(modules[index]);
      if (decoded === undefined) {
        return invalidStartupInput();
      }
      reflectApply(arrayPush, decodedModules, [decoded]);
    }
    return {
      ok: true,
      value: {
        startupManifestVersion: 1,
        modules: decodedModules,
      },
    };
  } catch {
    return invalidStartupInput();
  }
}

function readDataProperty(
  record: ExactDataRecord,
  key: string,
): unknown {
  const descriptor = reflectGetOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

export function decodeCoreSelectorRequest(
  input: unknown,
): CoreSelectorRequest | undefined {
  try {
    const noArgument = readExactDataRecord(input, ["selectorId"]);
    if (noArgument !== undefined) {
      const selectorId = readDataProperty(noArgument, "selectorId");
      if (
        selectorId === "core.selector.score-metadata" ||
        selectorId === "core.selector.history-state" ||
        selectorId === "core.selector.dirty-state"
      ) {
        return { selectorId };
      }
      return undefined;
    }

    const addressRequest = readExactDataRecord(input, [
      "selectorId",
      "address",
    ]);
    if (addressRequest !== undefined) {
      const selectorId = readDataProperty(addressRequest, "selectorId");
      const address = readDataProperty(addressRequest, "address");
      if (
        selectorId === "core.selector.score-entity" ||
        selectorId === "core.selector.score-entity-ownership"
      ) {
        return { selectorId, address };
      }
      return undefined;
    }

    const rangeRequest = readExactDataRecord(input, ["selectorId", "range"]);
    if (rangeRequest !== undefined) {
      const selectorId = readDataProperty(rangeRequest, "selectorId");
      if (selectorId === "core.selector.score-range") {
        return {
          selectorId,
          range: readDataProperty(rangeRequest, "range"),
        };
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
