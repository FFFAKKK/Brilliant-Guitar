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
