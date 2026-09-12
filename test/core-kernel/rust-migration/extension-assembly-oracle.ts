import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileOfficialModuleCatalogV1, defineDomainCommandContributionV1, defineDomainCommandRegistrationEntryV1 } from "../../../src/core-kernel/module-sdk/index";
import { computeKernelDomainAvailability, resolveKernelIntegratedRuntimeAssembly } from "../../../src/core-kernel/registry/domain-availability";
import type { ExtensionRuntimeRequirementV1 } from "../../../src/core-kernel/registry/integrated-contracts";
import type { ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { CVN6_MANIFEST } from "../fixtures/cvn-6-synthetic-official-modules";
import { captureHostInstalledContributionsV1 } from "../../../src/core-kernel/native/integrated-catalog-capture";

export const EXTENSION_ASSEMBLY_ORACLE_PATH = "test/core-kernel/rust-migration/fixtures/extension-assembly-oracle-v1.json";
export interface AssemblyInput {
  installed: { moduleId: string; contributionId: string; requirements: ExtensionRuntimeRequirementV1[] }[];
  inventory: { kind: "omitted" } | { kind: "explicit-undefined" } | { kind: "explicit"; value: unknown };
  extensions: ScoreDocument["extensions"];
}
class CatalogDefinitionRejected extends Error {}
class CatalogCompilationRejected extends Error {
  constructor(readonly failure: Extract<ReturnType<typeof compileOfficialModuleCatalogV1>, { ok: false }>["failure"]) {
    super("catalog compilation rejected");
  }
}
export function compileAssemblyOracleCatalog(installed: AssemblyInput["installed"]) {
  const entries = installed.map((owner) => {
    const defined = defineDomainCommandContributionV1({
      apiVersion: 1, moduleId: owner.moduleId, contributionId: owner.contributionId,
      extensionNamespaces: owner.requirements.length === 0 ? [`${owner.moduleId}.unused`] : owner.requirements.map((r) => r.namespace),
      extensionRequirements: owner.requirements, commands: [], effects: [],
      validate: () => [], classify: () => ({ status: "supported", issues: [] }),
    });
    if (defined.status !== "defined") throw new CatalogDefinitionRejected(`contribution ${owner.moduleId}`);
    const entry = defineDomainCommandRegistrationEntryV1({ registrationEntryId: "kernel.domain-commands.v1", ownerModuleId: owner.moduleId, kind: "domain-command", contributions: [defined.value] });
    if (entry.status !== "defined") throw new Error(`registration ${owner.moduleId}`);
    return entry.value;
  });
  const compiled = compileOfficialModuleCatalogV1({ startupManifestVersion: 1, modules: [
    ...CVN6_MANIFEST.modules.filter((m) => m.moduleId.startsWith("core.")),
    ...installed.map((owner) => ({ moduleId: owner.moduleId, origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1,
      capabilities: ["command:register", "command:execute", "score:read", "event:subscribe"], registrationEntryIds: ["kernel.domain-commands.v1"] })),
  ] }, entries);
  if (!compiled.ok) throw new CatalogCompilationRejected(compiled.failure);
  return compiled.catalog;
}
export function requirement(namespace: string, moduleId = "fixture.module", contributionId = "fixture.contribution"): ExtensionRuntimeRequirementV1 {
  return { requirementVersion: 1, namespace, moduleId, contributionId, supportedSchemaVersions: [1, 2], requiredForWrite: true };
}
export function evaluateAssemblyOracle(input: AssemblyInput) {
  let catalog: ReturnType<typeof compileAssemblyOracleCatalog>;
  try {
    catalog = compileAssemblyOracleCatalog(input.installed);
  } catch (error) {
    if (error instanceof CatalogDefinitionRejected) return { status: "catalog-rejected" as const, stage: "contribution-definition" as const };
    if (error instanceof CatalogCompilationRejected) return { status: "catalog-rejected" as const, stage: "catalog-compilation" as const, failure: error.failure };
    throw error;
  }
  const resolveAssembly = (selected: typeof catalog) => input.inventory.kind === "omitted"
    ? resolveKernelIntegratedRuntimeAssembly(selected)
    : resolveKernelIntegratedRuntimeAssembly(selected, input.inventory.kind === "explicit-undefined" ? undefined : input.inventory.value);
  const captured = captureHostInstalledContributionsV1(catalog);
  if (captured === undefined) throw new Error("genuine SDK catalog capture failed");
  const hostProjectionJson = JSON.stringify(captured.projection);
  const resolved = resolveAssembly(catalog);
  if (!resolved.ok) return { status: "rejected" as const, reason: resolved.reason, hostProjectionJson };
  const repeated = resolveAssembly(catalog);
  const separate = resolveAssembly(compileAssemblyOracleCatalog(input.installed));
  const computed = computeKernelDomainAvailability({ ...createCoreScoreFixture(), extensions: input.extensions }, resolved.state);
  return { status: "resolved" as const, hostProjectionJson, inventory: resolved.state.inventory,
    canonicalInventoryKey: resolved.state.canonicalInventoryKey, availabilityJson: JSON.stringify(computed),
    identity: { sameCatalogReused: repeated.ok && repeated.state.assemblyIdentity === resolved.state.assemblyIdentity,
      differentCatalogIsolated: separate.ok && separate.state.assemblyIdentity !== resolved.state.assemblyIdentity } };
}
export function buildExtensionAssemblyOracle() {
  const a = requirement("fixture.a");
  const b = requirement("fixture.b", "second.module", "second.contribution");
  const owner = { moduleId: a.moduleId, contributionId: a.contributionId, requirements: [a] };
  const second = { moduleId: b.moduleId, contributionId: b.contributionId, requirements: [b] };
  const cases: { id: string; input: AssemblyInput }[] = [];
  const add = (id: string, installed: AssemblyInput["installed"], inventory: AssemblyInput["inventory"], extensions: ScoreDocument["extensions"] = []) => cases.push({ id, input: { installed, inventory, extensions } });
  for (const count of [62, 63]) {
    const installed = Array.from({ length: count }, (_, index) => {
      const moduleId = `host.module${index}`;
      const contributionId = `host.contribution${index}`;
      return { moduleId, contributionId, requirements: [requirement(`host.namespace${index}`, moduleId, contributionId)] };
    });
    add(`domain-owner-count-${count}`, installed, { kind: "omitted" });
  }
  for (const moduleId of ["core.commands", "core.selectors"]) {
    add(`reserved-owner-${moduleId}`, [{ moduleId, contributionId: "host.reserved", requirements: [requirement("host.reserved", moduleId, "host.reserved")] }], { kind: "omitted" });
  }
  const explicit = (requirements: unknown[]): AssemblyInput["inventory"] => ({ kind: "explicit", value: { inventoryVersion: 1, requirements } });
  const block = (namespace: string, schemaVersion = 1, partId?: string): ScoreDocument["extensions"][number] => ({ namespace, schemaVersion,
    owner: partId === undefined ? { kind: "score" } : { kind: "part", partId }, payload: { opaque: [0.125, "\ud800", { untouched: true }] } });
  add("omitted-empty", [], { kind: "omitted" });
  add("omitted-installed", [owner, second], { kind: "omitted" });
  add("omitted-installed-reversed", [second, owner], { kind: "omitted" });
  add("explicit-permuted", [owner, second], explicit([b, a]));
  add("explicit-canonical", [second, owner], explicit([a, b]));
  add("explicit-undefined", [], { kind: "explicit-undefined" });
  add("installed-omitted-from-inventory", [owner], explicit([]));
  add("installed-schema-parity", [owner], explicit([{ ...a, supportedSchemaVersions: [1] }]));
  add("installed-owner-parity", [owner], explicit([{ ...a, contributionId: "wrong.contribution" }]));
  add("installed-owner-without-requirement", [{ ...owner, requirements: [] }], explicit([a]));
  add("installed-owner-without-requirement-omitted", [{ ...owner, requirements: [] }], { kind: "omitted" });
  add("extra-requirement-for-installed-owner", [owner], explicit([a, { ...a, namespace: "fixture.other" }]));
  add("unknown-preserved", [], explicit([]), [block("unknown.namespace", 99)]);
  add("missing-compatible", [], explicit([a]), [block(a.namespace)]);
  add("incompatible-before-missing", [], explicit([a]), [block(a.namespace, 3)]);
  add("installed-compatible", [owner], explicit([a]), [block(a.namespace, 2)]);
  add("installed-incompatible", [owner], explicit([a]), [block(a.namespace, 3)]);
  add("fact-order-utf16", [], explicit([b, a]), [block(b.namespace), ...["\ue000", "😀", "\ud800", "\udc00", "a"].map((id) => block(a.namespace, 1, id)), block(a.namespace, 3), block(a.namespace, 1)]);
  add("inventory-duplicate", [], explicit([a, a]));
  add("inventory-extra-field", [], { kind: "explicit", value: { inventoryVersion: 1, requirements: [], extra: 1 } });
  add("inventory-bad-version", [], { kind: "explicit", value: { inventoryVersion: 2, requirements: [] } });
  for (const count of [1024, 1025]) add(`inventory-count-${count}`, [], explicit(Array.from({ length: count }, (_, i) => requirement(`missing.n${i}`))));
  for (const count of [0, 256, 257]) add(`schema-count-${count}`, [], explicit([{ ...a, supportedSchemaVersions: Array.from({ length: count }, (_, i) => i + 1) }]));
  add("schema-safe-max", [], explicit([{ ...a, supportedSchemaVersions: [Number.MAX_SAFE_INTEGER] }]), [block(a.namespace, Number.MAX_SAFE_INTEGER)]);
  add("schema-unsorted", [], explicit([{ ...a, supportedSchemaVersions: [2, 1] }]));
  return { schemaVersion: 1, source: "real SDK compile + resolveKernelIntegratedRuntimeAssembly + computeKernelDomainAvailability",
    cases: cases.map(({ id, input }) => ({ id, inputJson: JSON.stringify(input), expected: evaluateAssemblyOracle(input) })) };
}
if (require.main === module && process.argv[2] === "--write") {
  writeFileSync(resolve(EXTENSION_ASSEMBLY_ORACLE_PATH), `${JSON.stringify(buildExtensionAssemblyOracle())}\n`, "utf8");
}
