import { captureStrictInput } from "../codec/strict-input-capture";
import { hasIncompatibleContributionReads, hasUnavailableContributionReads } from "../registry/contribution-reads";
import { nativeExtensionMigrationFactoryV2 } from "../native/integrated-backend-selection";
import { invokeScopedCallbackV1, type ScopedCallbackInvokerV1 } from "../module-sdk/scoped-invocation";
import { decodeScoreDocument } from "../codec/decode-score-document";
import {
  createIntegratedContributionView,
  decodeIntegratedModuleIssues,
} from "../commands/integrated-runtime";
import {
  isJsonValue,
  type ExtensionBlock,
  type ExtensionOwner,
  type JsonObject,
} from "../domain/extensions";
import type { ScoreDocument } from "../domain/score-document";
import { getModuleEffectDefinitionBinding } from "../module-sdk/definitions";
import type { CompiledDomainCommandContributionV1, CompiledModuleEffectDefinitionV1 } from "../module-sdk/contracts";
import {
  getKernelIntegratedCatalogState,
  type KernelIntegratedCatalogState,
} from "../registry/domain-catalog";
import type {
  KernelIntegratedCatalog,
  ModuleKernelIssue,
} from "../registry/integrated-contracts";
import {
  isSafeRegistryId,
  readExactDataRecord,
} from "../registry/strict-codec";
import { mapDiagnosticToKernelIssue } from "../reports/adapters";
import { buildKernelReport } from "../reports/build-report";
import type {
  KernelIssue,
  MigrationFailureCode,
  MigrationReport,
} from "../reports/contracts";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type {
  KernelExtensionMigrationFailure,
  KernelExtensionMigrationRequestV1,
  KernelExtensionMigrationResult,
} from "./contracts";

const reflectApply = Reflect.apply;
const structuredCloneValue = structuredClone;
const arraySplice = Array.prototype.splice;
const arrayConstructor = Array;
const arrayIsArray = Array.isArray;
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectOwnKeys = Reflect.ownKeys;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const objectFreeze = Object.freeze;
const jsonObject = JSON;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const weakSetConstructor = WeakSet;
const weakSetHas = WeakSet.prototype.has;
const weakSetAdd = WeakSet.prototype.add;

function clone<T>(value: T): T {
  return reflectApply(structuredCloneValue, undefined, [value]) as T;
}

function isArray(value: unknown): value is readonly unknown[] {
  return reflectApply(arrayIsArray, arrayConstructor, [value]) === true;
}

function isSafeInteger(value: unknown): value is number {
  return reflectApply(numberIsSafeInteger, numberConstructor, [value]) === true;
}

function hasJsonPrimordials(): boolean {
  const parseDescriptor = reflectGetOwnPropertyDescriptor(jsonObject, "parse");
  const stringifyDescriptor = reflectGetOwnPropertyDescriptor(jsonObject, "stringify");
  return parseDescriptor !== undefined &&
    "value" in parseDescriptor &&
    parseDescriptor.value === jsonParse &&
    stringifyDescriptor !== undefined &&
    "value" in stringifyDescriptor &&
    stringifyDescriptor.value === jsonStringify;
}

function freeze<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  const pending: unknown[] = [value];
  const objects: object[] = [];
  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    pending.length -= 1;
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) {
      continue;
    }
    reflectApply(weakSetAdd, seen, [current]);
    objects[objects.length] = current;
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending[pending.length] = descriptor.value;
      }
    }
  }
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const current = objects[index];
    if (current !== undefined) {
      reflectApply(objectFreeze, Object, [current]);
    }
  }
  return value;
}

function migrationIssue(code: MigrationFailureCode): KernelIssue {
  return freeze({
    issueVersion: 1 as const,
    code,
    severity:
      code === "migration.internal-error" ||
      code === "migration.contribution-internal-error"
        ? "fatal" as const
        : "error" as const,
    messageKey: `core.${code}` as `core.${MigrationFailureCode}`,
    source: { kind: "core" as const, subsystem: "migration" as const },
  });
}

