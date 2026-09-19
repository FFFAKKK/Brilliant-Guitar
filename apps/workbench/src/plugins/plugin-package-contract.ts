export type PluginTier = "system" | "product" | "third-party";
export type PluginKernelModuleRuntime = "internal-module" | "wasm";

export interface PluginKernelModuleManifestV1 {
  readonly moduleId: string;
  readonly apiVersion: 1;
  readonly runtime: PluginKernelModuleRuntime;
  readonly activation: "session-fixed";
}

export interface PluginKernelPackageManifestSource {
  readonly id: string;
  readonly version: string;
  readonly activation: "always" | "user";
  readonly tier?: PluginTier;
  readonly kernelModules?: readonly PluginKernelModuleManifestV1[];
}

export interface PluginKernelAssemblyEntryV1 extends PluginKernelModuleManifestV1 {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly tier: PluginTier;
}

export interface PluginKernelAssemblyPlanV1 {
  readonly planVersion: 1;
  readonly modules: readonly PluginKernelAssemblyEntryV1[];
}

// The Kernel V1 catalog admits 64 modules; two slots are permanently owned by Core commands/selectors.
export const PLUGIN_PACKAGE_V1_LIMITS = Object.freeze({ kernelModules: 62 as const });

const dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const semanticVersion = /^\d+\.\d+\.\d+$/;

function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
    const record: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function denseArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function isPluginTier(value: unknown): value is PluginTier {
  return value === "system" || value === "product" || value === "third-party";
}

export function isPluginKernelModuleManifestV1(value: unknown): value is PluginKernelModuleManifestV1 {
  if (typeof value !== "object" || value === null) return false;
  const module = value as Partial<PluginKernelModuleManifestV1>;
  return typeof module.moduleId === "string"
    && dottedId.test(module.moduleId)
    && module.apiVersion === 1
    && (module.runtime === "internal-module" || module.runtime === "wasm")
    && module.activation === "session-fixed";
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical data-only bridge from one plugin package roster to the fixed kernel session assembly. */
export function createPluginKernelAssemblyPlanV1(
  packages: readonly PluginKernelPackageManifestSource[],
): PluginKernelAssemblyPlanV1 {
  const packageIds = new Set<string>();
  const moduleOwners = new Map<string, string>();
  const modules: PluginKernelAssemblyEntryV1[] = [];
  for (const plugin of packages) {
    const tier = plugin.tier ?? "product";
    const contributions = plugin.kernelModules ?? [];
    if (!dottedId.test(plugin.id) || !semanticVersion.test(plugin.version) || !isPluginTier(tier)) {
      throw new Error(`Invalid plugin package identity: ${plugin.id}`);
    }
    if (packageIds.has(plugin.id)) throw new Error(`Plugin package already registered: ${plugin.id}`);
    packageIds.add(plugin.id);
    if (tier === "system" && plugin.activation !== "always") {
      throw new Error(`System plugin must always be active: ${plugin.id}`);
    }
    if (contributions.length > 0 && plugin.activation !== "always") {
      throw new Error(`Kernel plugin must use fixed activation: ${plugin.id}`);
    }
    for (const contribution of contributions) {
      if (!isPluginKernelModuleManifestV1(contribution)) {
        throw new Error(`Invalid kernel module manifest: ${plugin.id}`);
      }
      if (tier === "third-party" && contribution.runtime !== "wasm") {
        throw new Error(`Third-party kernel module must use Wasm: ${contribution.moduleId}`);
      }
      const owner = moduleOwners.get(contribution.moduleId);
      if (owner !== undefined) {
        throw new Error(`Kernel module already owned: ${contribution.moduleId} (${owner})`);
      }
      moduleOwners.set(contribution.moduleId, plugin.id);
      modules.push(Object.freeze({
        pluginId: plugin.id,
        pluginVersion: plugin.version,
        tier,
        moduleId: contribution.moduleId,
        apiVersion: contribution.apiVersion,
        runtime: contribution.runtime,
        activation: contribution.activation,
      }));
      if (modules.length > PLUGIN_PACKAGE_V1_LIMITS.kernelModules) {
        throw new Error(`Kernel module limit exceeded: ${PLUGIN_PACKAGE_V1_LIMITS.kernelModules}`);
      }
    }
  }
  modules.sort((left, right) => codeUnitCompare(left.moduleId, right.moduleId));
  return Object.freeze({ planVersion: 1, modules: Object.freeze(modules) });
}

/** Strictly captures a transported plan and returns its canonical frozen form. */
function capturePluginKernelAssemblyPlanUncheckedV1(value: unknown): PluginKernelAssemblyPlanV1 | null {
  const plan = exactDataRecord(value, ["planVersion", "modules"]);
  const modules = denseArray(plan?.modules);
  if (plan?.planVersion !== 1 || modules === null || modules.length > PLUGIN_PACKAGE_V1_LIMITS.kernelModules) return null;
  const packages = new Map<string, {
    id: string;
    version: string;
    activation: "always";
    tier: PluginTier;
    kernelModules: PluginKernelModuleManifestV1[];
  }>();
  for (const value of modules) {
    const entry = exactDataRecord(value,
      ["pluginId", "pluginVersion", "tier", "moduleId", "apiVersion", "runtime", "activation"]);
    if (entry === null || typeof entry.pluginId !== "string" || !dottedId.test(entry.pluginId)
      || typeof entry.pluginVersion !== "string" || !semanticVersion.test(entry.pluginVersion)
      || !isPluginTier(entry.tier) || typeof entry.moduleId !== "string"
      || (entry.runtime !== "internal-module" && entry.runtime !== "wasm")
      || !isPluginKernelModuleManifestV1({
        moduleId: entry.moduleId,
        apiVersion: entry.apiVersion,
        runtime: entry.runtime,
        activation: entry.activation,
      })) return null;
    const existing = packages.get(entry.pluginId);
    if (existing && (existing.version !== entry.pluginVersion || existing.tier !== entry.tier)) return null;
    const plugin = existing ?? {
      id: entry.pluginId,
      version: entry.pluginVersion,
      activation: "always" as const,
      tier: entry.tier,
      kernelModules: [],
    };
    plugin.kernelModules.push({
      moduleId: entry.moduleId,
      apiVersion: 1,
      runtime: entry.runtime,
      activation: "session-fixed",
    });
    packages.set(plugin.id, plugin);
  }
  try {
    return createPluginKernelAssemblyPlanV1([...packages.values()]);
  } catch {
    return null;
  }
}

export function capturePluginKernelAssemblyPlanV1(value: unknown): PluginKernelAssemblyPlanV1 | null {
  try {
    return capturePluginKernelAssemblyPlanUncheckedV1(value);
  } catch {
    return null;
  }
}

export function isPluginKernelAssemblyPlanV1(value: unknown): value is PluginKernelAssemblyPlanV1 {
  return capturePluginKernelAssemblyPlanV1(value) !== null;
}
