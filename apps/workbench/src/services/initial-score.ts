import type { NewScoreInput } from "../contracts/new-score.ts";
import type { ScoreSessionRead } from "../contracts/score-session.ts";
import { WorkbenchRequestError } from "./workbench-client.ts";

interface InitialScoreClient {
  read(): Promise<ScoreSessionRead | null>;
  create(input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<ScoreSessionRead>;
}

/** Reuse the host session; only a fresh workspace receives an unsaved one-bar score. */
export async function readOrCreateInitialScore(client: InitialScoreClient, requestId: string): Promise<ScoreSessionRead> {
  const current = await client.read();
  if (current) return current;
  try { return await client.create({ title: "", measureCount: 1 }, requestId, null); }
  catch (error) {
    if (error instanceof WorkbenchRequestError && error.status === 409) {
      const existing = await client.read();
      if (existing) return existing;
    }
    throw error;
  }
}
