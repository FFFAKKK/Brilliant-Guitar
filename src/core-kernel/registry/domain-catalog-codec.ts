import type {
  CompiledDomainCommandContributionV1,
  DomainCommandDescriptorV1,
  ModuleEffectDescriptorV1,
} from "../module-sdk/contracts";
import type { ExtensionRuntimeRequirementV1 } from "./integrated-contracts";
import {
  isSafeRegistryId,
  readDenseArray,
  readExactDataRecord,
} from "./strict-codec";

const reflectApply = Reflect.apply;
const numberConstructor = Number;
const numberIsSafeInteger = numberConstructor.isSafeInteger;
const stringStartsWith = String.prototype.startsWith;

export interface CapturedDomainContributionV1 {
  readonly apiVersion: unknown;
  readonly moduleId: unknown;
  readonly contributionId: unknown;
  readonly extensionNamespaces: readonly unknown[];
  readonly extensionRequirements: readonly unknown[];
  readonly commands: readonly unknown[];
  readonly validate: unknown;
  readonly classify: unknown;
  readonly effects: readonly unknown[];
}

export interface CapturedDomainRegistrationEntryV1 {
  readonly registrationEntryId: unknown;
  readonly ownerModuleId: unknown;
  readonly kind: unknown;
  readonly contributions: readonly unknown[];
}

interface CapturedDomainSourceV1 {
  readonly moduleId: string;
  readonly contributionId: string;
}

export interface CapturedDomainCommandDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly commandId: string;
  readonly commandVersion: 1;
  readonly source: CapturedDomainSourceV1;
  readonly targetKind: unknown;
  readonly requiredCapabilities: readonly unknown[];
  readonly titleKey: string;
}

export interface CapturedModuleEffectDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly effectKind: string;
  readonly source: CapturedDomainSourceV1;
  readonly namespace: string;
  readonly ownerKinds: readonly unknown[];
  readonly supportedSchemaVersions: readonly unknown[];
}

export interface CapturedExtensionRuntimeRequirementV1 {
  readonly requirementVersion: 1;
  readonly namespace: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly supportedSchemaVersions: readonly unknown[];
  readonly requiredForWrite: unknown;
}

function captureSource(
  input: unknown,
): CapturedDomainSourceV1 | undefined {
  const source = readExactDataRecord(input, ["moduleId", "contributionId"]);
  return source !== undefined &&
    isSafeRegistryId(source.moduleId) &&
    isSafeRegistryId(source.contributionId)
    ? {
        moduleId: source.moduleId,
        contributionId: source.contributionId,
      }
    : undefined;
}

function isTargetKind(
  value: unknown,
): value is DomainCommandDescriptorV1["targetKind"] {
  return value === "document" ||
    value === "measure" ||
    value === "part" ||
    value === "staff" ||
    value === "voice" ||
    value === "event" ||
    value === "note";
}

export function captureDomainCommandDescriptorV1(
  input: unknown,
): CapturedDomainCommandDescriptorV1 | undefined {
  try {
    const record = readExactDataRecord(input, [
      "descriptorVersion",
      "commandId",
      "commandVersion",
      "source",
      "targetKind",
      "requiredCapabilities",
      "titleKey",
    ]);
    const source = captureSource(record?.source);
    const capabilities = readDenseArray(record?.requiredCapabilities);
    if (
      record?.descriptorVersion !== 1 ||
      !isSafeRegistryId(record.commandId) ||
      record.commandVersion !== 1 ||
      source === undefined ||
      capabilities === undefined ||
      !isSafeRegistryId(record.titleKey)
    ) {
      return undefined;
    }
    return {
      descriptorVersion: 1,
      commandId: record.commandId,
      commandVersion: 1,
      source,
      targetKind: record.targetKind,
      requiredCapabilities: capabilities,
      titleKey: record.titleKey,
    };
  } catch {
    return undefined;
  }
}

