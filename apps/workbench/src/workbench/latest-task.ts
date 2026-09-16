/** Cancels stale work when a newer render or projection task supersedes it. */
export class LatestWorkbenchTask {
  #controller: AbortController | null = null;

  start(): AbortSignal {
    this.#controller?.abort();
    this.#controller = new AbortController();
    return this.#controller.signal;
  }

  finish(signal: AbortSignal): void {
    if (this.#controller?.signal === signal) this.#controller = null;
  }

  cancel(): void {
    this.#controller?.abort();
    this.#controller = null;
  }
}
