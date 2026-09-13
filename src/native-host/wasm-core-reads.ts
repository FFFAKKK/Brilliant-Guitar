// Explicit all-Wasm successor callback protocol over the existing bounded ABI.
// Host replay stays within one Rust candidate callback; no JS plugin fallback.
import { captureWasmExecutorsV1, type WasmNativeAddonV1 } from "./wasm-bindings";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../core-kernel/native/integrated-command-bus";
import { encodeIntegratedValueV2 as encode } from "../core-kernel/native/integrated-wire";
import { captureStrictInput } from "../core-kernel/codec/strict-input-capture";
import { readExactDataRecord } from "../core-kernel/registry/strict-codec";
import type { KernelIntegratedCatalog } from "../core-kernel/registry/integrated-contracts";
import type { ScopedExecutionPolicyV1, ScopedCallbackOperationV1 } from "../core-kernel/module-sdk/scoped-invocation";
import type { CompiledDomainCommandContributionV1 } from "../core-kernel/module-sdk/contracts";
import { contributionReads } from "../core-kernel/registry/contribution-reads";

type Callback = (input: Buffer) => Buffer;
interface ReadAddon extends WasmNativeAddonV1 {
  createIntegratedKernelSessionV2(input: Buffer, callback: Callback, version?: number): Callback;
  migrateKernelExtensionV2(input: Buffer, callback: Callback, version?: number): Buffer;
}
type Row = { query: unknown; reply: unknown };
type Call = { key: Buffer; reads: Row[]; result?: Buffer };
type State = {
  input: Buffer; id: string; version: number | null; calls: Call[]; cursor: number;
  pending?: { call?: Call; query: unknown };
  failed: boolean;
  scheduled?: Record<string, unknown>;
};
const QUERY = Buffer.from("BGCR2Q\0"), REPLY = Buffer.from("BGCR2R\0");
const PROBE = { readVersion: 2, selectorId: "core.selector.score-metadata" };
const parse = JSON.parse, apply = Reflect.apply, freeze = Object.freeze;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const decodeUtf8 = TextDecoder.prototype.decode;
const startsWith = (bytes: Buffer, prefix: Buffer) => bytes.subarray(0, prefix.length).equals(prefix);
const invalid = (): never => { throw new TypeError("wasm.core-read-contract"); };
function decode(bytes: Buffer): unknown {
  const result = captureStrictInput(parse(apply(decodeUtf8, utf8, [bytes]) as string));
  return result.status === "captured" ? result.value : invalid();
}
function reducedView(input: unknown, version: number | null): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return invalid();
  const { coreDocument: _core, ...view } = input as Record<string, unknown>;
  if (view.viewVersion !== 1 || _core === undefined) return invalid();
  return { ...view, viewVersion: 2, documentVersion: version };
}
function reducedArgs(operation: ScopedCallbackOperationV1, args: readonly unknown[], version: number | null): readonly unknown[] {
  if (["commandPrepare", "validate", "classify"].includes(operation)) return [reducedView(args[0], version), ...args.slice(1)];
  if (operation === "effectTransform") {
    const input = args[0] as Record<string, unknown>;
    return [{ ...input, view: reducedView(input.view, version) }];
  }
  return args;
}

export function installNativeWasmCoreReadsBackendV2(addon: ReadAddon, catalog: KernelIntegratedCatalog, bindings: unknown): () => void {
  return install(addon, catalog, bindings, false);
}

/** Runtime owns assessment scheduling; prepare/transform and migration retain V2. */
export function installNativeWasmScheduledAssessmentV3(addon: ReadAddon, catalog: KernelIntegratedCatalog, bindings: unknown): () => void {
  return install(addon, catalog, bindings, true);
}

