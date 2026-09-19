import type { UiPluginManifest, WorkbenchFeatureRegistry } from "../ui/plugin-manifest.ts";
import { captureUiPluginManifest } from "../ui/plugin-manifest.ts";

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
  readonly hostFeatures: WorkbenchFeatureRegistry;
  readonly projections: readonly string[];
}

function candidateId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "id");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string" && descriptor.value.length > 0
      ? descriptor.value : null;
  } catch { return null; }
}

/** Preflight directory for host supplied manifests; it never loads or executes plugin code. */
export class PluginManifestDiscovery {
  readonly #hostFeatures: WorkbenchFeatureRegistry;
  readonly #projections: ReadonlySet<string>;
  readonly #manifests = new Map<string, UiPluginManifest>();
  readonly #failures: PluginManifestDiscoveryFailure[] = [];

  constructor(options: PluginManifestDiscoveryOptions) {
    this.#hostFeatures = options.hostFeatures;
    this.#projections = new Set(options.projections);
  }

  inspect(value: unknown): PluginManifestDiscoveryResult {
    const manifest = captureUiPluginManifest(value);
    if (!manifest) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.invalid",
        pluginId: candidateId(value),
        message: "插件清单无效",
        detail: "Manifest does not match the supported plugin package contract",
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    if (this.#manifests.has(manifest.id)) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.duplicate",
        pluginId: manifest.id,
        message: "插件清单重复",
        detail: `Plugin manifest already discovered: ${manifest.id}`,
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    const missingFeatures = this.#hostFeatures.missing(manifest.requires.hostFeatures);
    if (missingFeatures.length > 0) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.capability-unavailable",
        pluginId: manifest.id,
        message: "插件所需能力不可用",
        detail: missingFeatures.join(", "),
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    const missingProjections = manifest.requires.projections.filter((id) => !this.#projections.has(id));
    if (missingProjections.length > 0) {
      const failure: PluginManifestDiscoveryFailure = {
        code: "manifest.projection-unavailable",
        pluginId: manifest.id,
        message: "插件所需数据投影不可用",
        detail: missingProjections.join(", "),
      };
      this.#failures.push(failure);
      return { accepted: false, failure };
    }
    this.#manifests.set(manifest.id, manifest);
    return { accepted: true, manifest };
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