export function normalizeCapturedDomainCommandDescriptorV1(
  captured: CapturedDomainCommandDescriptorV1,
): DomainCommandDescriptorV1 | undefined {
  return isTargetKind(captured.targetKind) &&
    captured.requiredCapabilities.length === 2 &&
    captured.requiredCapabilities[0] === "command:execute" &&
    captured.requiredCapabilities[1] === "score:read"
    ? {
        descriptorVersion: 1,
        commandId: captured.commandId,
        commandVersion: 1,
        source: captured.source,
        targetKind: captured.targetKind,
        requiredCapabilities: ["command:execute", "score:read"],
        titleKey: captured.titleKey,
      }
    : undefined;
}

export function decodeDomainCommandDescriptorV1(
  input: unknown,
): DomainCommandDescriptorV1 | undefined {
  const captured = captureDomainCommandDescriptorV1(input);
  return captured === undefined
    ? undefined
    : normalizeCapturedDomainCommandDescriptorV1(captured);
}

function decodeOwnerKinds(
  input: unknown,
): ModuleEffectDescriptorV1["ownerKinds"] | undefined {
  const values = readDenseArray(input);
  if (values?.length === 1 && values[0] === "score") {
    return ["score"];
  }
  if (values?.length === 1 && values[0] === "part") {
    return ["part"];
  }
  if (
    values?.length === 2 &&
    values[0] === "score" &&
    values[1] === "part"
  ) {
    return ["score", "part"];
  }
  return undefined;
}

export function decodeSupportedSchemaVersions(
  input: unknown,
): readonly number[] | undefined {
  const values = readDenseArray(input);
  if (values === undefined || values.length === 0 || values.length > 256) {
    return undefined;
  }
  const versions: number[] = [];
  let previous = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      typeof value !== "number" ||
      reflectApply(numberIsSafeInteger, numberConstructor, [value]) !== true ||
      value <= previous
    ) {
      return undefined;
    }
    versions[versions.length] = value;
    previous = value;
  }
  return versions;
}

export function captureModuleEffectDescriptorV1(
  input: unknown,
): CapturedModuleEffectDescriptorV1 | undefined {
  try {
    const record = readExactDataRecord(input, [
      "descriptorVersion",
      "effectKind",
      "source",
      "namespace",
      "ownerKinds",
      "supportedSchemaVersions",
    ]);
    const source = captureSource(record?.source);
    const ownerKinds = readDenseArray(record?.ownerKinds);
    const supportedSchemaVersions = readDenseArray(
      record?.supportedSchemaVersions,
    );
    if (
      record?.descriptorVersion !== 1 ||
      !isSafeRegistryId(record.effectKind) ||
      source === undefined ||
      !isSafeRegistryId(record.namespace) ||
      ownerKinds === undefined ||
      supportedSchemaVersions === undefined
    ) {
      return undefined;
    }
    return {
      descriptorVersion: 1,
      effectKind: record.effectKind,
      source,
      namespace: record.namespace,
      ownerKinds,
      supportedSchemaVersions,
    };
  } catch {
    return undefined;
  }
}

export function normalizeCapturedModuleEffectDescriptorV1(
  captured: CapturedModuleEffectDescriptorV1,
): ModuleEffectDescriptorV1 | undefined {
  const ownerKinds = decodeOwnerKinds(captured.ownerKinds);
  const supportedSchemaVersions = decodeSupportedSchemaVersions(
    captured.supportedSchemaVersions,
  );
  return reflectApply(stringStartsWith, captured.effectKind, [
    `${captured.namespace}.`,
  ]) === true &&
    ownerKinds !== undefined &&
    supportedSchemaVersions !== undefined
    ? {
        descriptorVersion: 1,
        effectKind: captured.effectKind,
        source: captured.source,
        namespace: captured.namespace,
        ownerKinds,
        supportedSchemaVersions,
      }
    : undefined;
}

