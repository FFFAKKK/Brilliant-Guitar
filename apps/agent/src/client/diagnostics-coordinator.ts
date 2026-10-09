import { decodeRunDiagnostics, type AgentRunDiagnosticsV1 } from "../contracts/run-diagnostics.ts";

export interface DiagnosticsIdentity {
  readonly connectionEpoch: number; readonly sessionId: string; readonly runId: string | null;
  readonly selectedProfileId: string; readonly configurationKey: string; readonly enabled: boolean;
  readonly hostSequence: number; readonly running: boolean;
}
export type DiagnosticsState = { readonly key: string; readonly phase: "closed" | "loading" | "ready" | "error"; readonly data: AgentRunDiagnosticsV1 | null };
export const diagnosticsKey = (identity: DiagnosticsIdentity) => JSON.stringify([identity.connectionEpoch, identity.sessionId, identity.runId,
  identity.selectedProfileId, identity.configurationKey, identity.enabled]);
interface CoordinatorOptions {
  request(signal: AbortSignal): Promise<unknown>; publish(state: DiagnosticsState): void;
  now?: () => number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
}

/** Local read coordination only; it never submits a message or changes Session state. */
export class DiagnosticsCoordinator {
  #identity: DiagnosticsIdentity | null = null;
  #generation = 0;
  #active: AbortController | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pending = false;
  #lastStarted = -Infinity;
  #host: { connectionEpoch: number; id: string; sequence: number; configurationEpoch: number } | null = null;
  #disposed = false;
  readonly options: CoordinatorOptions;
  constructor(options: CoordinatorOptions) { this.options = options; }

  update(identity: DiagnosticsIdentity | null): void {
    if (this.#disposed) return;
    const previous = this.#identity;
    this.#identity = identity;
    const changed = !previous || !identity || diagnosticsKey(previous) !== diagnosticsKey(identity);
    if (changed) {
      ++this.#generation; this.#active?.abort(); this.#clearTimer();
      this.#pending = identity !== null;
      this.options.publish({ key: identity ? diagnosticsKey(identity) : "", phase: identity ? "loading" : "closed", data: null });
    } else if (identity && (identity.hostSequence !== previous.hostSequence || identity.running !== previous.running)) {
      this.#pending = true;
      // Configuration can change its credential while public target/presence stays equal.
      if (!identity.running) this.options.publish({ key: diagnosticsKey(identity), phase: "loading", data: null });
    }
    this.#schedule();
  }
  refresh(): void { if (!this.#disposed && this.#identity) { this.#pending = true; this.#schedule(); } }
  dispose(): void { this.#disposed = true; ++this.#generation; this.#identity = null; this.#pending = false; this.#active?.abort(); this.#clearTimer(); }
  #clearTimer(): void { if (this.#timer !== null) (this.options.clearTimer ?? clearTimeout)(this.#timer); this.#timer = null; }
  #schedule(): void {
    if (this.#disposed || !this.#identity || this.#active || this.#timer !== null) return;
    if (!this.#pending && !this.#identity.running) return;
    const wait = this.#identity.running ? Math.max(0, 1000 - ((this.options.now ?? Date.now)() - this.#lastStarted)) : 0;
    if (wait > 0 || !this.#pending) {
      this.#timer = (this.options.setTimer ?? setTimeout)(() => { this.#timer = null; this.#pending = true; this.#start(); }, Math.max(wait, this.#pending ? 0 : 1000));
    } else this.#start();
  }
  #start(): void {
    const identity = this.#identity;
    if (this.#disposed || !identity || this.#active) return;
    const generation = this.#generation;
    const controller = new AbortController(); this.#active = controller; this.#pending = false;
    this.#lastStarted = (this.options.now ?? Date.now)();
    void (async () => {
      try {
        const data = decodeRunDiagnostics(await this.options.request(controller.signal));
        if (!this.#current(generation, controller)) return;
        const latest = this.#identity!;
        if (data.sessionId !== latest.sessionId || data.runId !== latest.runId || data.selectedProfileId !== latest.selectedProfileId) throw new Error("diagnostics identity mismatch");
        if (data.hostSequence < latest.hostSequence) { this.#pending = true; return; }
        const host = this.#host;
        if (host?.connectionEpoch === latest.connectionEpoch && (data.hostInstanceId !== host.id || data.hostSequence < host.sequence || data.configurationEpoch < host.configurationEpoch)) throw new Error("diagnostics host mismatch");
        this.#host = { connectionEpoch: latest.connectionEpoch, id: data.hostInstanceId, sequence: data.hostSequence, configurationEpoch: data.configurationEpoch };
        this.options.publish({ key: diagnosticsKey(latest), phase: "ready", data });
      } catch {
        if (this.#current(generation, controller)) {
          if (identity.hostSequence < this.#identity!.hostSequence) this.#pending = true;
          else this.options.publish({ key: diagnosticsKey(this.#identity!), phase: "error", data: null });
        }
      } finally {
        if (this.#active === controller) this.#active = null;
        this.#schedule();
      }
    })();
  }
  #current(generation: number, controller: AbortController): boolean {
    return !this.#disposed && this.#identity !== null && generation === this.#generation && !controller.signal.aborted;
  }
}