function report(
  code?: MigrationFailureCode,
  additional: readonly KernelIssue[] = [],
): MigrationReport {
  if (code === undefined) {
    return buildKernelReport("migration", additional);
  }
  const issues: KernelIssue[] = [migrationIssue(code)];
  for (let index = 0; index < additional.length; index += 1) {
    const issue = additional[index];
    if (issue !== undefined) {
      issues[issues.length] = issue;
    }
  }
  return buildKernelReport(
    "migration",
    issues,
  );
}

function rejected(
  failure: KernelExtensionMigrationFailure,
  issues: readonly KernelIssue[] = [],
): KernelExtensionMigrationResult {
  return freeze({
    status: "rejected" as const,
    failure: clone(failure),
    report: report(failure.code, issues),
  });
}

function invalidInput(diagnostics: readonly import("../validation/diagnostics").DecodeDiagnostic[]) {
  const mapped: KernelIssue[] = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = diagnostics[index];
    if (diagnostic !== undefined) {
      mapped[mapped.length] = mapDiagnosticToKernelIssue(diagnostic);
    }
  }
  return rejected({ code: "migration.invalid-input", diagnostics }, mapped);
}

function semanticInvalid(
  diagnostics: readonly import("../validation/diagnostics").SemanticDiagnostic[],
): KernelExtensionMigrationResult {
  const mapped: KernelIssue[] = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = diagnostics[index];
    if (diagnostic !== undefined) {
      mapped[mapped.length] = mapDiagnosticToKernelIssue(diagnostic);
    }
  }
  return rejected({ code: "migration.semantic-invalid", diagnostics }, mapped);
}

function decodeOwner(value: unknown): ExtensionOwner | undefined {
  const score = readExactDataRecord(value, ["kind"]);
  if (score?.kind === "score") {
    return freeze({ kind: "score" as const });
  }
  const part = readExactDataRecord(value, ["kind", "partId"]);
  return part?.kind === "part" && typeof part.partId === "string" && part.partId !== ""
    ? freeze({ kind: "part" as const, partId: part.partId })
    : undefined;
}

function decodeRequest(value: unknown): KernelExtensionMigrationRequestV1 | undefined {
  const captured = captureStrictInput(value);
  if (captured.status !== "captured") {
    return undefined;
  }
  const record = readExactDataRecord(captured.value, [
    "migrationVersion",
    "moduleId",
    "contributionId",
    "effectKind",
    "namespace",
    "owner",
    "sourceSchemaVersion",
    "targetSchemaVersion",
    "payload",
  ]);
  const owner = decodeOwner(record?.owner);
  if (
    record?.migrationVersion !== 1 ||
    !isSafeRegistryId(record.moduleId) ||
    !isSafeRegistryId(record.contributionId) ||
    !isSafeRegistryId(record.effectKind) ||
    !isSafeRegistryId(record.namespace) ||
    owner === undefined ||
    !isSafeInteger(record.sourceSchemaVersion) ||
    (record.sourceSchemaVersion as number) < 1 ||
    !isSafeInteger(record.targetSchemaVersion) ||
    (record.targetSchemaVersion as number) < 1 ||
    record.sourceSchemaVersion === record.targetSchemaVersion ||
    typeof record.payload !== "object" ||
    record.payload === null ||
    isArray(record.payload) ||
    !isJsonValue(record.payload)
  ) {
    return undefined;
  }
  return freeze({
    migrationVersion: 1 as const,
    moduleId: record.moduleId,
    contributionId: record.contributionId,
    effectKind: record.effectKind,
    namespace: record.namespace,
    owner,
    sourceSchemaVersion: record.sourceSchemaVersion as number,
    targetSchemaVersion: record.targetSchemaVersion as number,
    payload: clone(record.payload as JsonObject),
  });
}

function sameOwner(left: ExtensionOwner, right: ExtensionOwner): boolean {
  return left.kind === right.kind &&
    (left.kind === "score" ||
      (right.kind === "part" && left.partId === right.partId));
}

