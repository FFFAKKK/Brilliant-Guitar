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
  KernelModuleGateway,
  KernelRegistry,
  type KernelModuleGatewayCreationResult,
  type KernelRegistryCreationResult,
} from "./gateway";
import { decodeKernelStartupManifest } from "./strict-codec";

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
  manifest: unknown,
): KernelRegistryCreationResult {
  try {
    const decoded = decodeKernelStartupManifest(manifest);
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

export { decodeKernelStartupManifest } from "./strict-codec";
