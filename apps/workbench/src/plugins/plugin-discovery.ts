import type { UiPluginManifest, WorkbenchCapabilityRegistry } from "../ui/plugin-manifest.ts";
import { isUiPluginManifest } from "../ui/plugin-manifest.ts";

export type PluginManifestDiscoveryFailureCode =
  | "manifest.invalid"
  | "manifest.duplicate"
  | "manifest.capability-unavailable"
  | "manifest.projection-unavailable";

export interface PluginManifestDiscoveryFailure {
  readonly code: PluginManifestDiscoveryFailureCode;
  readonly pluginId: string | null;
  readonly message: string;
  readonly detail?: string;
}

export type PluginManifestDiscoveryResult =
  | { readonly accepted: true; readonly manifest: UiPluginManifest }
  | { readonly accepted: false; readonly failure: PluginManifestDiscoveryFailure };

export interface PluginManifestDiscoveryOptions {
  readonly capabilities: WorkbenchCapabilityRegistry;
  readonly projections: readonly string[];
}

function candidateId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Preflight directory for host supplied manifests; it never loads or executes plugin code. */
export class PluginManifestDiscovery {
  readonly #capabilities: WorkbenchCapabilityRegistry;
  readonly #projections: ReadonlySet<string>;
  readonly #manifests = new Map<string, UiPluginManifest>();
  readonly #failures: PluginManifestDiscoveryFailure[] = [];

  constructor(options: PluginManifestDiscoveryOptions) {
    this.#capabilities = options.capabilities;
    this.#projections = new Set(options.projections);
  }

  inspect(value: unknown): PluginManifestDiscoveryResult {
    if (!isUiPluginManifest(value)) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.invalid",
        pluginId: candidateId(value),
        message: "插件清单无效",
        detail: "Manifest does not match the supported plugin package contract",
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    if (this.#manifests.has(value.id)) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.duplicate",
        pluginId: value.id,
        message: "插件清单重复",
        detail: `Plugin manifest already discovered: ${value.id}`,
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    const missingCapabilities = this.#capabilities.missing(value.requires.capabilities);
    if (missingCapabilities.length > 0) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.capability-unavailable",
        pluginId: value.id,
        message: "插件所需能力不可用",
        detail: missingCapabilities.join(", "),
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    const missingProjections = value.requires.projections.filter((id) => !this.#projections.has(id));
    if (missingProjections.length > 0) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.projection-unavailable",
        pluginId: value.id,
        message: "插件所需数据投影不可用",
        detail: missingProjections.join(", "),
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    this.#manifests.set(value.id, value);
    return { accepted: true, manifest: value };
  }

  discover(values: readonly unknown[]): readonly PluginManifestDiscoveryResult[] {
    return values.map((value) => this.inspect(value));
  }

  list(): readonly UiPluginManifest[] {
    return [...this.#manifests.values()];
  }

  failures(): readonly PluginManifestDiscoveryFailure[] {
    return [...this.#failures];
  }
}
