import type { DocumentSnapshot } from "./contracts";

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
