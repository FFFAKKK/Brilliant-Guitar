import type { ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export interface Rkp2StoreFixture {
  readonly fixtureId: "minimal-score-v1";
  readonly document: ScoreDocument;
}

export function createMinimalRkp2StoreFixture(): Rkp2StoreFixture {
  return {
    fixtureId: "minimal-score-v1",
    document: createCoreScoreFixture(),
  };
}

export function createRkp2StoreFixtureCatalog(): readonly Rkp2StoreFixture[] {
  return [createMinimalRkp2StoreFixture()];
}
