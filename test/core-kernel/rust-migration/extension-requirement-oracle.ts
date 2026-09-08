import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeExtensionRuntimeRequirementV1 } from "../../../src/core-kernel/registry/domain-catalog-codec";

export const EXTENSION_REQUIREMENT_ORACLE_PATH =
  "test/core-kernel/rust-migration/fixtures/extension-requirement-oracle-v1.json";

export function buildExtensionRequirementOracle() {
  const base = {
    requirementVersion: 1, namespace: "example.instrument", moduleId: "module.example",
    contributionId: "contribution.example", supportedSchemaVersions: [1], requiredForWrite: true,
  };
  const inputs: { id: string; inputJson: string }[] = [];
  const add = (id: string, input: unknown) => inputs.push({ id, inputJson: JSON.stringify(input) });
  add("valid-base", base);
  for (const field of Object.keys(base)) {
    const missing: Record<string, unknown> = { ...base };
    delete missing[field];
    add(`missing-${field}`, missing);
  }
  add("extra-field", { ...base, extra: true });
  add("protocol-version-instead", {
    namespace: base.namespace, moduleId: base.moduleId, contributionId: base.contributionId,
    supportedSchemaVersions: [1], requiredForWrite: true, protocolVersion: 1,
  });
  add("protocol-version-additional", { ...base, protocolVersion: 1 });
  for (const value of [0, 2, 1.5, "1", null, true]) add(`requirement-version-${JSON.stringify(value)}`, { ...base, requirementVersion: value });
  for (const value of [false, 0, 1, "true", null, {}, []]) add(`required-for-write-${JSON.stringify(value)}`, { ...base, requiredForWrite: value });
  const ids = ["a", "0", "a".repeat(128), "a".repeat(129), "", "a-b.c0", "a..b", "a--b", "a.-b", "a-.b", ".a", "a.", "-a", "a-", "A", "a_b", "a/b", "a b", "é", "😀", "\ud800", "\udc00", "a\ud800b", "a\u0000b"];
  for (const field of ["namespace", "moduleId", "contributionId"]) {
    ids.forEach((value, index) => add(`${field}-text-${index}`, { ...base, [field]: value }));
    for (const value of [null, 1, true, [], {}]) add(`${field}-type-${JSON.stringify(value)}`, { ...base, [field]: value });
  }
  const versions: unknown[] = [[], [1], [1, 2], [Number.MAX_SAFE_INTEGER], [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER], [Number.MAX_SAFE_INTEGER + 1], [0], [-1], [1.5], [1, 1], [2, 1], ["1"], [null], [true], {}, null, 1,
    Array.from({ length: 256 }, (_, index) => index + 1), Array.from({ length: 257 }, (_, index) => index + 1)];
  versions.forEach((value, index) => add(`schema-versions-${index}`, { ...base, supportedSchemaVersions: value }));
  inputs.push({ id: "schema-negative-zero", inputJson: JSON.stringify(base).replace('"supportedSchemaVersions":[1]', '"supportedSchemaVersions":[-0]') });
  inputs.push({ id: "schema-exponent-integer", inputJson: JSON.stringify(base).replace('"supportedSchemaVersions":[1]', '"supportedSchemaVersions":[1e0]') });
  for (const spelling of ["1.0", "1e0", "1.0000000000000001", "1e309"]) {
    inputs.push({ id: `requirement-number-${spelling}`, inputJson: JSON.stringify(base).replace('"requirementVersion":1', `"requirementVersion":${spelling}`) });
  }
  for (const spelling of ["9007199254740991.1", "1.0000000000000001", "1e309", "9007199254740992", "1e-400"]) {
    inputs.push({ id: `schema-number-${spelling}`, inputJson: JSON.stringify(base).replace('"supportedSchemaVersions":[1]', `"supportedSchemaVersions":[${spelling}]`) });
  }
  for (const input of [null, [], 1, "requirement"]) add(`root-${JSON.stringify(input)}`, input);
  return {
    schemaVersion: 1,
    source: "decodeExtensionRuntimeRequirementV1(JSON.parse(inputJson))",
    cases: inputs.map(({ id, inputJson }) => {
      const decoded = decodeExtensionRuntimeRequirementV1(JSON.parse(inputJson));
      return { id, inputJson, expected: decoded === undefined
        ? { status: "rejected" as const }
        : { status: "accepted" as const, value: decoded } };
    }),
  };
}

// Explicit generation only. Tests read this artifact and never overwrite it.
if (require.main === module && process.argv[2] === "--write") {
  writeFileSync(resolve(EXTENSION_REQUIREMENT_ORACLE_PATH), `${JSON.stringify(buildExtensionRequirementOracle())}\n`, "utf8");
}
