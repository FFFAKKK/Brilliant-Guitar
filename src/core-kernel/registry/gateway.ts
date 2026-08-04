import { CommandBus } from "../commands/command-bus";
import type { CommandResult } from "../commands/contracts";
import { decodeCoreCommand } from "../commands/strict-codec";
import type { ScoreMetadata } from "../domain/score-document";
import type { EventSubscriptionResult } from "../events/contracts";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  KernelHistoryState,
  KernelReadState,
  ReadResult,
  ScoreEntityOwnership,
  ScoreRangeSelection,
  SelectedScoreEntity,
} from "../read/contracts";
import type {
  NormalizedRegistryModule,
  RegistryAssemblyState,
} from "./assembly";
import type {
  CompiledCommandContribution,
  CompiledSelectorContribution,
  CoreCompiledContribution,
} from "./builtins";
import type {
  CoreSelectorRequest,
  CoreSelectorResult,
  KernelCapability,
  KernelGatewayResult,
  KernelRegistryAccessFailure,
  RegistrySummary,
} from "./contracts";
import {
  decodeCoreSelectorRequest,
  isSafeRegistryId,
} from "./strict-codec";

export type KernelRegistryCreationResult =
  | { readonly ok: true; readonly registry: KernelRegistry }
  | { readonly ok: false; readonly failure: import("./contracts").KernelRegistryStartupFailure };

export type KernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: KernelModuleGateway }
  | { readonly ok: false; readonly failure: KernelRegistryAccessFailure };

const REGISTRY_CONSTRUCTION_TOKEN = Symbol("KernelRegistry construction");
const GATEWAY_CONSTRUCTION_TOKEN = Symbol("KernelModuleGateway construction");

interface KernelModuleGatewayState {
  readonly module: NormalizedRegistryModule;
  readonly registry: RegistryAssemblyState;
  readonly commandBus: CommandBus;
}

const REGISTRY_STATES = new WeakMap<KernelRegistry, RegistryAssemblyState>();
const GATEWAY_STATES = new WeakMap<
  KernelModuleGateway,
  KernelModuleGatewayState
>();

export class KernelRegistry {
  private constructor(
    token: typeof REGISTRY_CONSTRUCTION_TOKEN,
    state: RegistryAssemblyState,
  ) {
    if (token !== REGISTRY_CONSTRUCTION_TOKEN || state === undefined) {
      throw new TypeError("KernelRegistry cannot be constructed directly");
    }
    REGISTRY_STATES.set(this, state);
    Object.freeze(this);
  }

  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult {
    try {
      const state = REGISTRY_STATES.get(this);
      if (
        state === undefined ||
        !isSafeRegistryId(moduleId) ||
        !(commandBus instanceof CommandBus)
      ) {
        return {
          ok: false,
          failure: { code: "registry.invalid-invocation" },
        };
      }
      const module = state.modules.find(
        (candidate) => candidate.moduleId === moduleId,
      );
      if (module === undefined) {
        return {
          ok: false,
          failure: { code: "registry.module-not-found", moduleId },
        };
      }
      return {
        ok: true,
        gateway: constructGateway({ module, registry: state, commandBus }),
      };
    } catch {
      return { ok: false, failure: { code: "registry.internal-error" } };
    }
  }
}

export class KernelModuleGateway {
  private constructor(
    token: typeof GATEWAY_CONSTRUCTION_TOKEN,
    state: KernelModuleGatewayState,
  ) {
    if (token !== GATEWAY_CONSTRUCTION_TOKEN || state === undefined) {
      throw new TypeError("KernelModuleGateway cannot be constructed directly");
    }
    GATEWAY_STATES.set(this, state);
    Object.freeze(this);
  }

