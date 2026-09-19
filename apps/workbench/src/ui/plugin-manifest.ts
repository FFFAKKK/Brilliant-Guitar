import {
  createPluginKernelAssemblyPlanV1,
  isPluginKernelModuleManifestV1,
  isPluginTier,
} from "../plugins/plugin-package-contract.ts";
import type {
  PluginKernelModuleManifestV1,
  PluginTier,
} from "../plugins/plugin-package-contract.ts";

export const WORKBENCH_PLUGIN_API_VERSION = "2.0" as const;

export type WorkbenchCapabilityId = string;

export interface UiPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tier?: PluginTier;
  readonly apiVersion: typeof WORKBENCH_PLUGIN_API_VERSION;
  readonly runtime: "internal-module";
  readonly activation: "always" | "user";
  readonly requires: Readonly<{
    capabilities: readonly WorkbenchCapabilityId[];
    projections: readonly string[];
  }>;
  readonly contributes: Readonly<{
    views: readonly string[];
    commands: readonly string[];
    interactions: readonly string[];
    componentExtensions: readonly string[];
    readonly instruments?: readonly string[];
    readonly playbackOutputs?: readonly string[];
    readonly kernelModules?: readonly PluginKernelModuleManifestV1[];
  }>;
}

const dottedId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const semanticVersion = /^\d+\.\d+\.\d+$/;

function uniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

export function isUiPluginManifest(value: unknown): value is UiPluginManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UiPluginManifest>;
  if (typeof candidate.id !== "string" || !dottedId.test(candidate.id)
    || typeof candidate.name !== "string" || candidate.name.length === 0
    || typeof candidate.version !== "string" || !semanticVersion.test(candidate.version)
    || (candidate.tier !== undefined && !isPluginTier(candidate.tier))
    || candidate.apiVersion !== WORKBENCH_PLUGIN_API_VERSION
    || candidate.runtime !== "internal-module"
    || (candidate.activation !== "always" && candidate.activation !== "user")) return false;
  const requires = candidate.requires;
  if (typeof requires !== "object" || requires === null
    || !uniqueStrings(requires.capabilities) || !uniqueStrings(requires.projections)) return false;
  const contributes = candidate.contributes;
  const validContributions = typeof contributes === "object" && contributes !== null
    && uniqueStrings(contributes.views) && uniqueStrings(contributes.commands) && uniqueStrings(contributes.interactions)
    && uniqueStrings(contributes.componentExtensions)
    && (contributes.instruments === undefined || uniqueStrings(contributes.instruments))
    && (contributes.playbackOutputs === undefined || uniqueStrings(contributes.playbackOutputs))
    && (contributes.kernelModules === undefined || (Array.isArray(contributes.kernelModules)
      && contributes.kernelModules.every(isPluginKernelModuleManifestV1)));
  if (!validContributions) return false;
  try {
    createPluginKernelAssemblyPlanV1([{
      id: candidate.id,
      version: candidate.version,
      activation: candidate.activation,
      ...(candidate.tier === undefined ? {} : { tier: candidate.tier }),
      ...(contributes.kernelModules === undefined ? {} : { kernelModules: contributes.kernelModules }),
    }]);
    return true;
  } catch {
    return false;
  }
}

/** Immutable service directory exposed by the host during plugin installation. */
export class WorkbenchCapabilityRegistry {
  readonly #capabilities: ReadonlySet<WorkbenchCapabilityId>;

  constructor(capabilities: readonly WorkbenchCapabilityId[]) {
    if (!uniqueStrings(capabilities)) throw new Error("Invalid workbench capability directory");
    this.#capabilities = new Set(capabilities);
  }

  has(capability: WorkbenchCapabilityId): boolean { return this.#capabilities.has(capability); }
  list(): readonly WorkbenchCapabilityId[] { return [...this.#capabilities]; }
  missing(required: readonly WorkbenchCapabilityId[]): readonly WorkbenchCapabilityId[] {
    return required.filter((capability) => !this.#capabilities.has(capability));
  }
}
