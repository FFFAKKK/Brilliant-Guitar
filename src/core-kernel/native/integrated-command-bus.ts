import { captureStrictInput } from "../codec/strict-input-capture";
import { decodeScoreDocument } from "../codec/decode-score-document";
import type { IntegratedKernelEvent } from "../events/contracts";
import type { KernelReadState, MarkPersistedResult, DocumentSnapshot } from "../read/contracts";
import { resolveKernelIntegratedRuntimeAssembly } from "../registry/domain-availability";
import type { IntegratedCommandBus, IntegratedCommandBusCreationResult, KernelCommandResult, KernelIntegratedCatalog, IntegratedKernelReadState } from "../registry/integrated-contracts";
import type { ScoreDocument } from "../domain/score-document";
import { captureHostInstalledContributionsV1 } from "./integrated-catalog-capture";
import { createNativeContributionExecutorV2 } from "./integrated-executor";
import { encodeIntegratedValueV2 as encode } from "./integrated-wire";
import { bindNativeIntegratedAssemblyV2, selectNativeIntegratedFactoryV2 } from "./integrated-backend-selection";

export interface IntegratedNativeAddonV2 {
  createIntegratedKernelSessionV2(bytes: Buffer, executor: (bytes: Buffer) => Buffer): (bytes: Buffer) => Buffer;
}
type Failure = Extract<KernelCommandResult, { status: "rejected" }>["failure"];
interface WireResult {
  ok: boolean;
  failure?: Failure;
  documentVersion?: number;
  history?: KernelReadState["history"];
  state?: KernelReadState;
  availability?: { ok: true; value: Pick<IntegratedKernelReadState, "writeAvailability" | "validationAvailability"> };
  pipeline?: { assessment: Extract<KernelCommandResult, { status: "committed" | "no-op" }>["assessment"] };
  result?: { status: "committed" | "no-op" | "command-rejected"; failure?: Failure;
    value: { documentVersion: number; history: KernelReadState["history"]; dirty: boolean }; events: readonly IntegratedKernelEvent[] };
  checkpoint?: { status: "updated" | "no-op" | "checkpoint-rejected"; value: { documentVersion: number; dirty: boolean };
    failure?: Extract<MarkPersistedResult, { status: "rejected" }>["failure"]; events: readonly IntegratedKernelEvent[] };
}
const parse = JSON.parse;
const apply = Reflect.apply;
const freezeObject = Object.freeze;
const objectKeys = Object.keys;
const bufferToString = Buffer.prototype.toString;
const promiseResolve = Promise.resolve;
const promiseCatch = Promise.prototype.catch;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of objectKeys(value)) freeze((value as Record<string, unknown>)[key]);
    freezeObject(value);
  }
  return value;
}

/** Opt-in embedding only. No public SDK exports or default backend are changed. */
export function installNativeIntegratedBackendV2(addon: IntegratedNativeAddonV2): () => void {
  return selectNativeIntegratedFactoryV2((document, catalog, inventory, explicit) =>
    createNativeIntegratedCommandBusV2(addon, document, catalog, inventory, explicit));
}

