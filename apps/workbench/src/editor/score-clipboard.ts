import { decodeScoreClipboardFragment, encodeScoreClipboardFragment } from "../contracts/score-clipboard.ts";
import type { ScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";

export interface TextClipboardPort {
  readText(): Promise<string>;
  writeText(value: string): Promise<void>;
}

function browserClipboard(): TextClipboardPort | null {
  return typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null;
}

/** Keeps score editing usable when browser clipboard permission or context is unavailable. */
export class ScoreClipboard {
  readonly #port: TextClipboardPort | null;
  #memory: ScoreClipboardFragmentV1 | null = null;

  constructor(port: TextClipboardPort | null = browserClipboard()) {
    this.#port = port;
  }

  async write(fragment: ScoreClipboardFragmentV1): Promise<void> {
    this.#memory = structuredClone(fragment);
    if (!this.#port) return;
    try {
      await this.#port.writeText(encodeScoreClipboardFragment(fragment));
    } catch {
      // Session memory is the intentional fallback for denied Clipboard API access.
    }
  }

  async read(): Promise<ScoreClipboardFragmentV1 | null> {
    if (this.#port) {
      try {
        const fragment = decodeScoreClipboardFragment(await this.#port.readText());
        if (fragment) {
          this.#memory = fragment;
          return structuredClone(fragment);
        }
      } catch {
        // Fall through to the current Workbench session clipboard.
      }
    }
    return this.#memory ? structuredClone(this.#memory) : null;
  }
}
