import {
  captureDomainContributionV1,
  captureDomainRegistrationEntryV1,
  decodeDomainCommandDescriptorV1,
  decodeExtensionRuntimeRequirementV1,
  decodeModuleEffectDescriptorV1,
  hasSameNumberValues,
} from "../registry/domain-catalog-codec";
import { isSafeRegistryId, readExactDataRecord } from "../registry/strict-codec";
import {
  compiledDomainCommandDefinitionBrand,
  compiledModuleEffectDefinitionBrand,
  type CompiledDomainCommandContributionV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledDomainCommandRegistrationEntryV1,
  type CompiledModuleEffectDefinitionV1,
  type DomainCommandDecoderV1,
  type DomainCommandDefinitionInputV1,
  type DomainCommandPreparerV1,
  type DomainSemanticValidatorV1,
  type DomainSupportClassifierV1,
  type ModuleEffectDefinitionInputV1,
  type ModuleEffectPayloadDecoderV1,
  type ModuleEffectTransformerV1,
  type OfficialModuleDefinitionResultV1,
} from "./contracts";

export interface DomainCommandDefinitionBindingV1 {
  readonly decode: DomainCommandDecoderV1<unknown>;
  readonly prepare: DomainCommandPreparerV1<unknown>;
}

export interface ModuleEffectDefinitionBindingV1 {
  readonly decode: ModuleEffectPayloadDecoderV1<unknown>;
  readonly transform: ModuleEffectTransformerV1<unknown>;
}

const reflectApply = Reflect.apply;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const functionToString = Function.prototype.toString;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const arraySlice = Array.prototype.slice;
const arraySort = Array.prototype.sort;
const stringIncludes = String.prototype.includes;
const stringStartsWith = String.prototype.startsWith;
const stringTrimStart = String.prototype.trimStart;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setHas = setConstructor.prototype.has;
const mapConstructor = Map;
const mapGet = mapConstructor.prototype.get;
const mapHas = mapConstructor.prototype.has;
const mapSet = mapConstructor.prototype.set;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetAdd = weakSetConstructor.prototype.add;
const weakSetHas = weakSetConstructor.prototype.has;

const commandBindings = new WeakMap<
  CompiledDomainCommandDefinitionV1,
  DomainCommandDefinitionBindingV1
>();
const effectBindings = new WeakMap<
  CompiledModuleEffectDefinitionV1,
  ModuleEffectDefinitionBindingV1
>();

const INVALID_DEFINITION_RESULT = objectFreeze({
  status: "invalid",
}) as OfficialModuleDefinitionResultV1<never>;

function invalidDefinition<T>(): OfficialModuleDefinitionResultV1<T> {
  return INVALID_DEFINITION_RESULT;
}

function defined<T>(value: T): OfficialModuleDefinitionResultV1<T> {
  return objectFreeze({ status: "defined", value });
}

