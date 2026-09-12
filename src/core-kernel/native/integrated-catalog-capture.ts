import { getKernelIntegratedCatalogState } from "../registry/domain-catalog";
import type {
  ExtensionRuntimeRequirementV1,
  KernelIntegratedCatalog,
} from "../registry/integrated-contracts";

export interface HostInstalledContributionsV1 {
  readonly contributions: readonly {
    readonly moduleId: string;
    readonly contributionId: string;
    readonly requirements: readonly ExtensionRuntimeRequirementV1[];
  }[];
}

export interface HostCatalogCaptureV1 {
  readonly catalogIdentity: object;
  readonly projection: HostInstalledContributionsV1;
}

const freeze = Object.freeze;
const create = Object.create;
const defineProperty = Object.defineProperty;
const apply = Reflect.apply;
const weakGet = WeakMap.prototype.get;
const weakSet = WeakMap.prototype.set;
const captures = new WeakMap<KernelIntegratedCatalog, HostCatalogCaptureV1>();

function append<T>(array: T[], value: T): void {
  // Own slots avoid inherited Array setters while capturing trusted SDK data.
  defineProperty(array, array.length, {
    value, enumerable: true, writable: true, configurable: true,
  });
}

/** Internal data capture only. Neither the projection nor its identity marker
 * authorizes catalog registration or supplies callback bindings. */
export function captureHostInstalledContributionsV1(
  catalog: unknown,
): HostCatalogCaptureV1 | undefined {
  try {
    if (catalog === null || typeof catalog !== "object") return undefined;
    const genuine = catalog as KernelIntegratedCatalog;
    // Authenticate through the compiler's WeakMap, never through properties.
    const state = getKernelIntegratedCatalogState(genuine);
    if (state === undefined) return undefined;
    const cached = apply(weakGet, captures, [genuine]) as HostCatalogCaptureV1 | undefined;
    if (cached !== undefined) return cached;

    const contributions: HostInstalledContributionsV1["contributions"][number][] = [];
    for (let index = 0; index < state.contributions.length; index += 1) {
      const contribution = state.contributions[index];
      if (contribution === undefined) return undefined;
      const requirements: ExtensionRuntimeRequirementV1[] = [];
      for (let at = 0; at < contribution.extensionRequirements.length; at += 1) {
        const requirement = contribution.extensionRequirements[at];
        if (requirement === undefined) return undefined;
        const versions: number[] = [];
        for (let versionIndex = 0; versionIndex < requirement.supportedSchemaVersions.length; versionIndex += 1) {
          const version = requirement.supportedSchemaVersions[versionIndex];
          if (version === undefined) return undefined;
          append(versions, version);
        }
        append(requirements, freeze({
          requirementVersion: requirement.requirementVersion,
          namespace: requirement.namespace,
          moduleId: requirement.moduleId,
          contributionId: requirement.contributionId,
          supportedSchemaVersions: freeze(versions),
          requiredForWrite: requirement.requiredForWrite,
        }));
      }
      append(contributions, freeze({
        moduleId: contribution.moduleId,
        contributionId: contribution.contributionId,
        requirements: freeze(requirements),
      }));
    }
    const captured: HostCatalogCaptureV1 = freeze({
      catalogIdentity: freeze(create(null) as object),
      projection: freeze({ contributions: freeze(contributions) }),
    });
    // Publish only a fully detached, frozen result. Failed capture is not cached.
    apply(weakSet, captures, [genuine, captured]);
    return captured;
  } catch {
    return undefined;
  }
}
