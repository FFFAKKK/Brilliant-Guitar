import { KernelErrorBase } from "../errors/kernel-error-base";
import type { ScoreAddress, ScorePoint, ScoreRange } from "../domain/address";
import type { JsonObject, JsonValue } from "../domain/extensions";
import type {
  KernelIssueLocation,
  KernelSeverity,
} from "../reports/contracts";
import { isSafeRegistryId, readDenseArray, readExactDataRecord } from "../registry/strict-codec";
import type {
  ModuleIssueCode,
  ModuleKernelIssue,
} from "../registry/integrated-contracts";
import type {
  ModuleIssueCreationResultV1,
  ModuleIssueInputV1,
} from "./contracts";

const reflectApply = Reflect.apply;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const reflectGetPrototypeOf = Reflect.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const arrayConstructor = Array;
const arrayIsArray = arrayConstructor.isArray;
const numberConstructor = Number;
const numberIsFinite = numberConstructor.isFinite;
const numberIsSafeInteger = numberConstructor.isSafeInteger;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectPrototype = Object.prototype;
const stringEndsWith = String.prototype.endsWith;
const stringIncludes = String.prototype.includes;
const stringStartsWith = String.prototype.startsWith;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setDelete = setConstructor.prototype.delete;
const setHas = setConstructor.prototype.has;
const mapConstructor = Map;
const mapGet = mapConstructor.prototype.get;
const mapHas = mapConstructor.prototype.has;
const mapSet = mapConstructor.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetAdd = weakSetConstructor.prototype.add;
const weakSetHas = weakSetConstructor.prototype.has;

const INVALID_MODULE_ISSUE_RESULT: ModuleIssueCreationResultV1 = objectFreeze({
  status: "invalid",
});

function freezeModuleData<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  function freeze(current: unknown): void {
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) {
      return;
    }
    reflectApply(weakSetAdd, seen, [current]);
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) {
        continue;
      }
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        freeze(descriptor.value);
      }
    }
    reflectApply(objectFreeze, Object, [current]);
  }
  freeze(value);
  return value;
}

function cloneJsonValue(
  input: unknown,
  active: Set<object>,
  completed: Map<object, JsonValue>,
): JsonValue | undefined {
  if (input === null || typeof input === "boolean" || typeof input === "string") {
    return input;
  }
  if (typeof input === "number") {
    return reflectApply(numberIsFinite, numberConstructor, [input]) === true
      ? input
      : undefined;
  }
  if (typeof input !== "object") {
    return undefined;
  }
  if (reflectApply(setHas, active, [input]) === true) {
    return undefined;
  }
  if (reflectApply(mapHas, completed, [input]) === true) {
    return reflectApply(mapGet, completed, [input]) as JsonValue;
  }

  reflectApply(setAdd, active, [input]);
  try {
    if (reflectApply(arrayIsArray, arrayConstructor, [input]) === true) {
      const values = readDenseArray(input);
      if (values === undefined) {
        return undefined;
      }
      const output: JsonValue[] = [];
      for (let index = 0; index < values.length; index += 1) {
        const cloned = cloneJsonValue(values[index], active, completed);
        if (cloned === undefined) {
          return undefined;
        }
        output[output.length] = cloned;
      }
      reflectApply(mapSet, completed, [input, output]);
      return output;
    }

    const prototype = reflectGetPrototypeOf(input);
    if (prototype !== objectPrototype && prototype !== null) {
      return undefined;
    }
    const keys = reflectOwnKeys(input);
    const output: Record<string, JsonValue> = {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") {
        return undefined;
      }
      const descriptor = reflectGetOwnPropertyDescriptor(input, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return undefined;
      }
      const cloned = cloneJsonValue(descriptor.value, active, completed);
      if (cloned === undefined) {
        return undefined;
      }
      reflectApply(objectDefineProperty, Object, [
        output,
        key,
        {
          configurable: true,
          enumerable: true,
          value: cloned,
          writable: true,
        },
      ]);
    }
    reflectApply(mapSet, completed, [input, output]);
    return output;
  } finally {
    reflectApply(setDelete, active, [input]);
  }
}

