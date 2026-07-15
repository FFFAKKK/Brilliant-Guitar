import type { ScoreDocument } from "../domain/score-document";
import { validateScoreFeatureProfile } from "../profiles/score-feature-profile";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type {
  CommandBusCreationFailure,
  CommandFailure,
  CommandResult,
  CoreCommandEnvelope,
} from "./contracts";
import { decodeCoreCommand } from "./strict-codec";
import {
  applyCoreMutation,
  prepareCommandMutation,
  type CoreMutation,
} from "./mutations";

export interface HistoryEntry {
  readonly sequence: number;
  readonly command: CoreCommandEnvelope;
  readonly forward: CoreMutation;
  readonly inverse: CoreMutation;
}

export interface CommandRuntimeState {
  readonly document: ScoreDocument;
  readonly documentVersion: number;
  readonly nextHistorySequence: number;
  readonly undoStack: readonly HistoryEntry[];
  readonly redoStack: readonly HistoryEntry[];
}

export type CreateCommandRuntimeResult =
  | { readonly ok: true; readonly state: CommandRuntimeState }
  | { readonly ok: false; readonly failure: CommandBusCreationFailure };

export interface CommandRuntimeHooks {
  readonly beforePrepare?: () => void;
  readonly beforeApply?: () => void;
}

export interface CommandTransition {
  readonly state: CommandRuntimeState;
  readonly result: CommandResult;
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

function committed(
  state: CommandRuntimeState,
  document: ScoreDocument,
  undoStack: readonly HistoryEntry[],
  redoStack: readonly HistoryEntry[],
): CommandTransition {
  const nextState: CommandRuntimeState = {
    ...state,
    document,
    documentVersion: state.documentVersion + 1,
    undoStack,
    redoStack,
  };
  return {
    state: nextState,
    result: {
      status: "committed",
      documentVersion: nextState.documentVersion,
      support: validateScoreFeatureProfile(document),
      ...depths(nextState),
    },
  };
}

export function createCommandRuntime(
  initialDocument: ScoreDocument,
): CreateCommandRuntimeResult {
  try {
    const document = cloneValue(initialDocument);
    const semantic = validateScoreDocumentSemantics(document);
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
  const decoded = decodeCoreCommand(input);
  if (!decoded.ok) {
    return rejected(state, decoded.failure);
  }
  try {
    hooks.beforePrepare?.();
    const prepared = prepareCommandMutation(state.document, decoded.value);
    if (!prepared.ok) {
      return rejected(state, prepared.failure);
    }
    if (!prepared.changed) {
      return {
        state,
        result: {
          status: "no-op",
          documentVersion: state.documentVersion,
          support: validateScoreFeatureProfile(state.document),
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
    const applied = applyCoreMutation(state.document, prepared.forward);
    if (!applied.ok) {
      return rejected(state, { code: "command.internal-error" });
    }
    const semantic = validateScoreDocumentSemantics(applied.document);
    if (!semantic.ok) {
      return rejected(state, {
        code: "command.semantic-invalid",
        diagnostics: cloneValue(semantic.diagnostics),
      });
    }

    const entry: HistoryEntry = {
      sequence: state.nextHistorySequence,
      command: cloneValue(decoded.value),
      forward: cloneValue(prepared.forward),
      inverse: cloneValue(prepared.inverse),
    };
    const transition = committed(
      {
        ...state,
        nextHistorySequence: state.nextHistorySequence + 1,
      },
      applied.document,
      [...state.undoStack, entry],
      [],
    );
    return transition;
  } catch {
    return rejected(state, { code: "command.internal-error" });
  }
}

function entryIsValid(entry: HistoryEntry | undefined): entry is HistoryEntry {
  return entry !== undefined && validHistorySequence(entry.sequence);
}

export function undoCommand(state: CommandRuntimeState): CommandTransition {
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
  const applied = applyCoreMutation(state.document, entry.inverse);
  if (!applied.ok || !validateScoreDocumentSemantics(applied.document).ok) {
    return rejected(state, { code: "history.invariant-violation" });
  }
  return committed(
    state,
    applied.document,
    state.undoStack.slice(0, -1),
    [...state.redoStack, entry],
  );
}

export function redoCommand(state: CommandRuntimeState): CommandTransition {
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
  const applied = applyCoreMutation(state.document, entry.forward);
  if (!applied.ok || !validateScoreDocumentSemantics(applied.document).ok) {
    return rejected(state, { code: "history.invariant-violation" });
  }
  return committed(
    state,
    applied.document,
    [...state.undoStack, entry],
    state.redoStack.slice(0, -1),
  );
}
