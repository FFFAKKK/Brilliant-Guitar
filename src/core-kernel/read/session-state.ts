import type { CommandRuntimeState } from "../commands/runtime";
import { decodePersistedCheckpoint } from "./address-codec";
import type { DocumentSnapshot } from "./contracts";
import type { MarkPersistedResult } from "./contracts";

export interface ReadSessionState {
  readonly cleanStateIdentity: number;
  readonly stateIdentityByDocumentVersion: ReadonlyMap<number, number>;
  readonly snapshotCache?: DocumentSnapshot;
}

export function createReadSessionState(): ReadSessionState {
  return {
    cleanStateIdentity: 0,
    stateIdentityByDocumentVersion: new Map([[0, 0]]),
  };
}

export function contentStateIdentity(state: CommandRuntimeState): number {
  return state.undoStack[state.undoStack.length - 1]?.sequence ?? 0;
}

export type RecordCommittedVersionResult =
  | { readonly ok: true; readonly state: ReadSessionState }
  | { readonly ok: false };

export function recordCommittedVersion(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
): RecordCommittedVersionResult {
  try {
    const identity = contentStateIdentity(commandState);
    if (
      !Number.isSafeInteger(commandState.documentVersion) ||
      commandState.documentVersion < 0 ||
      !Number.isSafeInteger(identity) ||
      identity < 0
    ) {
      return { ok: false };
    }
    const stateIdentityByDocumentVersion = new Map(
      readState.stateIdentityByDocumentVersion,
    );
    stateIdentityByDocumentVersion.set(commandState.documentVersion, identity);
    return {
      ok: true,
      state: {
        ...readState,
        stateIdentityByDocumentVersion,
      },
    };
  } catch {
    return { ok: false };
  }
}

export interface MarkPersistedTransition {
  readonly state: ReadSessionState;
  readonly result: MarkPersistedResult;
}

function currentDirty(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
): boolean {
  return contentStateIdentity(commandState) !== readState.cleanStateIdentity;
}

function rejectedCheckpoint(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
  code:
    | "checkpoint.invalid"
    | "checkpoint.document-mismatch"
    | "checkpoint.version-unavailable"
    | "checkpoint.invariant-violation",
): MarkPersistedTransition {
  return {
    state: readState,
    result: {
      status: "rejected",
      documentVersion: commandState.documentVersion,
      dirty: currentDirty(commandState, readState),
      failure: { code },
    },
  };
}

export function markPersistedCheckpoint(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
  input: unknown,
): MarkPersistedTransition {
  try {
    const decoded = decodePersistedCheckpoint(input);
    if (!decoded.ok) {
      return rejectedCheckpoint(
        commandState,
        readState,
        "checkpoint.invalid",
      );
    }
    if (decoded.value.documentId !== commandState.document.id) {
      return rejectedCheckpoint(
        commandState,
        readState,
        "checkpoint.document-mismatch",
      );
    }
    const cleanStateIdentity = readState.stateIdentityByDocumentVersion.get(
      decoded.value.documentVersion,
    );
    if (cleanStateIdentity === undefined) {
      return rejectedCheckpoint(
        commandState,
        readState,
        "checkpoint.version-unavailable",
      );
    }
    if (
      !Number.isSafeInteger(cleanStateIdentity) ||
      cleanStateIdentity < 0 ||
      !Number.isSafeInteger(readState.cleanStateIdentity) ||
      readState.cleanStateIdentity < 0
    ) {
      return rejectedCheckpoint(
        commandState,
        readState,
        "checkpoint.invariant-violation",
      );
    }
    if (cleanStateIdentity === readState.cleanStateIdentity) {
      return {
        state: readState,
        result: {
          status: "no-op",
          documentVersion: commandState.documentVersion,
          dirty: currentDirty(commandState, readState),
        },
      };
    }
    const state = { ...readState, cleanStateIdentity };
    return {
      state,
      result: {
        status: "updated",
        documentVersion: commandState.documentVersion,
        dirty: currentDirty(commandState, state),
      },
    };
  } catch {
    try {
      return rejectedCheckpoint(
        commandState,
        readState,
        "checkpoint.invariant-violation",
      );
    } catch {
      return {
        state: readState,
        result: {
          status: "rejected",
          documentVersion: 0,
          dirty: true,
          failure: { code: "checkpoint.invariant-violation" },
        },
      };
    }
  }
}
