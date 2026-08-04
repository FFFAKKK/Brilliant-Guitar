import type { ScoreAddress } from "../domain/address";
import type { ScoreDocument } from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CommandBusCreationFailure,
  CommandFailure,
  CommandResult,
  CoreCommandEnvelope,
} from "./contracts";
import {
  DEFAULT_CORE_EXECUTION_ASSEMBLY,
  findCoreExecutionDefinition,
  type CoreExecutionAssembly,
} from "./execution-assembly";
import {
  applyCoreEffectSet,
  freezeCoreEffectSet,
  type NonEmptyCoreEffectSet,
} from "./effects";
import { decodeCoreCommand } from "./strict-codec";

export interface HistoryEntry {
  readonly sequence: number;
  readonly command: CoreCommandEnvelope;
  readonly forward: NonEmptyCoreEffectSet;
  readonly inverse: NonEmptyCoreEffectSet;
  readonly affected: readonly ScoreAddress[];
}

export interface CommandRuntimeState {
  readonly assembly: CoreExecutionAssembly;
  readonly document: ScoreDocument;
  readonly documentVersion: number;
  readonly nextHistorySequence: number;
  readonly undoStack: readonly HistoryEntry[];
  readonly redoStack: readonly HistoryEntry[];
}

export interface CommittedOperation {
  readonly cause: "submit" | "undo" | "redo";
  readonly command: CoreCommandEnvelope;
  readonly affected: readonly ScoreAddress[];
}

export type CreateCommandRuntimeResult =
  | { readonly ok: true; readonly state: CommandRuntimeState }
  | { readonly ok: false; readonly failure: CommandBusCreationFailure };

export interface CommandRuntimeHooks {
  readonly beforePrepare?: () => void;
  readonly beforeApply?: () => void;
  readonly classify?: CoreExecutionAssembly["classify"];
}