export function createNativeIntegratedCommandBusV2(addon: IntegratedNativeAddonV2, document: ScoreDocument,
  catalog: KernelIntegratedCatalog, inventory: unknown = undefined, explicit = false): IntegratedCommandBusCreationResult {
  const captured = captureStrictInput(document);
  const decoded = captured.status === "captured" ? decodeScoreDocument(captured.value) : undefined;
  if (decoded === undefined || !decoded.ok) return freeze({ ok: false, failure: { code: "command.invalid-initial-document" } });
  const assembly = explicit ? resolveKernelIntegratedRuntimeAssembly(catalog, inventory) : resolveKernelIntegratedRuntimeAssembly(catalog);
  if (!assembly.ok) return freeze({ ok: false, failure: { code: assembly.reason === "inventory" ? "command.invalid-requirement-inventory" : "command.assembly-mismatch" } });
  const installed = assembly.state;
  const projection = captureHostInstalledContributionsV1(catalog);
  if (projection === undefined) return freeze({ ok: false, failure: { code: "command.assembly-mismatch" } });
  let operate: (bytes: Buffer) => Buffer;
  try {
    operate = addon.createIntegratedKernelSessionV2(encode({ apiVersion: 2, document: decoded.value,
      catalog: projection.projection,
      commands: assembly.state.catalogState.contributions.flatMap((entry) => entry.commands.map((command) => command.descriptor)),
      effects: assembly.state.catalogState.contributions.flatMap((entry) => entry.effects.map((effect) => effect.descriptor)),
      inventory: explicit ? inventory : null,
    }), createNativeContributionExecutorV2(assembly.state));
  } catch (error) {
    try { return freeze({ ok: false, failure: parse((error as Error).message) as Extract<IntegratedCommandBusCreationResult, { ok: false }>["failure"] }); }
    catch { return freeze({ ok: false, failure: { code: "command.assembly-mismatch" } }); }
  }
  let busy = false;
  let dispatching = false;
  const subscribers: Array<(event: IntegratedKernelEvent) => unknown> = [];
  function raw(request: unknown): WireResult { return parse(apply(bufferToString, operate(encode(request)), ["utf8"]) as string) as WireResult; }
  function current() { const read = raw({ operation: "read" }); if (!read.ok || read.state === undefined) throw new Error("Native integrated read failed"); return read.state; }
  function rejected(code: Failure["code"]): KernelCommandResult {
    const state = current();
    return freeze({ status: "rejected", documentVersion: state.snapshot.documentVersion, ...state.history, failure: { code } as Failure });
  }
  // Scalar observations support rejection during a callback without a reentrant native read.
  let observedVersion = 0;
  let observedHistory = { undoDepth: 0, redoDepth: 0 };
  let observedDirty = false;
  let cachedSnapshot: DocumentSnapshot | undefined;
  function requireReceiver(receiver: unknown): void {
    if (receiver !== bus) throw new TypeError("Invalid integrated command bus receiver");
  }
  function dispatch(events: readonly IntegratedKernelEvent[]): void {
    dispatching = true;
    const handlers = subscribers.slice();
    try {
      for (const nativeEvent of events) {
        const descriptor = nativeEvent.eventType === "core.document.committed"
          ? installed.catalogState.commandIndex[nativeEvent.commandId]?.descriptor : undefined;
        const event = freeze(nativeEvent.eventType === "core.document.committed" ? {
          ...nativeEvent, source: descriptor === undefined ? { kind: "core" as const }
            : { kind: "module" as const, ...descriptor.source },
        } : nativeEvent);
        for (const handler of handlers) {
          try {
            const returned: unknown = apply(handler, undefined, [event]);
            if (returned !== undefined) {
              const promise = apply(promiseResolve, Promise, [returned]) as Promise<unknown>;
              void apply(promiseCatch, promise, [() => undefined]);
            }
          } catch { /* Subscriber failures cannot undo a committed transaction. */ }
        }
      }
    } finally { dispatching = false; }
  }
  function command(request: unknown): KernelCommandResult {
    if (busy || dispatching) return freeze({ status: "rejected", documentVersion: observedVersion, ...observedHistory, failure: { code: "event.reentrant-write" } });
    busy = true;
    try {
      const capturedRequest = captureStrictInput(request);
      if (capturedRequest.status !== "captured") return rejected("command.invalid-envelope");
      const output = raw(capturedRequest.value);
      if (!output.ok) return freeze({ status: "rejected", documentVersion: output.documentVersion ?? observedVersion,
        ...(output.history ?? observedHistory), failure: output.failure ?? { code: "command.internal-error" } });
      const result = output.result;
      if (result === undefined) return rejected("command.internal-error");
      observedVersion = result.value.documentVersion;
      observedHistory = result.value.history;
      observedDirty = result.value.dirty;
      if (result.status === "command-rejected") return freeze({ status: "rejected", documentVersion: observedVersion,
        ...observedHistory, failure: result.failure ?? { code: "command.internal-error" } });
      if (output.pipeline === undefined) return rejected("command.internal-error");
      const answer = freeze({ status: result.status, documentVersion: observedVersion, ...observedHistory, assessment: output.pipeline.assessment });
      dispatch(result.events);
      return answer;
    } finally { busy = false; }
  }
  const bus: IntegratedCommandBus = freeze({
    submit(input: unknown) { requireReceiver(this); return command({ operation: "submit", command: input }); },
    undo() { requireReceiver(this); return command({ operation: "undo" }); },
    redo() { requireReceiver(this); return command({ operation: "redo" }); },
    read() {
      requireReceiver(this);
      const result = raw({ operation: "read" });
      if (result.ok && result.state !== undefined && cachedSnapshot?.documentVersion !== result.state.snapshot.documentVersion) {
        cachedSnapshot = freeze(result.state.snapshot);
      }
      return result.ok && result.state !== undefined && result.availability !== undefined
        ? freeze({ ok: true as const, value: { ...result.state, snapshot: cachedSnapshot!,
          writeAvailability: result.availability.value.writeAvailability,
          validationAvailability: result.availability.value.validationAvailability } })
        : freeze({ ok: false as const, failure: { code: "read.invariant-violation" as const } });
    },
    markPersisted(input: unknown) {
      requireReceiver(this);
      if (busy || dispatching) return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: observedDirty, failure: { code: "event.reentrant-write" as const } });
      const state = current();
      const capturedCheckpoint = captureStrictInput(input);
      if (capturedCheckpoint.status !== "captured") return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: state.dirty, failure: { code: "checkpoint.invalid" as const } });
      const result = raw({ operation: "markPersisted", checkpoint: capturedCheckpoint.value }).checkpoint;
      if (result === undefined) return freeze({ status: "rejected" as const, documentVersion: observedVersion, dirty: state.dirty, failure: { code: "checkpoint.invalid" as const } });
      if (result.status === "checkpoint-rejected") return freeze({ status: "rejected" as const, ...result.value, failure: result.failure! });
      observedDirty = result.value.dirty;
      dispatch(result.events);
      return freeze({ status: result.status, ...result.value });
    },
    subscribe(handler: unknown) {
      requireReceiver(this);
      if (typeof handler !== "function") return freeze({ status: "rejected" as const, failure: { code: "event.invalid-handler" as const } });
      const fn = handler as (event: IntegratedKernelEvent) => unknown;
      subscribers.push(fn);
      let active = true;
      return freeze({ status: "subscribed" as const, unsubscribe: () => { if (active) { active = false; const index = subscribers.indexOf(fn); if (index !== -1) subscribers.splice(index, 1); } } });
    },
  });
  bindNativeIntegratedAssemblyV2(bus, assembly.state);
  return freeze({ ok: true, value: bus });
}