function targetBlock(
  document: ScoreDocument,
  namespace: string,
  owner: ExtensionOwner,
): { readonly index: number; readonly block: ExtensionBlock } | undefined {
  let found: { readonly index: number; readonly block: ExtensionBlock } | undefined;
  for (let index = 0; index < document.extensions.length; index += 1) {
    const block = document.extensions[index];
    if (
      block !== undefined &&
      block.namespace === namespace &&
      sameOwner(block.owner, owner)
    ) {
      if (found !== undefined) {
        return undefined;
      }
      found = { index, block };
    }
  }
  return found;
}

function includesVersion(versions: readonly number[], version: number): boolean {
  for (let index = 0; index < versions.length; index += 1) {
    if (versions[index] === version) {
      return true;
    }
  }
  return false;
}

function findContribution(
  state: KernelIntegratedCatalogState,
  request: KernelExtensionMigrationRequestV1,
): CompiledDomainCommandContributionV1 | undefined {
  for (let index = 0; index < state.contributions.length; index += 1) {
    const contribution = state.contributions[index];
    if (
      contribution?.moduleId === request.moduleId &&
      contribution.contributionId === request.contributionId
    ) {
      return contribution;
    }
  }
  return undefined;
}

function ownerKindAllowed(
  values: readonly ("score" | "part")[],
  kind: "score" | "part",
): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === kind) {
      return true;
    }
  }
  return false;
}

function contributionFailure(
  code:
    | "migration.contribution-contract-violation"
    | "migration.contribution-internal-error",
  contribution: CompiledDomainCommandContributionV1,
): KernelExtensionMigrationResult {
  return rejected({
    code,
    moduleId: contribution.moduleId,
    contributionId: contribution.contributionId,
  });
}

export function validateExtensionMigrationModulesV1(
  document: ScoreDocument,
  state: KernelIntegratedCatalogState,
  invokeScoped: ScopedCallbackInvokerV1 = invokeScopedCallbackV1,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: "semantic";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly ok: false;
      readonly kind: "contract" | "internal";
      readonly contribution: CompiledDomainCommandContributionV1;
    } {
  const issues: ModuleKernelIssue[] = [];
  for (let index = 0; index < state.contributions.length; index += 1) {
    const contribution = state.contributions[index];
    if (contribution === undefined) {
      continue;
    }
    const view = createIntegratedContributionView(document, 0, contribution);
    if (view.compatibleExtensions.length === 0) {
      continue;
    }
    if (hasUnavailableContributionReads(state, contribution)) return { ok: false, kind: "contract", contribution };
    if (hasIncompatibleContributionReads(document, contribution)) return { ok: false, kind: "contract", contribution };
    let raw: unknown;
    try {
      raw = invokeScoped(contribution, "validate", null, [view], () => reflectApply(contribution.validate, undefined, [view]));
    } catch {
      return { ok: false, kind: "internal", contribution };
    }
    const callbackIssues = decodeIntegratedModuleIssues(raw, contribution);
    if (callbackIssues === undefined) {
      return { ok: false, kind: "contract", contribution };
    }
    for (let issueIndex = 0; issueIndex < callbackIssues.length; issueIndex += 1) {
      const issue = callbackIssues[issueIndex];
      if (issue !== undefined) {
        issues[issues.length] = issue;
      }
      if (issues.length > 4_096) {
        return { ok: false, kind: "contract", contribution };
      }
    }
  }
  return issues.length === 0
    ? { ok: true }
    : { ok: false, kind: "semantic", issues: freeze(issues) };
}

function roundTrip(document: ScoreDocument): ScoreDocument | undefined {
  try {
    const encoded = reflectApply(jsonStringify, jsonObject, [document]) as
      | string
      | undefined;
    if (typeof encoded !== "string") {
      return undefined;
    }
    const parsed = reflectApply(jsonParse, jsonObject, [encoded]) as unknown;
    const decoded = decodeScoreDocument(parsed);
    return decoded.ok ? decoded.value : undefined;
  } catch {
    return undefined;
  }
}

