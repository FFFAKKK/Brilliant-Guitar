// Private SDK adapter. No command runtime, mutable document or history lives here.
import { captureStrictInput } from "../codec/strict-input-capture";
import { invokeScopedCallbackV1, type ScopedCallbackInvokerV1 } from "../module-sdk/scoped-invocation";
import { readExactDataRecord, readDenseArray } from "../registry/strict-codec";
import {
  captureEnvelope, createIntegratedContributionView, decodeIntegratedAffectedAddresses,
  decodeIntegratedModuleIssues, decodeTarget, moduleEffectForRequest, runNativeModulePipeline,
  targetExists,
  invokeIntegratedCallback, hasIntactExecutionPrimordials,
} from "../commands/integrated-runtime";
import { getDomainCommandDefinitionBinding, getModuleEffectDefinitionBinding } from "../module-sdk/definitions";
import type { CompiledDomainCommandContributionV1 } from "../module-sdk/contracts";
import type { KernelIntegratedRuntimeAssemblyState } from "../registry/domain-availability";
import type { ScoreDocument } from "../domain/score-document";
import { encodeIntegratedValueV2 } from "./integrated-wire";
import type { ScoreSupportResult } from "../profiles/score-feature-profile";

const parse = JSON.parse;
const apply = Reflect.apply;
const freezeObject = Object.freeze;
const ownKeys = Reflect.ownKeys;
const getDescriptor = Reflect.getOwnPropertyDescriptor;
const bufferToString = Buffer.prototype.toString;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of ownKeys(value)) {
      const descriptor = getDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) freeze(descriptor.value);
    }
    freezeObject(value);
  }
  return value;
}
function capture(value: unknown): unknown {
  const result = captureStrictInput(value);
  return result.status === "captured" ? result.value : undefined;
}

/** The assembly was authenticated by the real SDK resolver. Decoded callback
 * values remain in JS; only captured requests/results cross the private bridge. */
