import { CommandBus } from "../commands/command-bus";
import type { CommandResult } from "../commands/contracts";
import { decodeCoreCommand } from "../commands/strict-codec";
import { captureStrictInput } from "../codec/strict-input-capture";
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
  readExactDataRecord,
} from "./strict-codec";
import {
  getIntegratedCommandBusAssemblyIdentity,
  isIntegratedCommandBus,
} from "../commands/integrated-runtime";
import type {
  IntegratedCommandBus,
  IntegratedKernelModuleGateway,
  IntegratedKernelModuleGatewayCreationResult,
  KernelCommandResult,
} from "./integrated-contracts";
import type { KernelIntegratedRuntimeAssemblyState } from "./domain-availability";

const reflectApply = Reflect.apply;
const reflectConstruct = Reflect.construct;
const objectFreeze = Object.freeze;
const arrayIncludes = Array.prototype.includes;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const structuredCloneValue = structuredClone;

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
  readonly commandBus: CommandBus | IntegratedCommandBus;
  readonly runtimeAssembly?: KernelIntegratedRuntimeAssemblyState;
}

interface KernelRegistryPrivateState {
  readonly registry: RegistryAssemblyState;
  readonly runtimeAssembly?: KernelIntegratedRuntimeAssemblyState;
}

const REGISTRY_STATES = new WeakMap<KernelRegistry, KernelRegistryPrivateState>();
const GATEWAY_STATES = new WeakMap<
  KernelModuleGateway,
  KernelModuleGatewayState
>();

export class KernelRegistry {
  private constructor(
    token: typeof REGISTRY_CONSTRUCTION_TOKEN,
    state: KernelRegistryPrivateState,
  ) {
    if (token !== REGISTRY_CONSTRUCTION_TOKEN || state === undefined) {
      throw new TypeError("KernelRegistry cannot be constructed directly");
    }
    reflectApply(weakMapSet, REGISTRY_STATES, [this, state]);
    reflectApply(objectFreeze, Object, [this]);
  }

