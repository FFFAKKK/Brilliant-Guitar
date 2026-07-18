import {
  CORE_COMMAND_DEFINITIONS,
  type CoreCommandId,
} from "../commands/catalog";
import type { DocumentSnapshot, KernelReadState } from "../read/contracts";
import { deepFreezeValue } from "../read/deep-freeze";
import {
  selectDirtyState,
  selectHistoryState,
  selectScoreEntity,
  selectScoreEntityOwnership,
  selectScoreMetadata,
  selectScoreRange,
} from "../read/selectors";
import type {
  CoreModuleRegistrationEntryId,
  CoreSelectorId,
  CoreSelectorRequest,
  CoreSelectorResult,
  KernelStartupModuleManifest,
  RegistryContributionSummary,
} from "./contracts";

const COMMAND_TITLE_KEYS: Readonly<Record<CoreCommandId, string>> = {
  "core.document.set-metadata": "core.command.set-metadata.title",
  "core.note.set-written-pitch": "core.command.set-written-pitch.title",
  "core.event.set-note-value": "core.command.set-note-value.title",
  "core.voice.insert-notes-event": "core.command.insert-notes-event.title",
  "core.voice.insert-rest-event": "core.command.insert-rest-event.title",
  "core.event.remove": "core.command.remove-event.title",
};

const COMMAND_REQUIRED_CAPABILITIES = deepFreezeValue([
  "command:execute",
] as const);
const SELECTOR_REQUIRED_CAPABILITIES = deepFreezeValue([
  "score:read",
  "selector:execute",
] as const);

type CoreCommandDefinition = (typeof CORE_COMMAND_DEFINITIONS)[number];
type CommandContributionDescriptor = Extract<
  RegistryContributionSummary,
  { readonly kind: "command" }
>;
type SelectorContributionDescriptor = Extract<
  RegistryContributionSummary,
  { readonly kind: "selector" }
>;
type SnapshotSelectorDescriptor = SelectorContributionDescriptor & {
  readonly inputKind: "snapshot";
};
type ReadStateSelectorDescriptor = SelectorContributionDescriptor & {
  readonly inputKind: "read-state";
};

export interface CompiledCommandContribution {
  readonly descriptor: CommandContributionDescriptor;
  readonly commandDefinition: CoreCommandDefinition;
}

export type CompiledSnapshotSelectorHandler = (
  input: DocumentSnapshot,
  request: CoreSelectorRequest,
) => CoreSelectorResult;

export type CompiledReadStateSelectorHandler = (
  input: KernelReadState,
  request: CoreSelectorRequest,
) => CoreSelectorResult;

export interface CompiledSnapshotSelectorContribution {
  readonly descriptor: SnapshotSelectorDescriptor;
  readonly inputKind: "snapshot";
  readonly selector: CompiledSnapshotSelectorHandler;
}

export interface CompiledReadStateSelectorContribution {
  readonly descriptor: ReadStateSelectorDescriptor;
  readonly inputKind: "read-state";
  readonly selector: CompiledReadStateSelectorHandler;
}

export type CompiledSelectorContribution =
  | CompiledSnapshotSelectorContribution
  | CompiledReadStateSelectorContribution;

export type CoreCompiledContribution =
  | CompiledCommandContribution
  | CompiledSelectorContribution;

export type CoreCompiledRegistrationEntry =
  | {
      readonly registrationEntryId: CoreModuleRegistrationEntryId;
      readonly ownerModuleId: string;
      readonly kind: "command";
      readonly contributions: readonly CompiledCommandContribution[];
    }
  | {
      readonly registrationEntryId: CoreModuleRegistrationEntryId;
      readonly ownerModuleId: string;
      readonly kind: "selector";
      readonly contributions: readonly CompiledSelectorContribution[];
    };

function snapshotSelector(
  id: CoreSelectorId,
  titleKey: string,
  selector: CompiledSnapshotSelectorHandler,
): CompiledSnapshotSelectorContribution {
  return {
    descriptor: {
      id,
      kind: "selector",
      sourceModuleId: "core.selectors",
      apiVersion: 1,
      requiredCapabilities: SELECTOR_REQUIRED_CAPABILITIES,
      titleKey,
      inputKind: "snapshot",
    },
    inputKind: "snapshot",
    selector,
  };
}

function readStateSelector(
  id: CoreSelectorId,
  titleKey: string,
  selector: CompiledReadStateSelectorHandler,
): CompiledReadStateSelectorContribution {
  return {
    descriptor: {
      id,
      kind: "selector",
      sourceModuleId: "core.selectors",
      apiVersion: 1,
      requiredCapabilities: SELECTOR_REQUIRED_CAPABILITIES,
      titleKey,
      inputKind: "read-state",
    },
    inputKind: "read-state",
    selector,
  };
}

const CORE_COMMAND_CONTRIBUTIONS: readonly CompiledCommandContribution[] =
  deepFreezeValue(
    CORE_COMMAND_DEFINITIONS.map((commandDefinition) => ({
      descriptor: {
        id: commandDefinition.commandId,
        kind: "command" as const,
        sourceModuleId: "core.commands",
        apiVersion: 1 as const,
        requiredCapabilities: COMMAND_REQUIRED_CAPABILITIES,
        titleKey: COMMAND_TITLE_KEYS[commandDefinition.commandId],
        targetKind: commandDefinition.targetKind,
      },
      commandDefinition,
    })),
  );

const CORE_SELECTOR_CONTRIBUTIONS: readonly CompiledSelectorContribution[] =
  deepFreezeValue(
    [
      snapshotSelector(
        "core.selector.score-metadata",
        "core.selector.score-metadata.title",
        (input) => selectScoreMetadata(input),
      ),
      snapshotSelector(
        "core.selector.score-entity",
        "core.selector.score-entity.title",
        (input, request) =>
          selectScoreEntity(
            input,
            request.selectorId === "core.selector.score-entity"
              ? request.address
              : undefined,
          ),
      ),
      snapshotSelector(
        "core.selector.score-entity-ownership",
        "core.selector.score-entity-ownership.title",
        (input, request) =>
          selectScoreEntityOwnership(
            input,
            request.selectorId === "core.selector.score-entity-ownership"
              ? request.address
              : undefined,
          ),
      ),
      snapshotSelector(
        "core.selector.score-range",
        "core.selector.score-range.title",
        (input, request) =>
          selectScoreRange(
            input,
            request.selectorId === "core.selector.score-range"
              ? request.range
              : undefined,
          ),
      ),
      readStateSelector(
        "core.selector.history-state",
        "core.selector.history-state.title",
        (input) => selectHistoryState(input),
      ),
      readStateSelector(
        "core.selector.dirty-state",
        "core.selector.dirty-state.title",
        (input) => selectDirtyState(input),
      ),
    ],
  );

export const CORE_COMPILED_REGISTRATION_ENTRIES: readonly CoreCompiledRegistrationEntry[] =
  deepFreezeValue([
    {
      registrationEntryId: "core.commands.v1",
      ownerModuleId: "core.commands",
      kind: "command",
      contributions: CORE_COMMAND_CONTRIBUTIONS,
    },
    {
      registrationEntryId: "core.selectors.v1",
      ownerModuleId: "core.selectors",
      kind: "selector",
      contributions: CORE_SELECTOR_CONTRIBUTIONS,
    },
  ] as const);

export const CORE_KERNEL_STARTUP_MANIFEST: KernelStartupModuleManifest =
  deepFreezeValue({
    startupManifestVersion: 1,
    modules: [
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
    ],
  });
