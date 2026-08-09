import type { ScoreDocument } from "../domain/score-document";
import {
  validateScoreFeatureProfile,
  type ScoreSupportResult,
} from "../profiles/score-feature-profile";
import {
  validateScoreDocumentSemantics,
  type ValidationReport,
} from "../validation/validate-score-semantics";
import { CORE_COMMAND_ADAPTERS, type CoreCommandAdapter } from "./core-command-adapters";
import { CORE_COMMAND_DEFINITIONS, type CoreCommandId } from "./catalog";

export interface CoreExecutionSourceIdentity {
  readonly moduleId: "core.commands";
  readonly contributionId: "core.commands.v1";
}

export interface CoreExecutionAssembly {
  readonly source: CoreExecutionSourceIdentity;
  readonly definitions: readonly CoreCommandAdapter[];
  readonly validate: (document: ScoreDocument) => ValidationReport;
  readonly classify: (document: ScoreDocument) => ScoreSupportResult;
}

const DEFAULT_SOURCE: CoreExecutionSourceIdentity = Object.freeze({
  moduleId: "core.commands",
  contributionId: "core.commands.v1",
});

const VNEXT_BOUNDED_COMMAND_IDS: ReadonlySet<CoreCommandId> = new Set([
  "core.measure.insert",
  "core.measure.remove",
  "core.measure.move",
  "core.measure.set-definition",
  "core.part.insert",
  "core.part.remove",
  "core.part.move",
  "core.part.set-name",
  "core.part.set-instrument",
  "core.staff.insert",
  "core.staff.remove",
  "core.staff.move",
  "core.staff.set-definition",
  "core.voice.insert",
  "core.voice.remove",
  "core.voice.move",
  "core.voice.set-default-staff",
  "core.voice.set-sequence-start",
  "core.event.set-staff-assignment",
]);

function expectedInputBoundary(
  commandId: CoreCommandId,
): CoreCommandAdapter["inputBoundary"] {
  return VNEXT_BOUNDED_COMMAND_IDS.has(commandId)
    ? "vnext-bounded-v1"
    : "legacy-v1";
}

function definitionFor(
  definitions: readonly CoreCommandAdapter[],
  commandId: CoreCommandId,
): CoreCommandAdapter | undefined {
  return definitions.find((definition) => definition.commandId === commandId);
}

export function createCoreExecutionAssembly(
  definitions: readonly CoreCommandAdapter[],
): CoreExecutionAssembly {
  if (definitions.length !== CORE_COMMAND_DEFINITIONS.length) {
    throw new TypeError("Core execution assembly must contain every Core V1 command");
  }

  const seen = new Set<string>();
  for (const catalogDefinition of CORE_COMMAND_DEFINITIONS) {
    const definition = definitionFor(definitions, catalogDefinition.commandId);
    if (
      definition === undefined ||
      definition.targetKind !== catalogDefinition.targetKind ||
      definition.inputBoundary !== expectedInputBoundary(catalogDefinition.commandId) ||
      seen.has(definition.commandId)
    ) {
      throw new TypeError("Core execution assembly command definition mismatch");
    }
    seen.add(definition.commandId);
  }
  for (const definition of definitions) {
    if (!seen.has(definition.commandId)) {
      throw new TypeError("Core execution assembly contains an unknown command");
    }
  }

  const frozenDefinitions = Object.freeze(
    definitions.map((definition) => Object.freeze({ ...definition })),
  );

  return Object.freeze({
    source: DEFAULT_SOURCE,
    definitions: frozenDefinitions,
    validate: validateScoreDocumentSemantics,
    classify: validateScoreFeatureProfile,
  });
}

export const DEFAULT_CORE_EXECUTION_ASSEMBLY = createCoreExecutionAssembly(
  CORE_COMMAND_ADAPTERS,
);

export function findCoreExecutionDefinition(
  assembly: CoreExecutionAssembly,
  commandId: string,
): CoreCommandAdapter | undefined {
  return assembly.definitions.find(
    (definition) => definition.commandId === commandId,
  );
}