function freezeSdkData<T>(value: T): T {
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

function textStartsWith(value: string, prefix: string): boolean {
  return reflectApply(stringStartsWith, value, [prefix]) === true;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasOwnedPrefix(
  namespaces: readonly string[],
  identifier: string,
): boolean {
  for (let index = 0; index < namespaces.length; index += 1) {
    const namespace = namespaces[index];
    if (
      namespace !== undefined &&
      textStartsWith(identifier, `${namespace}.`)
    ) {
      return true;
    }
  }
  return false;
}

function setContains<T>(values: Set<T>, value: T): boolean {
  return reflectApply(setHas, values, [value]) === true;
}

function addSetValue<T>(values: Set<T>, value: T): void {
  reflectApply(setAdd, values, [value]);
}

function mapContains<Key, Value>(values: Map<Key, Value>, key: Key): boolean {
  return reflectApply(mapHas, values, [key]) === true;
}

function readMapValue<Key, Value>(
  values: Map<Key, Value>,
  key: Key,
): Value | undefined {
  return reflectApply(mapGet, values, [key]) as Value | undefined;
}

function writeMapValue<Key, Value>(
  values: Map<Key, Value>,
  key: Key,
  value: Value,
): void {
  reflectApply(mapSet, values, [key, value]);
}

export function isPermittedOfficialModuleCallback(
  value: unknown,
): value is (...arguments_: readonly unknown[]) => unknown {
  if (typeof value !== "function") {
    return false;
  }
  try {
    const source = reflectApply(functionToString, value, []) as string;
    const trimmed = reflectApply(stringTrimStart, source, []) as string;
    return !textStartsWith(trimmed, "class ") &&
      !textStartsWith(trimmed, "async ") &&
      !textStartsWith(trimmed, "function*") &&
      !textStartsWith(trimmed, "function *") &&
      !textStartsWith(trimmed, "*") &&
      reflectApply(stringIncludes, source, ["[native code]"]) !== true &&
      (textStartsWith(trimmed, "function") ||
        reflectApply(stringIncludes, source, ["=>"]) === true);
  } catch {
    return false;
  }
}

function freezeCommandHandle(
  descriptor: CompiledDomainCommandDefinitionV1["descriptor"],
): CompiledDomainCommandDefinitionV1 {
  const handle = { descriptor } as CompiledDomainCommandDefinitionV1;
  reflectApply(objectDefineProperty, Object, [
    handle,
    compiledDomainCommandDefinitionBrand,
    {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    },
  ]);
  return reflectApply(objectFreeze, Object, [handle]) as CompiledDomainCommandDefinitionV1;
}

function freezeEffectHandle(
  descriptor: CompiledModuleEffectDefinitionV1["descriptor"],
): CompiledModuleEffectDefinitionV1 {
  const handle = { descriptor } as CompiledModuleEffectDefinitionV1;
  reflectApply(objectDefineProperty, Object, [
    handle,
    compiledModuleEffectDefinitionBrand,
    {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    },
  ]);
  return reflectApply(objectFreeze, Object, [handle]) as CompiledModuleEffectDefinitionV1;
}

export function getDomainCommandDefinitionBinding(
  value: unknown,
): DomainCommandDefinitionBindingV1 | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  try {
    return reflectApply(weakMapGet, commandBindings, [value]) as
      | DomainCommandDefinitionBindingV1
      | undefined;
  } catch {
    return undefined;
  }
}

export function getModuleEffectDefinitionBinding(
  value: unknown,
): ModuleEffectDefinitionBindingV1 | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  try {
    return reflectApply(weakMapGet, effectBindings, [value]) as
      | ModuleEffectDefinitionBindingV1
      | undefined;
  } catch {
    return undefined;
  }
}

