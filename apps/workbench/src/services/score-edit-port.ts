import type { ScoreEditRequest } from "../contracts/note-input.ts";
import { isScoreSessionRead } from "../contracts/score-session.ts";
import type { ScoreSessionRead } from "../contracts/score-session.ts";

interface ScoreEditHost {
  edit(workspaceId: string, input: ScoreEditRequest): Promise<unknown>;
}

/** Minimal typed edit surface shared by UI controllers and first-party UI plugins. */
export interface ScoreEditPort {
  edit(input: ScoreEditRequest): Promise<ScoreSessionRead>;
}

/** Binds one workspace to the existing typed host edit command. */
export class ScoreEditClient implements ScoreEditPort {
  readonly #host: ScoreEditHost;
  readonly #workspaceId: string;

  constructor(host: ScoreEditHost, workspaceId: string) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }

  async edit(input: ScoreEditRequest): Promise<ScoreSessionRead> {
    const value = await this.#host.edit(this.#workspaceId, input);
    if (!isScoreSessionRead(value)) throw new Error("编辑结果无效");
    return value;
  }
}