function hasSameJsonData(left: unknown, right: unknown): boolean {
  try {
    const leftText = reflectApply(jsonStringify, jsonObject, [left]);
    const rightText = reflectApply(jsonStringify, jsonObject, [right]);
    return typeof leftText === "string" && leftText === rightText;
  } catch {
    return false;
  }
}

export function migrateKernelExtension(
  input: unknown,
  requestInput: unknown,
  catalog: KernelIntegratedCatalog,
): KernelExtensionMigrationResult {
  try {
    const capturedInput = captureStrictInput(input);
    const decoded = capturedInput.status === "captured"
      ? decodeScoreDocument(capturedInput.value)
      : undefined;
    if (decoded === undefined) {
      return rejected({ code: "migration.invalid-input", diagnostics: [] });
    }
    if (!decoded.ok) {
      return invalidInput(decoded.diagnostics as readonly import("../validation/diagnostics").DecodeDiagnostic[]);
    }
    const request = decodeRequest(requestInput);
    if (request === undefined) {
      return rejected({ code: "migration.invalid-request" });
    }
    const native = nativeExtensionMigrationFactoryV2();
    if (native !== undefined) {
      const result = native(decoded.value, request, catalog);
      if (result.status !== "rejected") return freeze({ ...result, report: report() });
      if (result.failure.code === "migration.semantic-invalid") return semanticInvalid(result.failure.diagnostics);
      if (result.failure.code === "migration.invalid-input") return invalidInput(result.failure.diagnostics);
      return rejected(result.failure);
    }
    const initialSemantic = validateScoreDocumentSemantics(decoded.value);
    if (!initialSemantic.ok) {
      return semanticInvalid(initialSemantic.diagnostics);
    }
    const catalogState = getKernelIntegratedCatalogState(catalog);
    if (catalogState === undefined) {
      return rejected({ code: "migration.assembly-mismatch" });
    }
    const contribution = findContribution(catalogState, request);
    const effect = catalogState.effectIndex[request.effectKind];
    if (
      contribution === undefined ||
      effect === undefined ||
      effect.descriptor.source.moduleId !== request.moduleId ||
      effect.descriptor.source.contributionId !== request.contributionId ||
      effect.descriptor.namespace !== request.namespace ||
      !ownerKindAllowed(effect.descriptor.ownerKinds, request.owner.kind)
    ) {
      return rejected({ code: "migration.assembly-mismatch" });
    }
    const target = targetBlock(decoded.value, request.namespace, request.owner);
    if (target === undefined) {
      return rejected({ code: "migration.target-not-found" });
    }
    if (
      (target.block.schemaVersion !== request.sourceSchemaVersion &&
        target.block.schemaVersion !== request.targetSchemaVersion) ||
      !includesVersion(
        effect.descriptor.supportedSchemaVersions,
        request.sourceSchemaVersion,
      )
    ) {
      return rejected({ code: "migration.unsupported-source-version" });
    }
    if (!includesVersion(
      effect.descriptor.supportedSchemaVersions,
      request.targetSchemaVersion,
    )) {
      return rejected({ code: "migration.unsupported-target-version" });
    }
    if (target.block.schemaVersion === request.targetSchemaVersion) {
      const document = freeze(clone(decoded.value));
      return freeze({
        status: "not-required" as const,
        document,
        report: report(),
      });
    }
    const prepared = prepareExtensionMigrationEffectV1(decoded.value, request, contribution, effect, catalogState);
    if (!prepared.ok) return rejected(prepared.failure);
    const candidate = clone(decoded.value);
    const replacement: ExtensionBlock = {
      namespace: request.namespace,
      schemaVersion: request.targetSchemaVersion,
      owner: clone(request.owner),
      payload: clone(prepared.payload),
    };
    reflectApply(arraySplice, candidate.extensions, [
      target.index,
      1,
      replacement,
    ]);
    const roundTripped = roundTrip(candidate);
    if (roundTripped === undefined || !hasSameJsonData(candidate, roundTripped)) {
      return rejected({ code: "migration.internal-error" });
    }
    const semantic = validateScoreDocumentSemantics(roundTripped);
    if (!semantic.ok) {
      return semanticInvalid(semantic.diagnostics);
    }
    const moduleSemantic = validateExtensionMigrationModulesV1(roundTripped, catalogState);
    if (!moduleSemantic.ok) {
      if (moduleSemantic.kind === "semantic") {
        return rejected({
          code: "migration.contribution-semantic-invalid",
          issues: moduleSemantic.issues,
        });
      }
      return contributionFailure(
        moduleSemantic.kind === "internal"
          ? "migration.contribution-internal-error"
          : "migration.contribution-contract-violation",
        moduleSemantic.contribution,
      );
    }
    return freeze({
      status: "migrated" as const,
      document: freeze(clone(roundTripped)),
      report: report(),
    });
  } catch {
    return rejected({ code: "migration.internal-error" });
  }
}

