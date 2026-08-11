import type { CommandRuntimeState } from "../commands/runtime";
import type {
  DocumentSnapshot,
  KernelReadState,
  ReadResult,
} from "./contracts";
import type { ReadSessionState } from "./session-state";
import { contentStateIdentity } from "./session-state";

const structuredCloneValue = structuredClone;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const objectFreeze = Object.freeze;
const weakSetConstructor = WeakSet;
const weakSetHas = WeakSet.prototype.has;
const weakSetAdd = WeakSet.prototype.add;

function freezeSnapshotData<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  const pending: unknown[] = [value];
  const objects: object[] = [];
  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    pending.length -= 1;
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) continue;
    reflectApply(weakSetAdd, seen, [current]);
    objects[objects.length] = current;
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending[pending.length] = descriptor.value;
      }
    }
  }
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const current = objects[index];
    if (current !== undefined) reflectApply(objectFreeze, Object, [current]);
  }
  return value;
}

export interface ReadTransition {
  readonly state: ReadSessionState;
  readonly result: ReadResult<KernelReadState>;
}

function createSnapshot(state: CommandRuntimeState): DocumentSnapshot {
  const document = freezeSnapshotData(structuredCloneValue(state.document));
  return freezeSnapshotData({
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
    const value = freezeSnapshotData({
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
