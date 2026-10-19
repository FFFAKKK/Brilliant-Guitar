/** Notifications observe an already accepted state; they cannot veto its mutation.
 * Snapshot subscribers so a subscription acquired during dispatch waits for the next notification.
 * Never await observers, but consume rejected returns from accidentally async callbacks.
 */
export function notifyObservers(listeners: Iterable<() => unknown>): void {
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result !== undefined) void Promise.resolve(result).catch(() => {});
    } catch { /* A broken observer cannot block another observer or change an operation's result. */ }
  }
}
