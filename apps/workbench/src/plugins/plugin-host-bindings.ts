import type { PluginSessionPlanV1 } from "./plugin-platform.ts";
import { PluginHostServiceRegistry } from "./plugin-security.ts";
import type { PluginHostServiceGrantV1, PluginHostServiceId } from "./plugin-security.ts";

const pluginIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const pluginVersionPattern = /^\d+\.\d+\.\d+$/;
const bindingKeyPattern = /^[a-z][A-Za-z0-9]*$/;
const forbiddenBindingKeys = new Set([
  "bindingVersion",
  "bridge",
  "client",
  "getService",
  "kernel",
  "plugin",
  "resolveService",
  "serviceLocator",
  "services",
  "tauri",
  "workbenchClient",
]);

export interface PluginHostBindingSlotV1<Key extends string = string> {
  readonly key: Key;
  readonly hostService: PluginHostServiceId;
  readonly methods: readonly string[];
  readonly nullable?: boolean;
}

export interface PluginHostBindingsContractV1<
  PluginId extends string = string,
  Slots extends readonly PluginHostBindingSlotV1[] = readonly PluginHostBindingSlotV1[],
> {
  readonly contractVersion: 1;
  readonly pluginId: PluginId;
  readonly pluginVersion: string;
  readonly slots: Slots;
}

type BindingKey<Contract extends PluginHostBindingsContractV1> = Contract["slots"][number]["key"];

export type PluginHostBindingValues<Contract extends PluginHostBindingsContractV1> = Readonly<{
  [Key in BindingKey<Contract>]: unknown;
}>;

export type ResolvedPluginHostBindingsV1<
  Contract extends PluginHostBindingsContractV1,
  Values extends PluginHostBindingValues<Contract>,
> = Readonly<{
  readonly bindingVersion: 1;
  readonly plugin: Readonly<{
    readonly id: Contract["pluginId"];
    readonly version: string;
  }>;
}> & Readonly<Values>;

export function definePluginHostBindingsContract<
  const PluginId extends string,
  const Slots extends readonly PluginHostBindingSlotV1[],
>(input: {
  readonly pluginId: PluginId;
  readonly pluginVersion: string;
  readonly slots: Slots;
}): PluginHostBindingsContractV1<PluginId, Slots> {
  if (!pluginIdPattern.test(input.pluginId) || !pluginVersionPattern.test(input.pluginVersion)) {
    throw new Error("Invalid plugin host bindings identity");
  }
  const keys = input.slots.map((slot) => slot.key);
  if (keys.some((key) => !bindingKeyPattern.test(key) || forbiddenBindingKeys.has(key))
    || new Set(keys).size !== keys.length) {
    throw new Error(`Invalid plugin host binding keys: ${input.pluginId}`);
  }
  new PluginHostServiceRegistry(input.slots.map((slot) => slot.hostService));
  for (const slot of input.slots) {
    if (slot.methods.length === 0
      || slot.methods.some((method) => !bindingKeyPattern.test(method))
      || new Set(slot.methods).size !== slot.methods.length) {
      throw new Error(`Invalid plugin host binding methods: ${input.pluginId}.${slot.key}`);
    }
  }
  return Object.freeze({
    contractVersion: 1 as const,
    pluginId: input.pluginId,
    pluginVersion: input.pluginVersion,
    slots: Object.freeze(input.slots.map((slot) => Object.freeze({
      ...slot,
      methods: Object.freeze([...slot.methods]),
    }))) as unknown as Slots,
  });
}

function assertFrozenGrant(grant: PluginHostServiceGrantV1): void {
  if (!Object.isFrozen(grant) || !Object.isFrozen(grant.hostServices)) {
    throw new Error(`Plugin host service grant is not frozen: ${grant.pluginId}`);
  }
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function publicMethods(value: object): readonly string[] {
  const methods = new Set<string>();
  let current: object | null = value;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && "value" in descriptor && typeof descriptor.value === "function") methods.add(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return Object.freeze([...methods].sort());
}

function assertScopedBindingValue(
  pluginId: string,
  slot: PluginHostBindingSlotV1,
  value: unknown,
): void {
  if (value === null) {
    if (slot.nullable === true) return;
    throw new Error(`Plugin host binding cannot be null: ${pluginId}.${slot.key}`);
  }
  if ((typeof value !== "object" && typeof value !== "function") || value === undefined) {
    throw new Error(`Plugin host binding must be a typed port object: ${pluginId}.${slot.key}`);
  }
  const actualMethods = publicMethods(value);
  const expectedMethods = [...slot.methods].sort();
  if (!sameOrderedValues(actualMethods, expectedMethods)) {
    throw new Error(`Plugin host binding exposes methods outside its typed port: ${pluginId}.${slot.key}`);
  }
}

/**
 * Trusted-shell resolver for one frozen process session. It only accepts an
 * explicit binding contract and returns a concrete object; it never exposes a
 * service lookup API to plugin code.
 */
export class TrustedPluginHostBindingsResolver {
  readonly #grants: ReadonlyMap<string, PluginHostServiceGrantV1>;

  constructor(plan: PluginSessionPlanV1) {
    if (!Object.isFrozen(plan) || !Object.isFrozen(plan.pluginIds) || !Object.isFrozen(plan.hostServiceGrants)) {
      throw new Error("Plugin session plan must be frozen before resolving host bindings");
    }
    const activePluginIds = new Set(plan.pluginIds);
    const grants = new Map<string, PluginHostServiceGrantV1>();
    for (const grant of plan.hostServiceGrants) {
      assertFrozenGrant(grant);
      if (!activePluginIds.has(grant.pluginId) || grants.has(grant.pluginId)) {
        throw new Error(`Invalid plugin host service grant directory: ${grant.pluginId}`);
      }
      grants.set(grant.pluginId, grant);
    }
    this.#grants = grants;
  }

  resolve<
    const Contract extends PluginHostBindingsContractV1,
    const Values extends PluginHostBindingValues<Contract>,
  >(
    contract: Contract,
    values: Values,
  ): ResolvedPluginHostBindingsV1<Contract, Values> {
    const grant = this.#grants.get(contract.pluginId);
    if (!grant) throw new Error(`Plugin is not active in the frozen session: ${contract.pluginId}`);
    if (grant.pluginVersion !== contract.pluginVersion) {
      throw new Error(`Plugin host binding version does not match the frozen grant: ${contract.pluginId}`);
    }
    const requiredServices = contract.slots.map((slot) => slot.hostService);
    if (!sameOrderedValues(grant.hostServices, requiredServices)) {
      throw new Error(`Plugin host binding services do not match the frozen grant: ${contract.pluginId}`);
    }

    const expectedKeys = contract.slots.map((slot) => slot.key);
    const actualKeys = Object.keys(values);
    if (Object.getOwnPropertySymbols(values).length > 0 || !sameOrderedValues(actualKeys.sort(), [...expectedKeys].sort())) {
      throw new Error(`Plugin host binding values do not match the contract: ${contract.pluginId}`);
    }

    const bindingValues = values as Readonly<Record<string, unknown>>;
    const resolved: Record<string, unknown> = {
      bindingVersion: 1,
      plugin: Object.freeze({ id: grant.pluginId, version: grant.pluginVersion }),
    };
    for (const slot of contract.slots) {
      const value = bindingValues[slot.key];
      assertScopedBindingValue(contract.pluginId, slot, value);
      resolved[slot.key] = value;
    }
    return Object.freeze(resolved) as ResolvedPluginHostBindingsV1<Contract, Values>;
  }
}
