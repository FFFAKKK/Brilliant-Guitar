import { createScoreClipboardFragment, decodeScoreClipboardFragment, encodeScoreClipboardFragment,
  isScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";
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
  #disposed = false;
  #scope: "system" | "session" = "session";
  #operation = 0;

  constructor(port: TextClipboardPort | null = browserClipboard()) {
    this.#port = port;
  }

  async write(fragment: ScoreClipboardFragmentV1): Promise<void> {
    if (this.#disposed) throw new Error("Score clipboard disposed");
    if (!isScoreClipboardFragmentV1(fragment)) throw new TypeError("Invalid score clipboard fragment");
    const operation = ++this.#operation;
    const captured = createScoreClipboardFragment(fragment.events);
    this.#memory = captured; this.#scope = "session";
    if (!this.#port) return;
    try {
      await this.#port.writeText(encodeScoreClipboardFragment(captured));
      if (!this.#disposed && operation === this.#operation) this.#scope = "system";
    } catch {
      // Session memory is the intentional fallback for denied Clipboard API access.
    }
  }

  async read(): Promise<ScoreClipboardFragmentV1 | null> {
    if (this.#disposed) throw new Error("Score clipboard disposed");
    const operation = ++this.#operation;
    if (this.#port) {
      try {
        const fragment = decodeScoreClipboardFragment(await this.#port.readText());
        if (this.#disposed || operation !== this.#operation) return null;
        if (fragment) {
          this.#memory = fragment; this.#scope = "system";
          return structuredClone(fragment);
        }
      } catch {
        // Fall through to the current Workbench session clipboard.
      }
    }
    if (this.#disposed || operation !== this.#operation) return null;
    this.#scope = "session";
    return this.#memory ? structuredClone(this.#memory) : null;
  }

  get scope(): "system" | "session" { return this.#scope; }
  dispose(): void { this.#disposed = true; this.#operation++; this.#memory = null; }
}