function decodeJsonObject(input: unknown): JsonObject | undefined {
  if (
    typeof input !== "object" ||
    input === null ||
    reflectApply(arrayIsArray, arrayConstructor, [input]) === true
  ) {
    return undefined;
  }
  const decoded = cloneJsonValue(
    input,
    new setConstructor<object>(),
    new mapConstructor<object, JsonValue>(),
  );
  return typeof decoded === "object" &&
    decoded !== null &&
    reflectApply(arrayIsArray, arrayConstructor, [decoded]) !== true
    ? decoded as JsonObject
    : undefined;
}

function readModuleIssueRecord(input: unknown): Readonly<Record<string, unknown>> | undefined {
  return (
    readExactDataRecord(input, ["code", "source"]) ??
    readExactDataRecord(input, ["code", "source", "location"]) ??
    readExactDataRecord(input, ["code", "source", "details"]) ??
    readExactDataRecord(input, ["code", "source", "location", "details"])
  );
}

function decodeModuleSource(input: unknown): ModuleKernelIssue["source"] | undefined {
  const source = readExactDataRecord(input, [
    "kind",
    "moduleId",
    "contributionId",
  ]);
  return source?.kind === "module" &&
    isSafeRegistryId(source.moduleId) &&
    isSafeRegistryId(source.contributionId)
    ? {
        kind: "module",
        moduleId: source.moduleId,
        contributionId: source.contributionId,
      }
    : undefined;
}

function decodeDiagnosticPath(input: unknown): readonly (string | number)[] | undefined {
  const values = readDenseArray(input);
  if (values === undefined) {
    return undefined;
  }
  const path: (string | number)[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      typeof value !== "string" &&
      !(typeof value === "number" &&
        reflectApply(numberIsSafeInteger, numberConstructor, [value]) === true)
    ) {
      return undefined;
    }
    path[path.length] = value;
  }
  return path;
}

function decodeScoreAddress(input: unknown): ScoreAddress | undefined {
  const candidates = [
    ["document", "documentId"],
    ["measure", "measureId"],
    ["part", "partId"],
    ["staff", "staffId"],
    ["voice", "voiceId"],
    ["event", "eventId"],
    ["note", "noteId"],
  ] as const;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) {
      continue;
    }
    const [kind, idKey] = candidate;
    const record = readExactDataRecord(input, ["kind", idKey]);
    const id = record?.[idKey];
    if (record?.kind === kind && typeof id === "string" && id.length > 0) {
      return { kind, [idKey]: id } as ScoreAddress;
    }
  }
  return undefined;
}

function decodeScorePoint(input: unknown): ScorePoint | undefined {
  const measure = readExactDataRecord(input, ["kind", "measureId"]);
  if (
    measure?.kind === "measure" &&
    typeof measure.measureId === "string" &&
    measure.measureId.length > 0
  ) {
    return { kind: "measure", measureId: measure.measureId };
  }
  const partMeasure = readExactDataRecord(input, [
    "kind",
    "partId",
    "measureId",
  ]);
  if (
    partMeasure?.kind === "part-measure" &&
    typeof partMeasure.partId === "string" &&
    partMeasure.partId.length > 0 &&
    typeof partMeasure.measureId === "string" &&
    partMeasure.measureId.length > 0
  ) {
    return {
      kind: "part-measure",
      partId: partMeasure.partId,
      measureId: partMeasure.measureId,
    };
  }
  const voiceEvent = readExactDataRecord(input, [
    "kind",
    "voiceId",
    "eventId",
  ]);
  return voiceEvent?.kind === "voice-event" &&
    typeof voiceEvent.voiceId === "string" &&
    voiceEvent.voiceId.length > 0 &&
    typeof voiceEvent.eventId === "string" &&
    voiceEvent.eventId.length > 0
    ? {
        kind: "voice-event",
        voiceId: voiceEvent.voiceId,
        eventId: voiceEvent.eventId,
      }
    : undefined;
}

function decodeScoreRange(input: unknown): ScoreRange | undefined {
  const record = readExactDataRecord(input, ["kind", "start", "end"]);
  const start = decodeScorePoint(record?.start);
  const end = decodeScorePoint(record?.end);
  if (
    record?.kind === "measure-range" &&
    start?.kind === "measure" &&
    end?.kind === "measure"
  ) {
    return { kind: "measure-range", start, end };
  }
  if (
    record?.kind === "part-measure-range" &&
    start?.kind === "part-measure" &&
    end?.kind === "part-measure"
  ) {
    return { kind: "part-measure-range", start, end };
  }
  return record?.kind === "voice-event-range" &&
    start?.kind === "voice-event" &&
    end?.kind === "voice-event"
    ? { kind: "voice-event-range", start, end }
    : undefined;
}

