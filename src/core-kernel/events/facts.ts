import type { CommittedOperation } from "../commands/runtime";
import type { ScoreAddress } from "../domain/address";

/**
 * Command preparation fixes affected-address order before candidate adoption.
 * Event publication only detaches those canonical facts; it does not inspect a
 * Core command union or recompute facts from document mutations.
 */
export function deriveAffectedEntities(
  operation: CommittedOperation,
): readonly ScoreAddress[] {
  return operation.affected.map((address) => structuredClone(address));
}