  summary(): KernelGatewayResult<RegistrySummary> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["registry:read"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return {
        status: "authorized",
        value: deepFreezeValue(structuredClone(state.registry.summary)),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  read(): KernelGatewayResult<ReadResult<KernelReadState>> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["score:read"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.read() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  submit(input: unknown): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const methodDenied = requireCapabilities(state.module, [
        "command:execute",
      ]);
      if (methodDenied !== undefined) {
        return gatewayRejected(methodDenied);
      }
      const decoded = decodeCoreCommand(input);
      if (decoded.ok) {
        const contribution = state.registry.contributions.find(
          (candidate): candidate is CompiledCommandContribution =>
            isCommandContribution(candidate) &&
            candidate.descriptor.id === decoded.value.commandId,
        );
        if (contribution === undefined) {
          return gatewayRejected({
            code: "registry.contribution-not-found",
            contributionId: decoded.value.commandId,
          });
        }
        const contributionDenied = requireCapabilities(
          state.module,
          contribution.descriptor.requiredCapabilities,
        );
        if (contributionDenied !== undefined) {
          return gatewayRejected(contributionDenied);
        }
      }
      return { status: "authorized", value: state.commandBus.submit(input) };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  undo(): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["command:execute"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.undo() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  redo(): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["command:execute"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.redo() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  subscribe(handler: unknown): KernelGatewayResult<EventSubscriptionResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["event:subscribe"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return {
        status: "authorized",
        value: state.commandBus.subscribe(handler),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-metadata" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreMetadata>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-entity" }
    >,
  ): KernelGatewayResult<ReadResult<SelectedScoreEntity>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-entity-ownership" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreEntityOwnership>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-range" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreRangeSelection>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.history-state" }
    >,
  ): KernelGatewayResult<ReadResult<KernelHistoryState>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.dirty-state" }
    >,
  ): KernelGatewayResult<ReadResult<boolean>>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const methodDenied = requireCapabilities(state.module, [
        "score:read",
        "selector:execute",
      ]);
      if (methodDenied !== undefined) {
        return gatewayRejected(methodDenied);
      }
      const request = decodeCoreSelectorRequest(input);
      if (request === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const contribution = state.registry.contributions.find(
        (candidate): candidate is CompiledSelectorContribution =>
          isSelectorContribution(candidate) &&
          candidate.descriptor.id === request.selectorId,
      );
      if (contribution === undefined) {
        return gatewayRejected({
          code: "registry.contribution-not-found",
          contributionId: request.selectorId,
        });
      }
      const contributionDenied = requireCapabilities(
        state.module,
        contribution.descriptor.requiredCapabilities,
      );
      if (contributionDenied !== undefined) {
        return gatewayRejected(contributionDenied);
      }
      const read = state.commandBus.read();
      if (!read.ok) {
        return { status: "authorized", value: read };
      }
      return {
        status: "authorized",
        value:
          contribution.inputKind === "snapshot"
            ? contribution.selector(read.value.snapshot, request)
            : contribution.selector(read.value, request),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }
}

function isCommandContribution(
  contribution: CoreCompiledContribution,
): contribution is CompiledCommandContribution {
  return contribution.descriptor.kind === "command";
}

function isSelectorContribution(
  contribution: CoreCompiledContribution,
): contribution is CompiledSelectorContribution {
  return contribution.descriptor.kind === "selector";
}

function gatewayRejected<T>(
  failure: KernelRegistryAccessFailure,
): KernelGatewayResult<T> {
  return { status: "rejected", failure };
}

function requireCapabilities(
  module: NormalizedRegistryModule,
  required: readonly KernelCapability[],
): KernelRegistryAccessFailure | undefined {
  for (const capability of required) {
    if (!module.capabilities.includes(capability)) {
      return {
        code: "registry.capability-denied",
        moduleId: module.moduleId,
        capability,
      };
    }
  }
  return undefined;
}

export function constructKernelRegistry(
  state: RegistryAssemblyState,
): KernelRegistry {
  return Reflect.construct(KernelRegistry, [
    REGISTRY_CONSTRUCTION_TOKEN,
    state,
  ]) as KernelRegistry;
}

function constructGateway(
  state: KernelModuleGatewayState,
): KernelModuleGateway {
  return Reflect.construct(KernelModuleGateway, [
    GATEWAY_CONSTRUCTION_TOKEN,
    state,
  ]) as KernelModuleGateway;
}
