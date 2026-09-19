import { useEffect, useState } from "react";

export interface DisposableResource {
  dispose(): void;
}

export class DeferredDisposalCoordinator {
  readonly #pending = new Map<DisposableResource, ReturnType<typeof setTimeout>>();

  retain(resource: DisposableResource): void {
    const pending = this.#pending.get(resource);
    if (pending === undefined) return;
    clearTimeout(pending);
    this.#pending.delete(resource);
  }

  release(resource: DisposableResource): void {
    const timer = setTimeout(() => {
      if (this.#pending.get(resource) !== timer) return;
      this.#pending.delete(resource);
      resource.dispose();
    }, 0);
    this.#pending.set(resource, timer);
  }
}

/**
 * Defers irreversible disposal by one task so React StrictMode can replay an
 * Effect without destroying an application-scoped resource between setups.
 */
export function useDisposableResource(resource: DisposableResource): void {
  const [coordinator] = useState(() => new DeferredDisposalCoordinator());
  useEffect(() => {
    coordinator.retain(resource);
    return () => coordinator.release(resource);
  }, [coordinator, resource]);
}