function decodeModuleIssueLocation(input: unknown): KernelIssueLocation | undefined {
  const record = readExactDataRecord(input, ["kind", "path"]);
  if (record?.kind === "diagnostic-path") {
    const path = decodeDiagnosticPath(record.path);
    return path === undefined ? undefined : { kind: "diagnostic-path", path };
  }

  const addressRecord = readExactDataRecord(input, ["kind", "address"]);
  if (addressRecord?.kind === "score-address") {
    const address = decodeScoreAddress(addressRecord.address);
    return address === undefined
      ? undefined
      : { kind: "score-address", address };
  }

  const rangeRecord = readExactDataRecord(input, ["kind", "range"]);
  if (rangeRecord?.kind === "score-range") {
    const range = decodeScoreRange(rangeRecord.range);
    return range === undefined ? undefined : { kind: "score-range", range };
  }
  return undefined;
}

function severityForModuleIssueCode(code: string): KernelSeverity {
  if (
    reflectApply(stringIncludes, code, [".unsupported."]) === true ||
    reflectApply(stringEndsWith, code, [".unsupported"]) === true
  ) {
    return "warning";
  }
  if (
    reflectApply(stringEndsWith, code, [".internal-error"]) === true ||
    reflectApply(stringEndsWith, code, [".invariant-violation"]) === true
  ) {
    return "fatal";
  }
  return "error";
}

function normalizeModuleIssue(input: unknown): ModuleKernelIssue | undefined {
  try {
    const record = readModuleIssueRecord(input);
    const source = decodeModuleSource(record?.source);
    if (
      record === undefined ||
      source === undefined ||
      !isSafeRegistryId(record.code) ||
      reflectApply(stringStartsWith, record.code, [`${source.moduleId}.`]) !== true
    ) {
      return undefined;
    }

    const location = "location" in record
      ? decodeModuleIssueLocation(record.location)
      : undefined;
    if ("location" in record && location === undefined) {
      return undefined;
    }

    const details = "details" in record
      ? decodeJsonObject(record.details)
      : undefined;
    if ("details" in record && details === undefined) {
      return undefined;
    }

    const issue: ModuleKernelIssue = {
      issueVersion: 1,
      code: record.code as ModuleIssueCode,
      severity: severityForModuleIssueCode(record.code),
      messageKey: `module.${record.code}`,
      source,
      ...(location === undefined ? {} : { location }),
      ...(details === undefined ? {} : { details }),
    };
    return freezeModuleData(issue);
  } catch {
    return undefined;
  }
}

export function createModuleKernelIssueV1(
  input: unknown,
): ModuleIssueCreationResultV1 {
  const issue = normalizeModuleIssue(input);
  return issue === undefined
    ? INVALID_MODULE_ISSUE_RESULT
    : objectFreeze({ status: "created", issue });
}

export abstract class ModuleKernelErrorBase<
  ModuleId extends string,
  Code extends ModuleIssueCode & `${ModuleId}.${string}`,
> extends KernelErrorBase<Code> {
  readonly #issue: ModuleKernelIssue & {
    readonly code: Code;
    readonly source: {
      readonly kind: "module";
      readonly moduleId: ModuleId;
      readonly contributionId: string;
    };
  };

  protected constructor(input: ModuleIssueInputV1<ModuleId, Code>) {
    const normalized = normalizeModuleIssue(input);
    if (normalized === undefined) {
      throw new TypeError("Invalid module issue input");
    }
    const issue = normalized as ModuleKernelIssue & {
      readonly code: Code;
      readonly source: {
        readonly kind: "module";
        readonly moduleId: ModuleId;
        readonly contributionId: string;
      };
    };
    super(issue.code);
    this.#issue = issue;
  }

  override toIssue(): ModuleKernelIssue & {
    readonly code: Code;
    readonly source: {
      readonly kind: "module";
      readonly moduleId: ModuleId;
      readonly contributionId: string;
    };
  } {
    return this.#issue;
  }
}
