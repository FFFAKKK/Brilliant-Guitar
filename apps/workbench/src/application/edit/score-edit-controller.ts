export interface ScoreEditControllerState {
  readonly pending: number;
  readonly running: boolean;
  readonly blocked: boolean;
}

export type ScoreEditResolution = "committed" | "discard-current" | "discard-all" | "retryable" | "halt";

interface QueuedEdit<Item> {
  readonly sequence: number;
  readonly item: Item;
}

/** Serializes document edits independently of React and notation-specific input grammar. */
export class ScoreEditController<Item> {
  readonly #items: QueuedEdit<Item>[] = [];
  readonly #onState: ((state: ScoreEditControllerState) => void) | undefined;
  #sequence = 0;
  #running = false;
  #blocked = false;

  constructor(onState?: (state: ScoreEditControllerState) => void) {
    this.#onState = onState;
  }

  get state(): ScoreEditControllerState {
    return { pending: this.#items.length, running: this.#running, blocked: this.#blocked };
  }

  get pending(): number { return this.#items.length; }
  get blocked(): boolean { return this.#blocked; }
  current(): Item | undefined { return this.#items[0]?.item; }

  enqueue(item: Item): boolean {
    if (this.#blocked) return false;
    this.#sequence += 1;
    this.#items.push({ sequence: this.#sequence, item });
    this.#notify();
    return true;
  }

  recover(): boolean {
    if (!this.#blocked || !this.#items.length) return false;
    this.#blocked = false;
    this.#notify();
    return true;
  }

  reset(): readonly Item[] {
    const discarded = this.#items.splice(0).map((entry) => entry.item);
    this.#blocked = false;
    this.#notify();
    return discarded;
  }

  async drain(execute: (item: Item) => Promise<ScoreEditResolution>): Promise<void> {
    if (this.#running || this.#blocked) return;
    this.#running = true;
    this.#notify();
    try {
      while (this.#items.length && !this.#blocked) {
        const active = this.#items[0]!;
        const resolution = await execute(active.item);
        // A document reset may replace the queue while an async edit is still
        // settling. Never apply the old result to the new first item.
        if (this.#items[0]?.sequence !== active.sequence) continue;
        if (resolution === "halt") break;
        if (resolution === "retryable") {
          this.#blocked = true;
          this.#notify();
          break;
        }
        if (resolution === "discard-all") {
          this.#items.splice(0);
          this.#notify();
          break;
        }
        this.#items.shift();
        this.#notify();
      }
    } finally {
      this.#running = false;
      this.#notify();
    }
  }

  #notify(): void {
    this.#onState?.(this.state);
  }
}
