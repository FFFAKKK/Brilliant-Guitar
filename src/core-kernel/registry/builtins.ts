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

const CORE_SELECTOR_DEFINITIONS = [
  [
    "core.selector.score-metadata",
    "snapshot",
    "core.selector.score-metadata.title",
  ],
  [
    "core.selector.score-entity",
    "snapshot",
    "core.selector.score-entity.title",
  ],
  [
    "core.selector.score-entity-ownership",
    "snapshot",
    "core.selector.score-entity-ownership.title",
  ],
  [
    "core.selector.score-range",
    "snapshot",
    "core.selector.score-range.title",
  ],
  [
    "core.selector.history-state",
    "read-state",
    "core.selector.history-state.title",
  ],
  [
    "core.selector.dirty-state",
    "read-state",
    "core.selector.dirty-state.title",
  ],
] as const satisfies readonly (readonly [
  CoreSelectorId,
  "snapshot" | "read-state",
  string,
])[];

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

export interface CompiledCommandContribution {
  readonly descriptor: CommandContributionDescriptor;
  readonly commandDefinition: CoreCommandDefinition;
}

export type CompiledSelectorHandler = (
  input: DocumentSnapshot | KernelReadState,
  request: CoreSelectorRequest,
) => CoreSelectorResult;

export interface CompiledSelectorContribution {
  readonly descriptor: SelectorContributionDescriptor;
  readonly selector: CompiledSelectorHandler;
}

export type CoreCompiledContribution =
  | CompiledCommandContribution
  | CompiledSelectorContribution;

export interface CoreCompiledRegistrationEntry {
  readonly registrationEntryId: CoreModuleRegistrationEntryId;
  readonly ownerModuleId: string;
  readonly kind: "command" | "selector";
  readonly contributions: readonly CoreCompiledContribution[];
}

function asSnapshot(
  input: DocumentSnapshot | KernelReadState,
): DocumentSnapshot {
  return "snapshot" in input ? input.snapshot : input;
}

const CORE_SELECTOR_HANDLERS: Readonly<
  Record<CoreSelectorId, CompiledSelectorHandler>
> = {
  "core.selector.score-metadata": (input) =>
    selectScoreMetadata(asSnapshot(input)),
  "core.selector.score-entity": (input, request) =>
    selectScoreEntity(
      asSnapshot(input),
      request.selectorId === "core.selector.score-entity"
        ? request.address
        : undefined,
    ),
  "core.selector.score-entity-ownership": (input, request) =>
    selectScoreEntityOwnership(
      asSnapshot(input),
      request.selectorId === "core.selector.score-entity-ownership"
        ? request.address
        : undefined,
    ),
  "core.selector.score-range": (input, request) =>
    selectScoreRange(
      asSnapshot(input),
      request.selectorId === "core.selector.score-range"
        ? request.range
        : undefined,
    ),
  "core.selector.history-state": (input) =>
    selectHistoryState(input as KernelReadState),
  "core.selector.dirty-state": (input) =>
    selectDirtyState(input as KernelReadState),
};

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
    CORE_SELECTOR_DEFINITIONS.map(([id, inputKind, titleKey]) => ({
      descriptor: {
        id,
        kind: "selector" as const,
        sourceModuleId: "core.selectors",
        apiVersion: 1 as const,
        requiredCapabilities: SELECTOR_REQUIRED_CAPABILITIES,
        titleKey,
        inputKind,
      },
      selector: CORE_SELECTOR_HANDLERS[id],
    })),
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
