import * as coreKernel from "../../../src/core-kernel/index";
import type {
  RegistryContributionSummary,
  RegistrySummary,
} from "../../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import { cloneCoreScoreFixture } from "./core-score";

type RegistryCommandDescriptor = Extract<
  RegistryContributionSummary,
  { readonly kind: "command" }
>;

interface MutableStartupManifest {
  startupManifestVersion: number;
  modules: Array<Record<string, unknown>>;
}

export interface Cvn3SurfaceTrace {
  readonly runtimeExports: readonly string[];
  readonly catalog: readonly {
    readonly commandId: string;
    readonly targetKind: string;
  }[];
  readonly registryCommandDescriptors: readonly RegistryCommandDescriptor[];
}

function requireRegistrySummary(): RegistrySummary {
  const createdBus = coreKernel.CommandBus.create(cloneCoreScoreFixture());
  if (!createdBus.ok) {
    throw new Error(`expected CVN-3 surface fixture bus: ${createdBus.failure.code}`);
  }

  const manifest = structuredClone(
    coreKernel.CORE_KERNEL_STARTUP_MANIFEST,
  ) as unknown as MutableStartupManifest;
  manifest.modules.push({
    moduleId: "internal.cvn3.surface",
    origin: "official",
    runtime: "internal-module",
    trustLevel: "system-trusted",
    apiVersion: 1,
    capabilities: ["registry:read"],
    registrationEntryIds: [],
  });

  const createdRegistry = coreKernel.createKernelRegistry(manifest);
  if (!createdRegistry.ok) {
    throw new Error(
      `expected CVN-3 surface fixture Registry: ${createdRegistry.failure.code}`,
    );
  }
  const createdGateway = createdRegistry.registry.createGateway(
    "internal.cvn3.surface",
    createdBus.value,
  );
  if (!createdGateway.ok) {
    throw new Error(
      `expected CVN-3 surface fixture gateway: ${createdGateway.failure.code}`,
    );
  }
  const summary = createdGateway.gateway.summary();
  if (summary.status !== "authorized") {
    throw new Error(
      `expected CVN-3 surface fixture summary: ${summary.failure.code}`,
    );
  }
  return summary.value;
}

function isRegistryCommandDescriptor(
  contribution: RegistryContributionSummary,
): contribution is RegistryCommandDescriptor {
  return contribution.kind === "command";
}

export function collectCvn3SurfaceTrace(): Cvn3SurfaceTrace {
  const summary = requireRegistrySummary();
  return {
    runtimeExports: Object.keys(coreKernel).sort(),
    catalog: CORE_COMMAND_DEFINITIONS.map(({ commandId, targetKind }) => ({
      commandId,
      targetKind,
    })),
    registryCommandDescriptors: summary.contributions.filter(
      isRegistryCommandDescriptor,
    ),
  };
}

export function serializeCvn3SurfaceTrace(trace: Cvn3SurfaceTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
