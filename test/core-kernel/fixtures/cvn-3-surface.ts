import * as coreKernel from "../../../src/core-kernel/index";
import type {
  RegistryContributionSummary,
  RegistrySummary,
} from "../../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import { cloneCoreScoreFixture } from "./core-score";
import {
  CVN1_COMMAND_IDS,
  CVN1_RUNTIME_EXPORT_NAMES,
} from "./cvn-1-characterization";

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

/** The accepted CVN-3 runtime surface, retained after later additive work. */
export const CVN3_RUNTIME_EXPORT_NAMES = [
  ...CVN1_RUNTIME_EXPORT_NAMES,
  "createScoreDocument",
] as const;

/** The accepted CVN-3 command catalog, retained after later additive work. */
export const CVN3_COMMAND_IDS = [
  ...CVN1_COMMAND_IDS,
  "core.measure.insert",
  "core.measure.remove",
  "core.measure.move",
  "core.measure.set-definition",
] as const;

const CVN3_RUNTIME_EXPORT_NAME_SET: ReadonlySet<string> = new Set(
  CVN3_RUNTIME_EXPORT_NAMES,
);
const CVN3_COMMAND_ID_SET: ReadonlySet<string> = new Set(CVN3_COMMAND_IDS);

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

export function collectCurrentCoreSurfaceTrace(): Cvn3SurfaceTrace {
  const summary = requireRegistrySummary();
  return {
    runtimeExports: Object.keys(coreKernel).sort(),
    catalog: CORE_COMMAND_DEFINITIONS.map(({ commandId, targetKind }) => ({
      commandId,
      targetKind,
    })),
    registryCommandDescriptors: summary.contributions.filter(isRegistryCommandDescriptor),
  };
}

/**
 * CVN-3 is an accepted 49/10/10 checkpoint. Later Core commands must not
 * rewrite its fixture, so this collector observes only that fixed subset.
 */
export function collectCvn3SurfaceTrace(): Cvn3SurfaceTrace {
  const current = collectCurrentCoreSurfaceTrace();
  return {
    runtimeExports: current.runtimeExports.filter((name) =>
      CVN3_RUNTIME_EXPORT_NAME_SET.has(name),
    ),
    catalog: current.catalog.filter(({ commandId }) =>
      CVN3_COMMAND_ID_SET.has(commandId),
    ),
    registryCommandDescriptors: current.registryCommandDescriptors.filter(
      ({ id }) => CVN3_COMMAND_ID_SET.has(id),
    ),
  };
}

export function serializeCvn3SurfaceTrace(trace: Cvn3SurfaceTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