export function decodeModuleEffectDescriptorV1(
  input: unknown,
): ModuleEffectDescriptorV1 | undefined {
  const captured = captureModuleEffectDescriptorV1(input);
  return captured === undefined
    ? undefined
    : normalizeCapturedModuleEffectDescriptorV1(captured);
}

export function captureExtensionRuntimeRequirementV1(
  input: unknown,
): CapturedExtensionRuntimeRequirementV1 | undefined {
  try {
    const record = readExactDataRecord(input, [
      "requirementVersion",
      "namespace",
      "moduleId",
      "contributionId",
      "supportedSchemaVersions",
      "requiredForWrite",
    ]);
    const supportedSchemaVersions = readDenseArray(
      record?.supportedSchemaVersions,
    );
    return record?.requirementVersion === 1 &&
      isSafeRegistryId(record.namespace) &&
      isSafeRegistryId(record.moduleId) &&
      isSafeRegistryId(record.contributionId) &&
      supportedSchemaVersions !== undefined
      ? {
          requirementVersion: 1,
          namespace: record.namespace,
          moduleId: record.moduleId,
          contributionId: record.contributionId,
          supportedSchemaVersions,
          requiredForWrite: record.requiredForWrite,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeCapturedExtensionRuntimeRequirementV1(
  captured: CapturedExtensionRuntimeRequirementV1,
): ExtensionRuntimeRequirementV1 | undefined {
  const supportedSchemaVersions = decodeSupportedSchemaVersions(
    captured.supportedSchemaVersions,
  );
  return supportedSchemaVersions !== undefined &&
    captured.requiredForWrite === true
    ? {
        requirementVersion: 1,
        namespace: captured.namespace,
        moduleId: captured.moduleId,
        contributionId: captured.contributionId,
        supportedSchemaVersions,
        requiredForWrite: true,
      }
    : undefined;
}

export function decodeExtensionRuntimeRequirementV1(
  input: unknown,
): ExtensionRuntimeRequirementV1 | undefined {
  const captured = captureExtensionRuntimeRequirementV1(input);
  return captured === undefined
    ? undefined
    : normalizeCapturedExtensionRuntimeRequirementV1(captured);
}

export function captureDomainContributionV1(
  input: unknown,
): CapturedDomainContributionV1 | undefined {
  try {
    const record = readExactDataRecord(input, [
      "apiVersion",
      "moduleId",
      "contributionId",
      "extensionNamespaces",
      "extensionRequirements",
      "commands",
      "validate",
      "classify",
      "effects",
    ]);
    const extensionNamespaces = readDenseArray(record?.extensionNamespaces);
    const extensionRequirements = readDenseArray(
      record?.extensionRequirements,
    );
    const commands = readDenseArray(record?.commands);
    const effects = readDenseArray(record?.effects);
    return record === undefined ||
      extensionNamespaces === undefined ||
      extensionRequirements === undefined ||
      commands === undefined ||
      effects === undefined
      ? undefined
      : {
          apiVersion: record.apiVersion,
          moduleId: record.moduleId,
          contributionId: record.contributionId,
          extensionNamespaces,
          extensionRequirements,
          commands,
          validate: record.validate,
          classify: record.classify,
          effects,
        };
  } catch {
    return undefined;
  }
}

export function captureDomainRegistrationEntryV1(
  input: unknown,
): CapturedDomainRegistrationEntryV1 | undefined {
  try {
    const record = readExactDataRecord(input, [
      "registrationEntryId",
      "ownerModuleId",
      "kind",
      "contributions",
    ]);
    const contributions = readDenseArray(record?.contributions);
    return record === undefined || contributions === undefined
      ? undefined
      : {
          registrationEntryId: record.registrationEntryId,
          ownerModuleId: record.ownerModuleId,
          kind: record.kind,
          contributions,
        };
  } catch {
    return undefined;
  }
}

export function hasSameNumberValues(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export type DomainContributionShapeV1 = CompiledDomainCommandContributionV1;
