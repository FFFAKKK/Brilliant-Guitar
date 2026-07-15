import type { CommandRuntimeState } from "../commands/runtime";
import type {
  DocumentSnapshot,
  KernelReadState,
  ReadResult,
} from "./contracts";
import { deepFreezeValue } from "./deep-freeze";
import type { ReadSessionState } from "./session-state";
import { contentStateIdentity } from "./session-state";

export interface ReadTransition {
  readonly state: ReadSessionState;
  readonly result: ReadResult<KernelReadState>;
}

function createSnapshot(state: CommandRuntimeState): DocumentSnapshot {
  const document = deepFreezeValue(structuredClone(state.document));
  return deepFreezeValue({
    documentId: document.id,
    schemaVersion: document.schemaVersion,
    documentVersion: state.documentVersion,
    document,
  });
}

function cacheMatches(
  snapshot: DocumentSnapshot | undefined,
  state: CommandRuntimeState,
): snapshot is DocumentSnapshot {
  return (
    snapshot !== undefined &&
    snapshot.documentId === state.document.id &&
    snapshot.schemaVersion === state.document.schemaVersion &&
    snapshot.documentVersion === state.documentVersion
  );
}

export function readKernelState(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
): ReadTransition {
  try {
    const cacheHit = cacheMatches(readState.snapshotCache, commandState);
    const snapshot = cacheHit
      ? readState.snapshotCache
      : createSnapshot(commandState);
    const nextReadState = cacheHit
      ? readState
      : { ...readState, snapshotCache: snapshot };
    const value = deepFreezeValue({
      snapshot,
      history: {
        undoDepth: commandState.undoStack.length,
        redoDepth: commandState.redoStack.length,
      },
      dirty:
        contentStateIdentity(commandState) !== readState.cleanStateIdentity,
    });
    return { state: nextReadState, result: { ok: true, value } };
  } catch {
    return {
      state: readState,
      result: {
        ok: false,
        failure: { code: "read.invariant-violation" },
      },
    };
  }
}