function install(addon: ReadAddon, catalog: KernelIntegratedCatalog, bindings: unknown, scheduled: boolean): () => void {
  const executors = captureWasmExecutorsV1(addon, catalog, bindings, true);
  // Probe every captured artifact, including dormant contributions, before
  // selecting a backend. Byte integrity alone does not prove protocol support.
  for (const [source, execute] of executors) {
    const response = readExactDataRecord(decode(execute(encode({
      callbackVersion: 2, operation: "capabilities", moduleId: source.moduleId, contributionId: source.contributionId,
    }))), ["callbackVersion", "coreReadVersion"]);
    if (response?.callbackVersion !== 2 || response.coreReadVersion !== 2) return invalid();
  }
  let active: State | undefined;
  function invokeGuest(source: CompiledDomainCommandContributionV1, operation: ScopedCallbackOperationV1,
    definitionId: string | null, args: readonly unknown[], alreadyReduced = false): unknown {
    const state = active, execute = executors.get(source);
    if (state === undefined || execute === undefined || state.failed || state.pending !== undefined) return invalid();
    try {
      const request = { callbackVersion: 2, moduleId: source.moduleId, contributionId: source.contributionId,
        operation, definitionId, arguments: alreadyReduced ? args : reducedArgs(operation, args, state.version) };
      const key = encode(request), index = state.cursor++;
      let call = state.calls[index];
      if (call === undefined) {
        call = { key, reads: [] };
        state.calls.push(call);
      } else if (!call.key.equals(key)) return invalid();
      if (call.result !== undefined) return decode(call.result);
      const output = decode(execute(encode({ ...request, coreReads: call.reads })));
      const result = readExactDataRecord(output, ["callbackVersion", "status", "value"]);
      if (result?.callbackVersion === 2 && result.status === "complete") {
        call.result = encode(result.value);
        return decode(call.result);
      }
      const read = readExactDataRecord(output, ["callbackVersion", "status", "query"]);
      if (read?.callbackVersion !== 2 || read.status !== "read") return invalid();
      const queryBytes = encode(read.query);
      if (queryBytes.length > 4096 || call.reads.some(row => encode(row.query).equals(queryBytes))) return invalid();
      // All query shapes/selectors are admitted by Rust, not by guest metadata.
      state.pending = { call, query: read.query };
      throw new TypeError("wasm.core-read-pending");
    } catch (error) {
      if (state.pending === undefined) state.failed = true;
      throw error;
    }
  }
  const policy = freeze<ScopedExecutionPolicyV1>({ catalog,
    invoke: (source, operation, definitionId, args) => invokeGuest(source, operation, definitionId, args) });

  function exchange(callback: Callback) {
    let state: State | undefined;
    let negotiated = false;
    const close = () => { state = undefined; };
    const invoke: Callback = bytes => {
      if (!startsWith(bytes, REPLY)) {
        const input = decode(bytes) as Record<string, unknown>;
        const isScheduled = input.operation === "assessmentStart" || input.operation === "assessmentCallback";
        if ((isScheduled && !scheduled) || (scheduled && input.operation === "assess")) return invalid();
        const id = isScheduled ? input.documentId : (input.document as { id: string }).id;
        if (typeof id !== "string") return invalid();
        state = { input: Buffer.from(bytes), id, version: (input.documentVersion as number | undefined) ?? null,
          calls: [], cursor: 0, pending: { query: PROBE }, failed: false,
          ...(isScheduled ? { scheduled: input } : {}) };
        // Require a real exchange even when no compatible plugin is active.
        return Buffer.concat([QUERY, encode(PROBE)]);
      }
      if (state === undefined || state.pending === undefined || state.failed) return invalid();
      const reply = readExactDataRecord(decode(bytes.subarray(REPLY.length)), ["readVersion", "documentId", "documentVersion", "result"]);
      if (reply?.readVersion !== 2 || reply.documentId !== state.id || reply.documentVersion !== state.version) return invalid();
      const pending = state.pending;
      delete state.pending;
      if (pending.call !== undefined) pending.call.reads.push({ query: pending.query, reply });
      state.cursor = 0;
      const previous = active;
      active = state;
      try {
        let output: Buffer;
        try {
          const request = state.scheduled;
          if (request === undefined) output = callback(state.input);
          else if (request.operation === "assessmentStart") {
            if (readExactDataRecord(request, ["operation", "scheduleVersion", "documentId", "documentVersion"]) === undefined
              || request.scheduleVersion !== 3) return invalid();
            negotiated = true;
            output = encode({ ok: true, scheduleVersion: 3 });
          } else {
            if (!negotiated || readExactDataRecord(request, ["operation", "scheduleVersion", "documentId",
              "documentVersion", "moduleId", "contributionId", "callbackOperation", "view"]) === undefined
              || request.scheduleVersion !== 3
              || (request.callbackOperation !== "validate" && request.callbackOperation !== "classify")) return invalid();
            const source = [...executors.keys()].find(entry => entry.moduleId === request.moduleId
              && entry.contributionId === request.contributionId);
            const view = request.view as Record<string, unknown>;
            if (source === undefined || view.viewVersion !== 2 || view.coreDocument !== undefined
              || view.documentId !== state.id || view.documentVersion !== state.version) return invalid();
            // Derived catalogs preserve an explicit empty dependency list for
            // sources without grants. It grants no data and is not in Rust's roster.
            const declarations = contributionReads(source);
            const guestView = declarations?.length === 0 && view.dependencyReads === undefined
              ? { ...view, dependencyReads: [] } : view;
            output = encode({ ok: true, value: invokeGuest(source, request.callbackOperation, null, [guestView], true) });
          }
        } catch (error) {
          if (state.pending === undefined) throw error;
          output = Buffer.alloc(0);
        }
        if (state.failed) return invalid();
        const nextRead = (state as State).pending;
        if (nextRead !== undefined) return Buffer.concat([QUERY, encode(nextRead.query)]);
        if (state.cursor !== state.calls.length) return invalid();
        close();
        return output;
      } finally { active = previous; }
    };
    return { invoke, close, negotiated: () => negotiated };
  }
  const transport: IntegratedNativeAddonV2 = {
    createIntegratedKernelSessionV2(input, callback) {
      const bridge = exchange(callback);
      let operate: Callback;
      try {
        operate = addon.createIntegratedKernelSessionV2(input, bridge.invoke, scheduled ? 3 : 2);
        if (scheduled && !bridge.negotiated()) return invalid();
      }
      finally { bridge.close(); }
      return request => {
        try { return operate(request); }
        finally { bridge.close(); }
      };
    },
    migrateKernelExtensionV2(input, callback) {
      const bridge = exchange(callback);
      try { return addon.migrateKernelExtensionV2(input, bridge.invoke, 2); }
      finally { bridge.close(); }
    },
  };
  return installNativeIntegratedBackendV2(transport, policy);
}
