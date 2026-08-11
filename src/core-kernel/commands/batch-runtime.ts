import type { ScoreAddress } from "../domain/address";
import type { ScoreDocument } from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  BatchCommand,
  CommandFailure,
  CommandFailureLeaf,
} from "./contracts";
import type { CoreExecutionAssembly } from "./execution-assembly";
import { findCoreExecutionDefinition } from "./execution-assembly";
import {
  applyCoreEffectSetToCandidate,
  cloneCoreEffectCandidate,
  freezeCoreEffectSet,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
} from "./effects";
import { decodeCoreCommand } from "./strict-codec";

export const BATCH_CHILD_LIMIT = 100 as const;
export const BATCH_EFFECT_LIMIT = 131_072 as const;
export const BATCH_AFFECTED_LIMIT = 131_072 as const;

export interface CoreBatchHooks {
  readonly beforePrepare?: () => void;
  readonly beforeApply?: () => void;
}

export type BatchChildSource =
  | { readonly kind: "core" }
  | {
      readonly kind: "module";
      readonly moduleId: string;
      readonly contributionId: string;
    };

export interface EffectiveBatchSegment {
  readonly childIndex: number;
  readonly source: BatchChildSource;
  readonly forward: NonEmptyCoreEffectSet;
  readonly inverse: NonEmptyCoreEffectSet;
  readonly affected: readonly ScoreAddress[];
}

export type PrepareCoreBatchResult =
  | {
      readonly ok: true;
      readonly changed: false;
      readonly document: ScoreDocument;
    }
  | {
      readonly ok: true;
      readonly changed: true;
      readonly document: ScoreDocument;
      readonly forward: NonEmptyCoreEffectSet;
      readonly inverse: NonEmptyCoreEffectSet;
      readonly affected: readonly ScoreAddress[];
      readonly segments: readonly EffectiveBatchSegment[];
    }
  | { readonly ok: false; readonly failure: CommandFailure };

const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const objectCreate = Object.create;

function innerFailure(failure: CommandFailure): CommandFailureLeaf {
  return failure.code === "command.batch-child-rejected"
    ? { code: "command.internal-error" }
    : failure;
}

function childRejected(
  failedCommandIndex: number,
  failure: CommandFailure,
): PrepareCoreBatchResult {
  return {
    ok: false,
    failure: deepFreezeValue({
      code: "command.batch-child-rejected",
      failedCommandIndex,
      failure: innerFailure(failure),
    }),
  };
}

function nestedBatch(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const descriptor = reflectGetOwnPropertyDescriptor(value, "commandId");
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
    descriptor.value === "core.transaction.batch"
  );
}

function addressKey(address: ScoreAddress): string {
  switch (address.kind) {
    case "document":
      return `document:${address.documentId}`;
    case "measure":
      return `measure:${address.measureId}`;
    case "part":
      return `part:${address.partId}`;
    case "staff":
      return `staff:${address.staffId}`;
    case "voice":
      return `voice:${address.voiceId}`;
    case "event":
      return `event:${address.eventId}`;
    case "note":
      return `note:${address.noteId}`;
  }
}

export type BatchResourceFailure = Extract<
  CommandFailureLeaf,
  { readonly code: "command.resource-limit-exceeded" }
>;

export function checkBatchEffectBudget(
  currentEffectCount: number,
  segmentEffectCount: number,
):
  | { readonly ok: true; readonly effectCount: number }
  | { readonly ok: false; readonly failure: BatchResourceFailure } {
  const effectCount = currentEffectCount + segmentEffectCount;
  return effectCount <= BATCH_EFFECT_LIMIT
    ? { ok: true, effectCount }
    : {
        ok: false,
        failure: {
          code: "command.resource-limit-exceeded",
          limitKind: "effects",
          limit: BATCH_EFFECT_LIMIT,
          actual: effectCount,
        },
      };
}

