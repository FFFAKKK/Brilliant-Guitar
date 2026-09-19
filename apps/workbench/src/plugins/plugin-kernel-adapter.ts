import {
  capturePluginKernelAssemblyPlanV1,
  isPluginKernelModuleManifestV1,
} from "./plugin-package-contract.ts";
import type {
  PluginKernelAssemblyEntryV1,
  PluginKernelAssemblyPlanV1,
  PluginKernelModuleRuntime,
  PluginTier,
} from "./plugin-package-contract.ts";

export interface TrustedPluginKernelModuleBindingV1<Implementation = unknown> {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly tier: PluginTier;
  readonly moduleId: string;
  readonly apiVersion: 1;
  readonly runtime: PluginKernelModuleRuntime;
  readonly activation: "session-fixed";
  readonly implementation: Implementation;
}

export interface BoundPluginKernelModuleV1<Implementation = unknown> extends PluginKernelAssemblyEntryV1 {
  readonly implementation: Implementation;
}

export interface TrustedPluginKernelAssemblyV1<Implementation = unknown> {
  readonly bindingVersion: 1;
  readonly plan: PluginKernelAssemblyPlanV1;
  readonly modules: readonly BoundPluginKernelModuleV1<Implementation>[];
}

export type TrustedPluginKernelBindingFailureCode =
  | "kernel-binding.invalid-plan"
  | "kernel-binding.invalid-roster"
  | "kernel-binding.invalid-binding"
  | "kernel-binding.duplicate-binding"
  | "kernel-binding.unexpected-binding"
  | "kernel-binding.identity-mismatch"
  | "kernel-binding.missing-binding";

export interface TrustedPluginKernelBindingFailure {
  readonly code: TrustedPluginKernelBindingFailureCode;
  readonly moduleId?: string;
  readonly bindingIndex?: number;
}

export type TrustedPluginKernelBindingResultV1<Implementation = unknown> =
  | { readonly ok: true; readonly assembly: TrustedPluginKernelAssemblyV1<Implementation> }
  | { readonly ok: false; readonly failure: TrustedPluginKernelBindingFailure };

const bindingKeys = Object.freeze([
  "pluginId", "pluginVersion", "tier", "moduleId", "apiVersion", "runtime", "activation", "implementation",
]);
const dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const semanticVersion = /^\d+\.\d+\.\d+$/;

function failure(code: TrustedPluginKernelBindingFailureCode,
  detail: Readonly<{ moduleId?: string; bindingIndex?: number }> = {}): TrustedPluginKernelBindingResultV1<never> {
  return Object.freeze({ ok: false, failure: Object.freeze({ code, ...detail }) });
}

function exactBindingRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== bindingKeys.length
      || ownKeys.some((key) => typeof key !== "string" || !bindingKeys.includes(key))) return null;
    const record: Record<string, unknown> = {};
    for (const key of bindingKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function captureBinding<Implementation>(value: unknown): TrustedPluginKernelModuleBindingV1<Implementation> | null {
  const binding = exactBindingRecord(value);
  if (binding === null || typeof binding.pluginId !== "string" || !dottedId.test(binding.pluginId)
    || typeof binding.pluginVersion !== "string" || !semanticVersion.test(binding.pluginVersion)
    || (binding.tier !== "system" && binding.tier !== "product" && binding.tier !== "third-party")
    || typeof binding.moduleId !== "string"
    || (binding.runtime !== "internal-module" && binding.runtime !== "wasm")
    || !isPluginKernelModuleManifestV1({
      moduleId: binding.moduleId,
      apiVersion: binding.apiVersion,
      runtime: binding.runtime,
      activation: binding.activation,
    }) || ((typeof binding.implementation !== "object" || binding.implementation === null)
      && typeof binding.implementation !== "function")) return null;
  return {
    pluginId: binding.pluginId,
    pluginVersion: binding.pluginVersion,
    tier: binding.tier,
    moduleId: binding.moduleId,
    apiVersion: 1,
    runtime: binding.runtime,
    activation: "session-fixed",
    implementation: binding.implementation as Implementation,
  };
}

function sameIdentity(plan: PluginKernelAssemblyEntryV1, binding: TrustedPluginKernelModuleBindingV1): boolean {
  return plan.pluginId === binding.pluginId
    && plan.pluginVersion === binding.pluginVersion
    && plan.tier === binding.tier
    && plan.moduleId === binding.moduleId
    && plan.apiVersion === binding.apiVersion
    && plan.runtime === binding.runtime
    && plan.activation === binding.activation;
}

/**
 * Trusted-host admission boundary. It binds one opaque implementation to every
 * planned module without executing, compiling, importing, or mutating any module.
 */
export function bindTrustedPluginKernelAssemblyV1<Implementation = unknown>(
  planInput: unknown,
  bindingInput: unknown,
): TrustedPluginKernelBindingResultV1<Implementation> {
  try {
    return bindTrustedPluginKernelAssemblyUncheckedV1<Implementation>(planInput, bindingInput);
  } catch {
    return failure("kernel-binding.invalid-roster");
  }
}

function bindTrustedPluginKernelAssemblyUncheckedV1<Implementation = unknown>(
  planInput: unknown,
  bindingInput: unknown,
): TrustedPluginKernelBindingResultV1<Implementation> {
  const plan = capturePluginKernelAssemblyPlanV1(planInput);
  if (plan === null) return failure("kernel-binding.invalid-plan");
  if (!Array.isArray(bindingInput)) return failure("kernel-binding.invalid-roster");
  const byModuleId = new Map<string, TrustedPluginKernelModuleBindingV1<Implementation>>();
  for (let index = 0; index < bindingInput.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(bindingInput, index)) {
      return failure("kernel-binding.invalid-binding", { bindingIndex: index });
    }
    const binding = captureBinding<Implementation>(bindingInput[index]);
    if (binding === null) return failure("kernel-binding.invalid-binding", { bindingIndex: index });
    if (byModuleId.has(binding.moduleId)) {
      return failure("kernel-binding.duplicate-binding", { moduleId: binding.moduleId, bindingIndex: index });
    }
    const planned = plan.modules.find((entry) => entry.moduleId === binding.moduleId);
    if (planned === undefined) {
      return failure("kernel-binding.unexpected-binding", { moduleId: binding.moduleId, bindingIndex: index });
    }
    if (!sameIdentity(planned, binding)) {
      return failure("kernel-binding.identity-mismatch", { moduleId: binding.moduleId, bindingIndex: index });
    }
    byModuleId.set(binding.moduleId, binding);
  }
  const modules: BoundPluginKernelModuleV1<Implementation>[] = [];
  for (const entry of plan.modules) {
    const binding = byModuleId.get(entry.moduleId);
    if (binding === undefined) return failure("kernel-binding.missing-binding", { moduleId: entry.moduleId });
    modules.push(Object.freeze({ ...entry, implementation: binding.implementation }));
  }
  return Object.freeze({
    ok: true,
    assembly: Object.freeze({
      bindingVersion: 1,
      plan,
      modules: Object.freeze(modules),
    }),
  });
}
