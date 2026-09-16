export const WORKBENCH_PLUGIN_API_VERSION = "1.0" as const;

export type WorkbenchCapabilityId = string;

export interface UiPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: typeof WORKBENCH_PLUGIN_API_VERSION;
  readonly runtime: "internal-module";
  readonly requires: readonly WorkbenchCapabilityId[];
  readonly contributes: Readonly<{
    components: readonly string[];
    views: readonly string[];
    commands: readonly string[];
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
    || candidate.apiVersion !== WORKBENCH_PLUGIN_API_VERSION
    || candidate.runtime !== "internal-module"
    || !uniqueStrings(candidate.requires)) return false;
  const contributes = candidate.contributes;
  return typeof contributes === "object" && contributes !== null
    && uniqueStrings(contributes.components) && uniqueStrings(contributes.views) && uniqueStrings(contributes.commands)
    && contributes.views.every((id) => contributes.components.includes(id));
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
