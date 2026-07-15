import type { CommittedOperation } from "../commands/runtime";
import type { ScoreDocument } from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type { KernelEvent } from "./contracts";
import { deriveAffectedEntities } from "./facts";

export type EventCandidateResult =
  | {
      readonly ok: true;
      readonly lastEventSequence: number;
      readonly events: readonly KernelEvent[];
    }
  | { readonly ok: false; readonly reason: "overflow" | "invariant" };

function reserveSequences(
  lastEventSequence: number,
  count: number,
):
  | { readonly ok: true; readonly upperBound: number }
  | { readonly ok: false; readonly reason: "overflow" | "invariant" } {
  if (
    !Number.isSafeInteger(lastEventSequence) ||
    lastEventSequence < 0 ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    return { ok: false, reason: "invariant" };
  }
  const upperBound = lastEventSequence + count;
  return Number.isSafeInteger(upperBound)
    ? { ok: true, upperBound }
    : { ok: false, reason: "overflow" };
}

export function buildCommittedEvents(input: {
  readonly lastEventSequence: number;
  readonly operation: CommittedOperation;
  readonly previousDocument: ScoreDocument;
  readonly committedDocument: ScoreDocument;
  readonly documentVersion: number;
  readonly dirtyBefore: boolean;
  readonly dirtyAfter: boolean;
}): EventCandidateResult {
  try {
    const dirtyChanged = input.dirtyBefore !== input.dirtyAfter;
    const reserved = reserveSequences(
      input.lastEventSequence,
      dirtyChanged ? 2 : 1,
    );
    if (!reserved.ok) {
      return reserved;
    }
    const events: KernelEvent[] = [
      {
        eventVersion: 1,
        eventSequence: input.lastEventSequence + 1,
        eventType: "core.document.committed",
        documentId: input.committedDocument.id,
        documentVersion: input.documentVersion,
        cause: input.operation.cause,
        commandId: input.operation.command.commandId,
        affectedEntities: deriveAffectedEntities(
          input.operation,
          input.previousDocument,
          input.committedDocument,
        ),
      },
    ];
    if (dirtyChanged) {
      events.push({
        eventVersion: 1,
        eventSequence: input.lastEventSequence + 2,
        eventType: "core.session.dirty-state-changed",
        documentId: input.committedDocument.id,
        documentVersion: input.documentVersion,
        cause: input.operation.cause,
        dirty: input.dirtyAfter,
      });
    }
    return {
      ok: true,
      lastEventSequence: reserved.upperBound,
      events: deepFreezeValue(events),
    };
  } catch {
    return { ok: false, reason: "invariant" };
  }
}

export function buildCheckpointEvents(input: {
  readonly lastEventSequence: number;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly dirtyBefore: boolean;
  readonly dirtyAfter: boolean;
}): EventCandidateResult {
  try {
    if (input.dirtyBefore === input.dirtyAfter) {
      const reserved = reserveSequences(input.lastEventSequence, 0);
      return reserved.ok
        ? {
            ok: true,
            lastEventSequence: input.lastEventSequence,
            events: deepFreezeValue([] as KernelEvent[]),
          }
        : reserved;
    }
    const reserved = reserveSequences(input.lastEventSequence, 1);
    if (!reserved.ok) {
      return reserved;
    }
    return {
      ok: true,
      lastEventSequence: reserved.upperBound,
      events: deepFreezeValue([
        {
          eventVersion: 1,
          eventSequence: input.lastEventSequence + 1,
          eventType: "core.session.dirty-state-changed",
          documentId: input.documentId,
          documentVersion: input.documentVersion,
          cause: "mark-persisted",
          dirty: input.dirtyAfter,
        },
      ] as KernelEvent[]),
    };
  } catch {
    return { ok: false, reason: "invariant" };
  }
}
