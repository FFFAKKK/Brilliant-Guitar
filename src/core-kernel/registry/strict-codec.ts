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

const MODULE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const MAX_REGISTRY_ID_LENGTH = 128;

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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return undefined;
  }
  const decoded: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
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
  if (!Array.isArray(value)) {
    return undefined;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return undefined;
  }

  const decoded: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    decoded.push(descriptor.value);
  }
  return decoded;
}

export function isSafeRegistryId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_REGISTRY_ID_LENGTH &&
    MODULE_ID_PATTERN.test(value)
  );
}

function isKernelCapability(value: unknown): value is KernelCapability {
  return (
    typeof value === "string" &&
    (KERNEL_CAPABILITIES as readonly string[]).includes(value)
  );
}

function decodeCapabilities(value: unknown): readonly KernelCapability[] | undefined {
  const input = readDenseArray(value);
  if (input === undefined) {
    return undefined;
  }
  const capabilities: KernelCapability[] = [];
  const seen = new Set<KernelCapability>();
  for (const candidate of input) {
    if (!isKernelCapability(candidate) || seen.has(candidate)) {
      return undefined;
    }
    seen.add(candidate);
    capabilities.push(candidate);
  }
  return capabilities.sort();
}

function decodeRegistrationEntryIds(value: unknown): readonly string[] | undefined {
  const input = readDenseArray(value);
  if (input === undefined) {
    return undefined;
  }
  const registrationEntryIds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of input) {
    if (!isSafeRegistryId(candidate) || seen.has(candidate)) {
      return undefined;
    }
    seen.add(candidate);
    registrationEntryIds.push(candidate);
  }
  return registrationEntryIds.sort();
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
    !Number.isSafeInteger(record.apiVersion) ||
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
    for (const module of modules) {
      const decoded = decodeModule(module);
      if (decoded === undefined) {
        return invalidStartupInput();
      }
      decodedModules.push(decoded);
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
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
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