export function appendBatchAffectedWithinBudget(
  aggregate: ScoreAddress[],
  seen: Record<string, true>,
  segment: readonly ScoreAddress[],
):
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: BatchResourceFailure } {
  const pendingSeen = objectCreate(null) as Record<string, true>;
  const pending: ScoreAddress[] = [];
  for (let index = 0; index < segment.length; index += 1) {
    const address = segment[index];
    if (address === undefined) {
      continue;
    }
    const key = addressKey(address);
    if (seen[key] !== true && pendingSeen[key] !== true) {
      pendingSeen[key] = true;
      pending[pending.length] = address;
    }
  }
  const affectedCount = aggregate.length + pending.length;
  if (affectedCount > BATCH_AFFECTED_LIMIT) {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "affected-addresses",
        limit: BATCH_AFFECTED_LIMIT,
        actual: affectedCount,
      },
    };
  }
  for (let index = 0; index < pending.length; index += 1) {
    const address = pending[index];
    if (address !== undefined) {
      seen[addressKey(address)] = true;
      aggregate[aggregate.length] = address;
    }
  }
  return { ok: true };
}

function asNonEmpty(
  effects: readonly CoreEffect[],
): NonEmptyCoreEffectSet | undefined {
  const first = effects[0];
  return first === undefined ? undefined : [first, ...effects.slice(1)];
}

export function prepareCoreBatch(
  document: ScoreDocument,
  command: BatchCommand,
  assembly: CoreExecutionAssembly,
  hooks: CoreBatchHooks = {},
): PrepareCoreBatchResult {
  try {
    if (command.target.documentId !== document.id) {
      return { ok: false, failure: { code: "command.target-not-found" } };
    }
    const candidate = cloneCoreEffectCandidate(document);
    const forward: CoreEffect[] = [];
    let inverse: CoreEffect[] = [];
    const affected: ScoreAddress[] = [];
    const seenAffected = objectCreate(null) as Record<string, true>;
    const segments: EffectiveBatchSegment[] = [];

    for (let childIndex = 0; childIndex < command.payload.commands.length; childIndex += 1) {
      const rawChild = command.payload.commands[childIndex];
      if (nestedBatch(rawChild)) {
        return childRejected(childIndex, { code: "command.batch-nested" });
      }
      const decoded = decodeCoreCommand(rawChild, assembly);
      if (!decoded.ok) {
        return childRejected(childIndex, decoded.failure);
      }
      const definition = findCoreExecutionDefinition(
        assembly,
        decoded.value.commandId,
      );
      if (definition === undefined) {
        return childRejected(childIndex, { code: "command.internal-error" });
      }
      hooks.beforePrepare?.();
      const prepared = definition.prepare(candidate, decoded.value);
      if (!prepared.ok) {
        return childRejected(childIndex, prepared.failure);
      }
      if (!prepared.changed) {
        continue;
      }

      const effectBudget = checkBatchEffectBudget(
        forward.length,
        prepared.effects.length,
      );
      if (!effectBudget.ok) {
        return childRejected(childIndex, effectBudget.failure);
      }
      hooks.beforeApply?.();
      const applied = applyCoreEffectSetToCandidate(candidate, prepared.effects);
      if (!applied.ok) {
        return childRejected(childIndex, applied.failure);
      }
      for (const effect of prepared.effects) {
        forward.push(effect);
      }
      inverse = [...applied.inverse, ...inverse];

      const affectedBudget = appendBatchAffectedWithinBudget(
        affected,
        seenAffected,
        prepared.affected,
      );
      if (!affectedBudget.ok) {
        return childRejected(childIndex, affectedBudget.failure);
      }
      segments[segments.length] = deepFreezeValue({
        childIndex,
        source: { kind: "core" },
        forward: prepared.effects,
        inverse: applied.inverse,
        affected: prepared.affected,
      });
    }

    const nonEmptyForward = asNonEmpty(forward);
    const nonEmptyInverse = asNonEmpty(inverse);
    if (nonEmptyForward === undefined || nonEmptyInverse === undefined) {
      return { ok: true, changed: false, document: candidate };
    }
    return {
      ok: true,
      changed: true,
      document: candidate,
      forward: freezeCoreEffectSet(nonEmptyForward),
      inverse: freezeCoreEffectSet(nonEmptyInverse),
      affected: deepFreezeValue(affected),
      segments: deepFreezeValue(segments),
    };
  } catch {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
}