/** Private callback service shared with the Rust migration bridge. It prepares
 * only an extension payload; it never replaces a document or owns a history. */
export function prepareExtensionMigrationEffectV1(document: ScoreDocument, request: KernelExtensionMigrationRequestV1,
  contribution: CompiledDomainCommandContributionV1, effect: CompiledModuleEffectDefinitionV1,
  state: KernelIntegratedCatalogState,
  invokeScoped: ScopedCallbackInvokerV1 = invokeScopedCallbackV1):
  { readonly ok: true; readonly schemaVersion: number; readonly payload: JsonObject } | { readonly ok: false; readonly failure: KernelExtensionMigrationFailure } {
    const target = targetBlock(document, request.namespace, request.owner);
    if (target === undefined) return { ok: false, failure: { code: "migration.target-not-found" } };
    const binding = getModuleEffectDefinitionBinding(effect);
    if (binding === undefined) {
      return { ok: false, failure: { code: "migration.assembly-mismatch" } };
    }
    if (hasUnavailableContributionReads(state, contribution)) return { ok: false, failure: {
      code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId,
    } };
    if (hasIncompatibleContributionReads(document, contribution)) return { ok: false, failure: {
      code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId,
    } };
    let decodedPayloadRaw: unknown;
    try {
      decodedPayloadRaw = invokeScoped(contribution, "effectDecode", effect.descriptor.effectKind, [request.payload],
        () => reflectApply(binding.decode, undefined, [request.payload]));
    } catch {
      return { ok: false, failure: { code: "migration.contribution-internal-error", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    if (!hasJsonPrimordials()) {
      return { ok: false, failure: { code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    const decodedPayloadCapture = captureStrictInput(decodedPayloadRaw);
    const decodedPayload = decodedPayloadCapture.status === "captured"
      ? readExactDataRecord(decodedPayloadCapture.value, ["status", "payload"])
      : undefined;
    if (decodedPayload?.status !== "decoded") {
      return { ok: false, failure: { code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    let transformedRaw: unknown;
    try {
      const args = [freeze({
        view: createIntegratedContributionView(document, 0, contribution),
        owner: clone(request.owner),
        currentBlock: clone(target.block),
        payload: decodedPayload.payload,
      })];
      transformedRaw = invokeScoped(contribution, "effectTransform", effect.descriptor.effectKind, args,
        () => reflectApply(binding.transform, undefined, args));
    } catch {
      return { ok: false, failure: { code: "migration.contribution-internal-error", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    if (!hasJsonPrimordials()) {
      return { ok: false, failure: { code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    const transformedCapture = captureStrictInput(transformedRaw);
    const transformed = transformedCapture.status === "captured"
      ? readExactDataRecord(transformedCapture.value, [
          "status",
          "schemaVersion",
          "payload",
        ])
      : undefined;
    if (
      transformed?.status !== "replace" ||
      transformed.schemaVersion !== request.targetSchemaVersion ||
      typeof transformed.payload !== "object" ||
      transformed.payload === null ||
      isArray(transformed.payload) ||
      !isJsonValue(transformed.payload)
    ) {
      return { ok: false, failure: { code: "migration.contribution-contract-violation", moduleId: contribution.moduleId, contributionId: contribution.contributionId } };
    }
    return { ok: true, schemaVersion: transformed.schemaVersion, payload: clone(transformed.payload as JsonObject) };
}
