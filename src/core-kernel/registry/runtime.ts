import { CORE_COMPILED_REGISTRATION_ENTRIES } from "./builtins";
import {
  buildRegistryCandidate,
  createRegistryAssemblyState,
  type NormalizedRegistryModule,
  type RegistryCandidateResult,
  type RegistryCandidateState,
} from "./assembly";
import {
  constructKernelRegistry,
  constructIntegratedKernelRegistry,
  KernelModuleGateway,
  KernelRegistry,
  type KernelModuleGatewayCreationResult,
  type KernelRegistryCreationResult,
} from "./gateway";
import { decodeKernelStartupManifest } from "./strict-codec";
import { deepFreezeValue } from "../read/deep-freeze";
import {
  resolveKernelIntegratedRuntimeAssembly,
  type KernelIntegratedRuntimeAssemblyState,
} from "./domain-availability";
import type { KernelIntegratedCatalog } from "./integrated-contracts";
import type {
  RegistryContributionSummary,
  RegistrySummary,
} from "./contracts";

const reflectApply = Reflect.apply;
const arraySort = Array.prototype.sort;

export {
  buildRegistryCandidate,
  KernelModuleGateway,
  KernelRegistry,
};
export type {
  KernelModuleGatewayCreationResult,
  KernelRegistryCreationResult,
  NormalizedRegistryModule,
  RegistryCandidateResult,
  RegistryCandidateState,
};

/**
 * Public startup orchestration. Manifest decoding and candidate validation stay
 * separate from the token-bound Registry/Gateway implementation details.
 */
export function createKernelRegistry(
  catalog: KernelIntegratedCatalog,
): KernelRegistryCreationResult;
export function createKernelRegistry(
  manifest: unknown,
): KernelRegistryCreationResult;
export function createKernelRegistry(
  catalog: KernelIntegratedCatalog,
  knownRequirements: unknown,
): KernelRegistryCreationResult;
export function createKernelRegistry(
  manifestOrCatalog: unknown,
  knownRequirements?: unknown,
): KernelRegistryCreationResult {
  try {
    const integrated = arguments.length >= 2
      ? resolveKernelIntegratedRuntimeAssembly(
          manifestOrCatalog as KernelIntegratedCatalog,
          knownRequirements,
        )
      : resolveKernelIntegratedRuntimeAssembly(
          manifestOrCatalog as KernelIntegratedCatalog,
        );
    if (integrated.ok) {
      const registryState = createIntegratedRegistryState(integrated.state);
      return {
        ok: true,
        registry: constructIntegratedKernelRegistry(
          registryState,
          integrated.state,
        ),
      };
    }
    if (arguments.length >= 2 || integrated.reason === "inventory") {
      return {
        ok: false,
        failure: { code: "registry.invalid-startup-input" },
      };
    }

    const decoded = decodeKernelStartupManifest(manifestOrCatalog);
    if (!decoded.ok) {
      return decoded;
    }
    const candidate = buildRegistryCandidate(
      decoded.value,
      CORE_COMPILED_REGISTRATION_ENTRIES,
    );
    return candidate.ok
      ? {
          ok: true,
          registry: constructKernelRegistry(
            createRegistryAssemblyState(candidate.state),
          ),
        }
      : candidate;
  } catch {
    return { ok: false, failure: { code: "registry.internal-error" } };
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createIntegratedRegistryState(
  runtime: KernelIntegratedRuntimeAssemblyState,
): import("./assembly").RegistryAssemblyState {
  const core = runtime.catalogState.coreAssembly;
  const modules = [] as NormalizedRegistryModule[];
  for (let index = 0; index < core.modules.length; index += 1) {
    const module = core.modules[index];
    if (module !== undefined) modules[modules.length] = module;
  }
  for (let index = 0; index < runtime.catalogState.modules.length; index += 1) {
    const module = runtime.catalogState.modules[index];
    if (module !== undefined) modules[modules.length] = module;
  }
  reflectApply(arraySort, modules, [
    (left: NormalizedRegistryModule, right: NormalizedRegistryModule) =>
      compareText(left.moduleId, right.moduleId),
  ]);
  const contributionSummaries: RegistryContributionSummary[] = [];
  for (let index = 0; index < core.summary.contributions.length; index += 1) {
    const contribution = core.summary.contributions[index];
    if (contribution !== undefined) {
      contributionSummaries[contributionSummaries.length] = contribution;
    }
  }
  for (let contributionIndex = 0;
    contributionIndex < runtime.catalogState.contributions.length;
    contributionIndex += 1) {
    const contribution = runtime.catalogState.contributions[contributionIndex];
    if (contribution === undefined) {
      continue;
    }
    for (let commandIndex = 0;
      commandIndex < contribution.commands.length;
      commandIndex += 1) {
      const command = contribution.commands[commandIndex];
      if (command === undefined) {
        continue;
      }
      contributionSummaries[contributionSummaries.length] = {
        id: command.descriptor.commandId,
        kind: "command",
        sourceModuleId: contribution.moduleId,
        apiVersion: 1,
        requiredCapabilities: ["command:execute", "score:read"],
        titleKey: command.descriptor.titleKey,
        targetKind: command.descriptor.targetKind,
      };
    }
  }
  reflectApply(arraySort, contributionSummaries, [
    (left: RegistryContributionSummary, right: RegistryContributionSummary) => {
      const kind = compareText(left.kind, right.kind);
      return kind !== 0 ? kind : compareText(left.id, right.id);
    },
  ]);
  const moduleSummaries: RegistrySummary["modules"][number][] = [];
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    if (module !== undefined) {
      moduleSummaries[moduleSummaries.length] = {
        moduleId: module.moduleId,
        apiVersion: module.apiVersion,
      };
    }
  }
  const summary: RegistrySummary = {
    startupManifestVersion: 1,
    modules: moduleSummaries,
    contributions: contributionSummaries,
  };
  return deepFreezeValue({
    startupManifestVersion: 1,
    modules,
    contributions: core.contributions,
    summary,
  });
}

export { decodeKernelStartupManifest } from "./strict-codec";