export function createNativeContributionExecutorV2(assembly: KernelIntegratedRuntimeAssemblyState,
  invokeScoped: ScopedCallbackInvokerV1 = invokeScopedCallbackV1): (bytes: Buffer) => Buffer {
  return (bytes) => {
    const request = parse(apply(bufferToString, bytes, ["utf8"]) as string) as {
      operation: "prepare" | "transform" | "assess";
      document: ScoreDocument;
      documentVersion: number;
      coreAssessment?: ScoreSupportResult;
      command?: unknown;
      contributionId?: string;
      effect?: unknown;
    };
    const output = execute(request);
    return encodeIntegratedValueV2(output);
  };

  function execute(request: {
    operation: string; document: ScoreDocument; documentVersion: number;
    coreAssessment?: ScoreSupportResult;
    command?: unknown; contributionId?: string; effect?: unknown;
  }): unknown {
    if (!hasIntactExecutionPrimordials()) return rejected("command.invalid-envelope");
    if (request.operation === "assess") {
      // The private Native artifact must supply its own Core assessment. Do not
      // silently fall back to legacy TS validation when paired with a stale addon.
      if (request.coreAssessment === undefined) return rejected("command.assembly-mismatch");
      return runNativeModulePipeline(request.document, request.documentVersion, assembly, request.coreAssessment, invokeScoped);
    }
    let contribution: CompiledDomainCommandContributionV1 | undefined;
    if (request.operation === "prepare") {
      const envelope = captureEnvelope(request.command);
      if (!envelope.ok) return envelope;
      const definition = assembly.catalogState.commandIndex[envelope.value.commandId];
      if (definition === undefined) return rejected("command.unknown-id");
      contribution = assembly.catalogState.contributions.find((entry) =>
        entry.moduleId === definition.descriptor.source.moduleId &&
        entry.contributionId === definition.descriptor.source.contributionId);
      if (contribution === undefined) return rejected("command.assembly-mismatch");
      const source = contribution;
      const contract = () => failure(source, "command.contribution-contract-violation");
      const target = decodeTarget(envelope.value.target, definition.descriptor.targetKind);
      if (target === undefined) {
        const candidate = envelope.value.target;
        const kind = candidate !== null && typeof candidate === "object" ? getDescriptor(candidate, "kind")?.value : undefined;
        return rejected(kind === definition.descriptor.targetKind ? "command.invalid-envelope" : "command.target-mismatch");
      }
      const binding = getDomainCommandDefinitionBinding(definition);
      if (binding === undefined) return contract();
      try {
        const decodeArgs = [freeze({ target, payload: envelope.value.payload })];
        const decoded = capture(invokeScoped(source, "commandDecode", definition.descriptor.commandId, decodeArgs,
          () => invokeIntegratedCallback(binding.decode, decodeArgs)));
        if (readExactDataRecord(decoded, ["status"])?.status === "invalid") return rejected("command.invalid-envelope");
        const record = readExactDataRecord(decoded, ["status", "command"]);
        if (record?.status !== "decoded") return contract();
        if (!targetExists(request.document, target)) return rejected("command.target-not-found");
        const prepareArgs = [
          createIntegratedContributionView(request.document, request.documentVersion, source), record.command,
        ];
        const prepared = capture(invokeScoped(source, "commandPrepare", definition.descriptor.commandId, prepareArgs,
          () => invokeIntegratedCallback(binding.prepare, prepareArgs)));
        if (readExactDataRecord(prepared, ["status"])?.status === "no-op") return { ok: true, prepared };
        const rejectedValue = readExactDataRecord(prepared, ["status", "issues"]);
        if (rejectedValue?.status === "rejected") return semantic(source, rejectedValue.issues);
        const changed = readExactDataRecord(prepared, ["status", "effectRequests", "affected"]);
        const effects = readDenseArray(changed?.effectRequests);
        const affected = decodeIntegratedAffectedAddresses(changed?.affected);
        if (!affected.ok && affected.reason === "resource") return {
          ok: false, failure: { code: "command.resource-limit-exceeded", limitKind: "affected-addresses", limit: affected.limit, actual: affected.actual },
        };
        if (changed?.status !== "changed" || effects === undefined || effects.length === 0 || !affected.ok) return contract();
        return { ok: true, prepared: { status: "changed", effectRequests: effects, affected: affected.value } };
      } catch { return failure(source, "command.contribution-internal-error"); }
    }
    contribution = assembly.catalogState.contributions.find((entry) => entry.contributionId === request.contributionId);
    if (contribution === undefined) return rejected("command.assembly-mismatch");
    const source = contribution;
    const contract = () => failure(source, "command.contribution-contract-violation");
    const owned = moduleEffectForRequest(request.effect, source);
    if (owned === undefined) return contract();
    const binding = getModuleEffectDefinitionBinding(owned.definition);
    if (binding === undefined) return contract();
    try {
      const decoded = readExactDataRecord(capture(invokeScoped(source, "effectDecode", owned.definition.descriptor.effectKind, [owned.payload],
        () => invokeIntegratedCallback(binding.decode, [owned.payload]))), ["status", "payload"]);
      if (decoded?.status !== "decoded") return contract();
      const currentBlock = request.document.extensions.find((block) => block.namespace === owned.definition.descriptor.namespace &&
        block.owner.kind === owned.owner.kind && (block.owner.kind === "score" ||
          (owned.owner.kind === "part" && block.owner.partId === owned.owner.partId)));
      const transformArgs = [freeze({
        view: createIntegratedContributionView(request.document, request.documentVersion, source),
        owner: owned.owner, currentBlock, payload: decoded.payload,
      })];
      const transformed = capture(invokeScoped(source, "effectTransform", owned.definition.descriptor.effectKind, transformArgs,
        () => invokeIntegratedCallback(binding.transform, transformArgs)));
      const rejectedValue = readExactDataRecord(transformed, ["status", "issues"]);
      if (rejectedValue?.status === "rejected") return semantic(source, rejectedValue.issues);
      return { ok: true, transformed };
    } catch { return failure(source, "command.contribution-internal-error"); }
  }
}

function rejected(code: string): unknown { return { ok: false, failure: { code } }; }
function failure(source: CompiledDomainCommandContributionV1, code: string): unknown {
  return { ok: false, failure: { code, moduleId: source.moduleId, contributionId: source.contributionId } };
}
function semantic(source: CompiledDomainCommandContributionV1, raw: unknown): unknown {
  const issues = decodeIntegratedModuleIssues(raw, source);
  return issues === undefined ? failure(source, "command.contribution-contract-violation")
    : { ok: false, failure: { code: "command.contribution-semantic-invalid", issues } };
}