export interface CommandTransition {
  readonly state: CommandRuntimeState;
  readonly result: CommandResult;
  readonly committed?: CommittedOperation;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function depths(state: CommandRuntimeState): {
  readonly undoDepth: number;
  readonly redoDepth: number;
} {
  return {
    undoDepth: state.undoStack.length,
    redoDepth: state.redoStack.length,
  };
}

function rejected(
  state: CommandRuntimeState,
  failure: CommandFailure,
): CommandTransition {
  return {
    state,
    result: {
      status: "rejected",
      documentVersion: state.documentVersion,
      failure,
      ...depths(state),
    },
  };
}

function canIncrementVersion(state: CommandRuntimeState): boolean {
  return (
    Number.isSafeInteger(state.documentVersion) &&
    state.documentVersion >= 0 &&
    state.documentVersion < Number.MAX_SAFE_INTEGER
  );
}

function validHistorySequence(sequence: number): boolean {
  return Number.isSafeInteger(sequence) && sequence > 0;
}

function historyEntry(
  sequence: number,
  command: CoreCommandEnvelope,
  forward: NonEmptyCoreEffectSet,
  inverse: NonEmptyCoreEffectSet,
  affected: readonly ScoreAddress[],
): HistoryEntry {
  return deepFreezeValue({
    sequence,
    command: cloneValue(command),
    forward: freezeCoreEffectSet(forward),
    inverse: freezeCoreEffectSet(inverse),
    affected: affected.map(cloneValue),
  });
}

function committed(
  state: CommandRuntimeState,
  document: ScoreDocument,
  undoStack: readonly HistoryEntry[],
  redoStack: readonly HistoryEntry[],
  hooks: CommandRuntimeHooks,
  operation: CommittedOperation,
): CommandTransition {
  const nextState: CommandRuntimeState = {
    ...state,
    document,
    documentVersion: state.documentVersion + 1,
    undoStack,
    redoStack,
  };
  const support = (hooks.classify ?? state.assembly.classify)(document);
  return {
    state: nextState,
    result: {
      status: "committed",
      documentVersion: nextState.documentVersion,
      support,
      ...depths(nextState),
    },
    committed: deepFreezeValue({
      cause: operation.cause,
      command: cloneValue(operation.command),
      affected: operation.affected.map(cloneValue),
    }),
  };
}

export function createCommandRuntime(
  initialDocument: ScoreDocument,
  assembly: CoreExecutionAssembly = DEFAULT_CORE_EXECUTION_ASSEMBLY,
): CreateCommandRuntimeResult {
  try {
    const document = cloneValue(initialDocument);
    const semantic = assembly.validate(document);
    if (!semantic.ok) {
      return {
        ok: false,
        failure: {
          code: "command.invalid-initial-document",
          diagnostics: cloneValue(semantic.diagnostics),
        },
      };
    }
    return {
      ok: true,
      state: {
        assembly,
        document,
        documentVersion: 0,
        nextHistorySequence: 1,
        undoStack: [],
        redoStack: [],
      },
    };
  } catch {
    return {
      ok: false,
      failure: { code: "command.invalid-initial-document" },
    };
  }
}

export function submitCommand(
  state: CommandRuntimeState,
  input: unknown,
  hooks: CommandRuntimeHooks = {},
): CommandTransition {
  const decoded = decodeCoreCommand(input, state.assembly);
  if (!decoded.ok) {
    return rejected(state, decoded.failure);
  }
  try {
    const definition = findCoreExecutionDefinition(
      state.assembly,
      decoded.value.commandId,
    );
    if (definition === undefined) {
      return rejected(state, { code: "command.internal-error" });
    }
    hooks.beforePrepare?.();
    const prepared = definition.prepare(state.document, decoded.value);
    if (!prepared.ok) {
      return rejected(state, prepared.failure);
    }
    if (!prepared.changed) {
      return {
        state,
        result: {
          status: "no-op",
          documentVersion: state.documentVersion,
          support: (hooks.classify ?? state.assembly.classify)(state.document),
          ...depths(state),
        },
      };
    }
    if (!canIncrementVersion(state)) {
      return rejected(state, { code: "command.version-overflow" });
    }
    if (!validHistorySequence(state.nextHistorySequence)) {
      return rejected(state, { code: "history.invariant-violation" });
    }

    hooks.beforeApply?.();
    const applied = applyCoreEffectSet(state.document, prepared.effects);
    if (!applied.ok) {
      return rejected(state, { code: "command.internal-error" });
    }
    const semantic = state.assembly.validate(applied.document);
    if (!semantic.ok) {
      return rejected(state, {
        code: "command.semantic-invalid",
        diagnostics: cloneValue(semantic.diagnostics),
      });
    }

    const entry = historyEntry(
      state.nextHistorySequence,
      decoded.value,
      prepared.effects,
      applied.inverse,
      prepared.affected,
    );
    return committed(
      {
        ...state,
        nextHistorySequence: state.nextHistorySequence + 1,
      },
      applied.document,
      [...state.undoStack, entry],
      [],
      hooks,
      {
        cause: "submit",
        command: decoded.value,
        affected: prepared.affected,
      },
    );
  } catch {
    return rejected(state, { code: "command.internal-error" });
  }
}

function entryIsValid(entry: HistoryEntry | undefined): entry is HistoryEntry {
  return (
    entry !== undefined &&
    validHistorySequence(entry.sequence) &&
    Array.isArray(entry.forward) &&
    entry.forward.length > 0 &&
    Array.isArray(entry.inverse) &&
    entry.inverse.length > 0 &&
    Array.isArray(entry.affected) &&
    entry.affected.length > 0
  );
}

export function undoCommand(
  state: CommandRuntimeState,
  hooks: CommandRuntimeHooks = {},
): CommandTransition {
  try {
    const entry = state.undoStack[state.undoStack.length - 1];
    if (entry === undefined) {
      return rejected(state, { code: "history.empty-undo" });
    }
    if (!entryIsValid(entry)) {
      return rejected(state, { code: "history.invariant-violation" });
    }
    if (!canIncrementVersion(state)) {
      return rejected(state, { code: "command.version-overflow" });
    }
    const applied = applyCoreEffectSet(state.document, entry.inverse);
    if (!applied.ok || !state.assembly.validate(applied.document).ok) {
      return rejected(state, { code: "history.invariant-violation" });
    }
    return committed(
      state,
      applied.document,
      state.undoStack.slice(0, -1),
      [...state.redoStack, entry],
      hooks,
      {
        cause: "undo",
        command: entry.command,
        affected: entry.affected,
      },
    );
  } catch {
    return rejected(state, { code: "history.invariant-violation" });
  }
}

export function redoCommand(
  state: CommandRuntimeState,
  hooks: CommandRuntimeHooks = {},
): CommandTransition {
  try {
    const entry = state.redoStack[state.redoStack.length - 1];
    if (entry === undefined) {
      return rejected(state, { code: "history.empty-redo" });
    }
    if (!entryIsValid(entry)) {
      return rejected(state, { code: "history.invariant-violation" });
    }
    if (!canIncrementVersion(state)) {
      return rejected(state, { code: "command.version-overflow" });
    }
    const applied = applyCoreEffectSet(state.document, entry.forward);
    if (!applied.ok || !state.assembly.validate(applied.document).ok) {
      return rejected(state, { code: "history.invariant-violation" });
    }
    return committed(
      state,
      applied.document,
      [...state.undoStack, entry],
      state.redoStack.slice(0, -1),
      hooks,
      {
        cause: "redo",
        command: entry.command,
        affected: entry.affected,
      },
    );
  } catch {
    return rejected(state, { code: "history.invariant-violation" });
  }
}