  createGateway(
    moduleId: string,
    commandBus: IntegratedCommandBus,
  ): IntegratedKernelModuleGatewayCreationResult;
  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult;
  createGateway(
    moduleId: string,
    commandBus: CommandBus | IntegratedCommandBus,
  ):
    | KernelModuleGatewayCreationResult
    | IntegratedKernelModuleGatewayCreationResult {
    try {
      const state = reflectApply(weakMapGet, REGISTRY_STATES, [this]) as
        | KernelRegistryPrivateState
        | undefined;
      if (
        state === undefined ||
        !isSafeRegistryId(moduleId)
      ) {
        return {
          ok: false,
          failure: { code: "registry.invalid-invocation" },
        };
      }
      const coreBus = commandBus instanceof CommandBus;
      const integratedBus = isIntegratedCommandBus(commandBus);
      if (!coreBus && !integratedBus) {
        return {
          ok: false,
          failure: { code: "registry.invalid-invocation" },
        };
      }
      if (
        (state.runtimeAssembly === undefined && integratedBus) ||
        (state.runtimeAssembly !== undefined && coreBus)
      ) {
        return {
          ok: false,
          failure: { code: "registry.assembly-mismatch" },
        };
      }
      if (
        state.runtimeAssembly !== undefined &&
        getIntegratedCommandBusAssemblyIdentity(
          commandBus as IntegratedCommandBus,
        ) !== state.runtimeAssembly.assemblyIdentity
      ) {
        return {
          ok: false,
          failure: { code: "registry.assembly-mismatch" },
        };
      }
      let module: NormalizedRegistryModule | undefined;
      for (let index = 0; index < state.registry.modules.length; index += 1) {
        const candidate = state.registry.modules[index];
        if (candidate?.moduleId === moduleId) {
          module = candidate;
          break;
        }
      }
      if (module === undefined) {
        return {
          ok: false,
          failure: { code: "registry.module-not-found", moduleId },
        };
      }
      return {
        ok: true,
        gateway: constructGateway({
          module,
          registry: state.registry,
          commandBus,
          ...(state.runtimeAssembly === undefined
            ? {}
            : { runtimeAssembly: state.runtimeAssembly }),
        }) as KernelModuleGateway & IntegratedKernelModuleGateway,
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
    reflectApply(weakMapSet, GATEWAY_STATES, [this, state]);
    reflectApply(objectFreeze, Object, [this]);
  }

  summary(): KernelGatewayResult<RegistrySummary> {
    try {
      const state = gatewayState(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["registry:read"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return {
        status: "authorized",
        value: deepFreezeValue(structuredCloneValue(state.registry.summary)),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  read(): KernelGatewayResult<ReadResult<KernelReadState>>;
  read(): KernelGatewayResult<
    ReadResult<KernelReadState> | ReadResult<import("./integrated-contracts").IntegratedKernelReadState>
  > {
    try {
      const state = gatewayState(this);
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

  submit(input: unknown): KernelGatewayResult<CommandResult>;
  submit(
    input: unknown,
  ): KernelGatewayResult<CommandResult | KernelCommandResult> {
    try {
      const state = gatewayState(this);
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
        const contribution = findCommandContribution(
          state.registry.contributions,
          decoded.value.commandId,
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
      } else if (state.runtimeAssembly !== undefined) {
        const captured = captureStrictInput(input);
        const envelope = captured.status === "captured"
          ? readExactDataRecord(captured.value, [
              "commandVersion",
              "commandId",
              "target",
              "payload",
            ])
          : undefined;
        const moduleCommand = envelope?.commandVersion === 1 &&
          typeof envelope.commandId === "string"
          ? state.runtimeAssembly.catalogState.commandIndex[envelope.commandId]
          : undefined;
        if (moduleCommand !== undefined) {
          if (moduleCommand.descriptor.source.moduleId !== state.module.moduleId) {
            return gatewayRejected({
              code: "registry.contribution-not-found",
              contributionId: envelope?.commandId as string,
            });
          }
          const contributionDenied = requireCapabilities(
            state.module,
            moduleCommand.descriptor.requiredCapabilities,
          );
          if (contributionDenied !== undefined) {
            return gatewayRejected(contributionDenied);
          }
        }
      }
      return { status: "authorized", value: state.commandBus.submit(input) };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  undo(): KernelGatewayResult<CommandResult>;
  undo(): KernelGatewayResult<CommandResult | KernelCommandResult> {
    try {
      const state = gatewayState(this);
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

  redo(): KernelGatewayResult<CommandResult>;
  redo(): KernelGatewayResult<CommandResult | KernelCommandResult> {
    try {
      const state = gatewayState(this);
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
      const state = gatewayState(this);
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
      const state = gatewayState(this);
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
      const contribution = findSelectorContribution(
        state.registry.contributions,
        request.selectorId,
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

function gatewayState(
  gateway: KernelModuleGateway,
): KernelModuleGatewayState | undefined {
  return reflectApply(weakMapGet, GATEWAY_STATES, [gateway]) as
    | KernelModuleGatewayState
    | undefined;
}

function findCommandContribution(
  contributions: readonly CoreCompiledContribution[],
  id: string,
): CompiledCommandContribution | undefined {
  for (let index = 0; index < contributions.length; index += 1) {
    const candidate = contributions[index];
    if (
      candidate !== undefined &&
      isCommandContribution(candidate) &&
      candidate.descriptor.id === id
    ) {
      return candidate;
    }
  }
  return undefined;
}

function findSelectorContribution(
  contributions: readonly CoreCompiledContribution[],
  id: string,
): CompiledSelectorContribution | undefined {
  for (let index = 0; index < contributions.length; index += 1) {
    const candidate = contributions[index];
    if (
      candidate !== undefined &&
      isSelectorContribution(candidate) &&
      candidate.descriptor.id === id
    ) {
      return candidate;
    }
  }
  return undefined;
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
  for (let index = 0; index < required.length; index += 1) {
    const capability = required[index];
    if (
      capability !== undefined &&
      reflectApply(arrayIncludes, module.capabilities, [capability]) !== true
    ) {
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
  return reflectConstruct(KernelRegistry, [
    REGISTRY_CONSTRUCTION_TOKEN,
    { registry: state },
  ]) as KernelRegistry;
}

export function constructIntegratedKernelRegistry(
  state: RegistryAssemblyState,
  runtimeAssembly: KernelIntegratedRuntimeAssemblyState,
): KernelRegistry {
  return reflectConstruct(KernelRegistry, [
    REGISTRY_CONSTRUCTION_TOKEN,
    { registry: state, runtimeAssembly },
  ]) as KernelRegistry;
}

function constructGateway(
  state: KernelModuleGatewayState,
): KernelModuleGateway {
  return reflectConstruct(KernelModuleGateway, [
    GATEWAY_CONSTRUCTION_TOKEN,
    state,
  ]) as KernelModuleGateway;
}