export function defineDomainCommandV1<Command>(
  input: DomainCommandDefinitionInputV1<Command>,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandDefinitionV1>;
export function defineDomainCommandV1(
  input: unknown,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandDefinitionV1> {
  try {
    const record = readExactDataRecord(input, ["descriptor", "decode", "prepare"]);
    const descriptor = decodeDomainCommandDescriptorV1(record?.descriptor);
    if (
      descriptor === undefined ||
      !isPermittedOfficialModuleCallback(record?.decode) ||
      !isPermittedOfficialModuleCallback(record?.prepare)
    ) {
      return invalidDefinition();
    }
    const frozenDescriptor = freezeSdkData(descriptor);
    const handle = freezeCommandHandle(frozenDescriptor);
    const binding: DomainCommandDefinitionBindingV1 = objectFreeze({
      decode: record.decode as DomainCommandDecoderV1<unknown>,
      prepare: record.prepare as DomainCommandPreparerV1<unknown>,
    });
    reflectApply(weakMapSet, commandBindings, [handle, binding]);
    return defined(handle);
  } catch {
    return invalidDefinition();
  }
}

export function defineModuleEffectV1<Payload>(
  input: ModuleEffectDefinitionInputV1<Payload>,
): OfficialModuleDefinitionResultV1<CompiledModuleEffectDefinitionV1>;
export function defineModuleEffectV1(
  input: unknown,
): OfficialModuleDefinitionResultV1<CompiledModuleEffectDefinitionV1> {
  try {
    const record = readExactDataRecord(input, ["descriptor", "decode", "transform"]);
    const descriptor = decodeModuleEffectDescriptorV1(record?.descriptor);
    if (
      descriptor === undefined ||
      !isPermittedOfficialModuleCallback(record?.decode) ||
      !isPermittedOfficialModuleCallback(record?.transform)
    ) {
      return invalidDefinition();
    }
    const frozenDescriptor = freezeSdkData(descriptor);
    const handle = freezeEffectHandle(frozenDescriptor);
    const binding: ModuleEffectDefinitionBindingV1 = objectFreeze({
      decode: record.decode as ModuleEffectPayloadDecoderV1<unknown>,
      transform: record.transform as ModuleEffectTransformerV1<unknown>,
    });
    reflectApply(weakMapSet, effectBindings, [handle, binding]);
    return defined(handle);
  } catch {
    return invalidDefinition();
  }
}

function sortedCopy<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): readonly T[] {
  const copy = reflectApply(arraySlice, values, []) as T[];
  reflectApply(arraySort, copy, [compare]);
  return copy;
}

function normalizeContribution(
  input: unknown,
): CompiledDomainCommandContributionV1 | undefined {
  const captured = captureDomainContributionV1(input);
  if (
    captured?.apiVersion !== 1 ||
    !isSafeRegistryId(captured.moduleId) ||
    !isSafeRegistryId(captured.contributionId) ||
    !isPermittedOfficialModuleCallback(captured.validate) ||
    !isPermittedOfficialModuleCallback(captured.classify) ||
    captured.extensionNamespaces.length === 0
  ) {
    return undefined;
  }

  const namespaceSet = new setConstructor<string>();
  const namespaces: string[] = [];
  for (let index = 0; index < captured.extensionNamespaces.length; index += 1) {
    const namespace = captured.extensionNamespaces[index];
    if (!isSafeRegistryId(namespace) || setContains(namespaceSet, namespace)) {
      return undefined;
    }
    addSetValue(namespaceSet, namespace);
    namespaces[namespaces.length] = namespace;
  }
  const sortedNamespaces = sortedCopy(namespaces, compareText);

  const requirementByNamespace = new mapConstructor<string, ReturnType<typeof decodeExtensionRuntimeRequirementV1>>();
  const requirements: NonNullable<ReturnType<typeof decodeExtensionRuntimeRequirementV1>>[] = [];
  for (let index = 0; index < captured.extensionRequirements.length; index += 1) {
    const value = captured.extensionRequirements[index];
    const requirement = decodeExtensionRuntimeRequirementV1(value);
    if (
      requirement === undefined ||
      requirement.moduleId !== captured.moduleId ||
      requirement.contributionId !== captured.contributionId ||
      !setContains(namespaceSet, requirement.namespace) ||
      mapContains(requirementByNamespace, requirement.namespace)
    ) {
      return undefined;
    }
    writeMapValue(requirementByNamespace, requirement.namespace, requirement);
    requirements[requirements.length] = freezeSdkData(requirement);
  }
  if (requirements.length !== sortedNamespaces.length) {
    return undefined;
  }
  const sortedRequirements = sortedCopy(requirements, (left, right) =>
    compareText(left.namespace, right.namespace));

  const commandIds = new setConstructor<string>();
  const commands: CompiledDomainCommandDefinitionV1[] = [];
  for (let index = 0; index < captured.commands.length; index += 1) {
    const value = captured.commands[index];
    const binding = getDomainCommandDefinitionBinding(value);
    if (binding === undefined) {
      return undefined;
    }
    const command = value as CompiledDomainCommandDefinitionV1;
    const descriptor = command.descriptor;
    if (
      descriptor.source.moduleId !== captured.moduleId ||
      descriptor.source.contributionId !== captured.contributionId ||
      !hasOwnedPrefix(sortedNamespaces, descriptor.commandId) ||
      setContains(commandIds, descriptor.commandId)
    ) {
      return undefined;
    }
    addSetValue(commandIds, descriptor.commandId);
    commands[commands.length] = command;
  }
  const sortedCommands = sortedCopy(commands, (left, right) =>
    compareText(left.descriptor.commandId, right.descriptor.commandId));

  const effectKinds = new setConstructor<string>();
  const effects: CompiledModuleEffectDefinitionV1[] = [];
  for (let index = 0; index < captured.effects.length; index += 1) {
    const value = captured.effects[index];
    const binding = getModuleEffectDefinitionBinding(value);
    if (binding === undefined) {
      return undefined;
    }
    const effect = value as CompiledModuleEffectDefinitionV1;
    const descriptor = effect.descriptor;
    const requirement = readMapValue(requirementByNamespace, descriptor.namespace);
    if (
      descriptor.source.moduleId !== captured.moduleId ||
      descriptor.source.contributionId !== captured.contributionId ||
      requirement === undefined ||
      !hasSameNumberValues(
        descriptor.supportedSchemaVersions,
        requirement.supportedSchemaVersions,
      ) ||
      setContains(effectKinds, descriptor.effectKind)
    ) {
      return undefined;
    }
    addSetValue(effectKinds, descriptor.effectKind);
    effects[effects.length] = effect;
  }
  const sortedEffects = sortedCopy(effects, (left, right) =>
    compareText(left.descriptor.effectKind, right.descriptor.effectKind));

  return freezeSdkData({
    apiVersion: 1,
    moduleId: captured.moduleId,
    contributionId: captured.contributionId,
    extensionNamespaces: sortedNamespaces,
    extensionRequirements: sortedRequirements,
    commands: sortedCommands,
    validate: captured.validate as DomainSemanticValidatorV1,
    classify: captured.classify as DomainSupportClassifierV1,
    effects: sortedEffects,
  });
}

export function defineDomainCommandContributionV1(
  input: CompiledDomainCommandContributionV1,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandContributionV1>;
export function defineDomainCommandContributionV1(
  input: unknown,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandContributionV1> {
  try {
    const contribution = normalizeContribution(input);
    return contribution === undefined
      ? invalidDefinition()
      : defined(contribution);
  } catch {
    return invalidDefinition();
  }
}

export function defineDomainCommandRegistrationEntryV1(
  input: CompiledDomainCommandRegistrationEntryV1,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandRegistrationEntryV1>;
export function defineDomainCommandRegistrationEntryV1(
  input: unknown,
): OfficialModuleDefinitionResultV1<CompiledDomainCommandRegistrationEntryV1> {
  try {
    const captured = captureDomainRegistrationEntryV1(input);
    if (
      captured?.registrationEntryId !== "kernel.domain-commands.v1" ||
      !isSafeRegistryId(captured.ownerModuleId) ||
      captured.kind !== "domain-command"
    ) {
      return invalidDefinition();
    }
    const contributionIds = new setConstructor<string>();
    const contributions: CompiledDomainCommandContributionV1[] = [];
    for (let index = 0; index < captured.contributions.length; index += 1) {
      const inputContribution = captured.contributions[index];
      const contribution = normalizeContribution(inputContribution);
      if (
        contribution === undefined ||
        contribution.moduleId !== captured.ownerModuleId ||
        setContains(contributionIds, contribution.contributionId)
      ) {
        return invalidDefinition();
      }
      addSetValue(contributionIds, contribution.contributionId);
      contributions[contributions.length] = contribution;
    }
    const sortedContributions = sortedCopy(contributions, (left, right) =>
      compareText(left.contributionId, right.contributionId));
    return defined(freezeSdkData({
      registrationEntryId: "kernel.domain-commands.v1",
      ownerModuleId: captured.ownerModuleId,
      kind: "domain-command",
      contributions: sortedContributions,
    }));
  } catch {
    return invalidDefinition();
  }
}
