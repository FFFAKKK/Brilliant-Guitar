import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { test } from "node:test";

import * as coreKernel from "../../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import * as moduleSdk from "../../../src/core-kernel/module-sdk/index";
import { CVN6_REGISTRATION_ENTRIES } from "../fixtures/cvn-6-synthetic-official-modules";
import {
  APPLICATION_RUNTIME_EXPORTS,
  COMMAND_IDS,
  CONTRIBUTION_ABI_FIELDS,
  MODULE_SDK_RUNTIME_EXPORTS,
  MODULE_SDK_TYPE_EXPORTS,
} from "./ts-oracle-fixtures";
import {
  createMinimalRkp2StoreFixture,
  createRkp2StoreFixtureCatalog,
} from "./rkp-2-store-fixtures";

const IMPLEMENTATION_BASE = "df40aef391440ae64ad3e266419579bee5887a1f";
const DESIGN_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/design.md";
const TASK_PATH =
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json";
const PARENT_PATH =
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";

const CRATES = [
  "brilliant-core-types",
  "brilliant-score-foundation",
  "brilliant-extension-protocol",
  "brilliant-kernel-contracts",
  "brilliant-kernel-runtime",
  "brilliant-kernel-session",
  "brilliant-kernel-node",
] as const;

type CrateName = (typeof CRATES)[number];

const EXPECTED_GRAPH: Readonly<Record<CrateName, readonly string[]>> = {
  "brilliant-core-types": [],
  "brilliant-score-foundation": ["brilliant-core-types"],
  "brilliant-extension-protocol": ["brilliant-core-types"],
  "brilliant-kernel-contracts": [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
  ],
  "brilliant-kernel-runtime": [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
    "brilliant-kernel-contracts",
  ],
  "brilliant-kernel-session": [
    "brilliant-kernel-runtime",
    "brilliant-kernel-contracts",
    "brilliant-extension-protocol",
  ],
  "brilliant-kernel-node": [
    "brilliant-kernel-contracts",
    "brilliant-kernel-session",
  ],
};

const EXPECTED_IMPLEMENTATION_PATHS = [
  "Cargo.toml",
  "Cargo.lock",
  "crates/brilliant-score-foundation/src/lib.rs",
  "crates/brilliant-score-foundation/src/codec.rs",
  "crates/brilliant-score-foundation/src/fraction.rs",
  "crates/brilliant-score-foundation/src/validation.rs",
  "crates/brilliant-kernel-contracts/src/codec.rs",
  "crates/brilliant-kernel-runtime/Cargo.toml",
  "crates/brilliant-kernel-runtime/src/lib.rs",
  "crates/brilliant-kernel-runtime/src/smoke_runtime.rs",
  "crates/brilliant-kernel-runtime/src/handles.rs",
  "crates/brilliant-kernel-runtime/src/records.rs",
  "crates/brilliant-kernel-runtime/src/topology.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "crates/brilliant-kernel-runtime/src/time_index.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-session/src/session.rs",
  "test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts",
  "test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts",
  "test/core-kernel/rust-migration/rkp-2-store-fixtures.ts",
] as const;

const EXPECTED_COORDINATION_PATHS = [
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md",
  ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/implementation-evidence.md",
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
] as const;

const STABLE_FAILURE_CODES = [
  "bridge.capture-invalid",
  "bridge.request-too-large",
  "codec.invalid-utf8",
  "codec.invalid-json",
  "codec.invalid-shape",
  "contract.unsupported-api-version",
  "contract.unsupported-protocol-version",
  "score.unsupported-schema",
  "score.invalid-structure",
  "codec.depth-limit",
  "codec.property-limit",
  "codec.number-out-of-range",
  "bridge.handle-unknown",
  "bridge.handle-stale",
  "bridge.handle-wrong-environment",
  "bridge.handle-wrong-thread",
  "bridge.handle-reentrant",
  "bridge.handle-busy",
  "bridge.handle-poisoned",
  "bridge.response-too-large",
  "bridge.panic-contained",
  "bridge.internal",
] as const;

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

function lines(value: string): string[] {
  return value === ""
    ? []
    : value.split(/\r?\n/u).filter((line) => line !== "");
}

function git(args: readonly string[]): string {
  return execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function section(source: string, name: string): string {
  const header = `[${name}]`;
  const start = source.indexOf(header);
  if (start < 0) {
    return "";
  }
  const bodyStart = start + header.length;
  const next = source.slice(bodyStart).search(/\r?\n\[/u);
  return next < 0
    ? source.slice(bodyStart)
    : source.slice(bodyStart, bodyStart + next);
}

function tomlArray(source: string, name: string): string[] {
  const match = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "u").exec(
    source,
  );
  if (match?.[1] === undefined) {
    return [];
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/gu), (entry) => entry[1] ?? "");
}

function projectInternalDependencies(source: string): string[] {
  return lines(section(source, "dependencies"))
    .map((line) => /^([a-z0-9-]+)\s*=/u.exec(line.trim())?.[1])
    .filter((value): value is string => value?.startsWith("brilliant-") === true);
}

function rustFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(resolve(root))) {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) {
      result.push(...rustFiles(relative(process.cwd(), absolute)));
    } else if (entry.endsWith(".rs")) {
      result.push(relative(process.cwd(), absolute).replaceAll("\\", "/"));
    }
  }
  return result;
}

function designAllowlistBlocks(): readonly [string[], string[]] {
  const future = readText(DESIGN_PATH).split(
    "## 14. Future implementation allowlist",
  )[1];
  assert.ok(future);
  const beforeRollout = future.split("## 15. Rollout and rollback", 1)[0] ?? "";
  const blocks = Array.from(
    beforeRollout.matchAll(/```text\r?\n([\s\S]*?)```/gu),
    (match) => lines(match[1] ?? "").map((path) => path.trim()),
  );
  assert.equal(blocks.length, 2);
  return [blocks[0] ?? [], blocks[1] ?? []];
}

function currentImplementationChanges(): Set<string> {
  const commands: readonly (readonly string[])[] = [
    ["diff", "--name-only", `${IMPLEMENTATION_BASE}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  return new Set(commands.flatMap((args) => lines(git(args))));
}

test("implementation changes stay inside the literal RKP-2 allowlists", () => {
  const [implementation, coordination] = designAllowlistBlocks();
  assert.deepEqual(implementation, [...EXPECTED_IMPLEMENTATION_PATHS]);
  assert.deepEqual(coordination, [...EXPECTED_COORDINATION_PATHS]);
  assert.equal(new Set(implementation).size, 21);
  assert.equal(new Set(coordination).size, 5);

  const allowed = new Set<string>([...implementation, ...coordination]);
  for (const path of currentImplementationChanges()) {
    assert.equal(allowed.has(path), true, `unreviewed implementation path: ${path}`);
  }
});

test("seven-crate graph and the Runtime-only slotmap pin are exact", () => {
  const root = readText("Cargo.toml");
  assert.deepEqual(
    tomlArray(section(root, "workspace"), "members"),
    CRATES.map((crate) => `crates/${crate}`),
  );
  assert.deepEqual(
    tomlArray(section(root, "workspace"), "default-members"),
    CRATES.map((crate) => `crates/${crate}`),
  );

  const actualCrates = readdirSync(resolve("crates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualCrates, [...CRATES].sort());

  const workspaceDependencies = section(root, "workspace.dependencies");
  assert.equal(
    (workspaceDependencies.match(/^slotmap\s*=\s*"=1\.1\.1"$/gmu) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    workspaceDependencies,
    /slotmap\s*=.*(?:default-features|features|serde|unstable)/u,
  );

  const consumers: string[] = [];
  for (const crate of CRATES) {
    const manifest = readText(`crates/${crate}/Cargo.toml`);
    assert.deepEqual(
      projectInternalDependencies(manifest).sort(),
      [...EXPECTED_GRAPH[crate]].sort(),
    );
    if (/^slotmap\.workspace\s*=\s*true$/gmu.test(manifest)) {
      consumers.push(crate);
    }
    assert.doesNotMatch(
      manifest,
      /slotmap.*(?:default-features|features|serde|unstable)/u,
    );
  }
  assert.deepEqual(consumers, ["brilliant-kernel-runtime"]);

  const lock = readText("Cargo.lock");
  assert.match(
    lock,
    /\[\[package\]\]\nname = "slotmap"\nversion = "1\.1\.1"\n/u,
  );
  assert.equal((lock.match(/\nname = "slotmap"\n/gu) ?? []).length, 1);
});

test("slotmap and RuntimeHandle stay behind the Runtime boundary", () => {
  const manifestsWithSlotmap = CRATES.filter((crate) =>
    readText(`crates/${crate}/Cargo.toml`).includes("slotmap"),
  );
  assert.deepEqual(manifestsWithSlotmap, ["brilliant-kernel-runtime"]);

  const dtoAndFfiCrates = [
    "brilliant-core-types",
    "brilliant-score-foundation",
    "brilliant-extension-protocol",
    "brilliant-kernel-contracts",
    "brilliant-kernel-node",
  ] as const;
  for (const crate of dtoAndFfiCrates) {
    const sources = rustFiles(`crates/${crate}`);
    for (const sourcePath of sources) {
      assert.doesNotMatch(readText(sourcePath), /\bRuntimeHandle\b/u, sourcePath);
      if (
        crate === "brilliant-score-foundation" ||
        crate === "brilliant-kernel-contracts" ||
        crate === "brilliant-kernel-node"
      ) {
        assert.doesNotMatch(readText(sourcePath), /\bslotmap\b/u, sourcePath);
      }
    }
  }
});

test("Node exports and the StableFailureV1 union remain closed", () => {
  const nodeRoot = readText("crates/brilliant-kernel-node/src/lib.rs");
  const exports = Array.from(
    nodeRoot.matchAll(/#\[napi\(js_name\s*=\s*"([^"]+)"\)\]/gu),
    (match) => match[1] ?? "",
  ).sort();
  assert.deepEqual(exports, ["createKernelSessionV1", "readKernelSessionV1"]);

  const session = readText("crates/brilliant-kernel-contracts/src/session.rs");
  const codeStart = session.indexOf("pub fn code(&self)");
  const codeEnd = session.indexOf("impl Serialize for StableFailureV1", codeStart);
  assert.notEqual(codeStart, -1);
  assert.notEqual(codeEnd, -1);
  const codeBody = session.slice(codeStart, codeEnd);
  const codes = Array.from(
    codeBody.matchAll(
      /=>\s*(?:\{\s*)?"((?:bridge|codec|contract|score)\.[a-z0-9-]+)"/gu,
    ),
    (match) => match[1] ?? "",
  );
  assert.deepEqual(codes, [...STABLE_FAILURE_CODES]);
  assert.equal(new Set(codes).size, 22);
});

test("TypeScript remains default with exact public 28/51/8/34/9 inventories", () => {
  const manifest = JSON.parse(readText(MANIFEST_PATH)) as {
    readonly commandIds: readonly string[];
    readonly applicationRuntimeExports: readonly string[];
    readonly moduleSdkRuntimeExports: readonly string[];
    readonly moduleSdkTypeExports: readonly string[];
    readonly contributionAbiFields: readonly string[];
  };
  assert.deepEqual(manifest.commandIds, COMMAND_IDS);
  assert.deepEqual(manifest.applicationRuntimeExports, APPLICATION_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkRuntimeExports, MODULE_SDK_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkTypeExports, MODULE_SDK_TYPE_EXPORTS);
  assert.deepEqual(manifest.contributionAbiFields, CONTRIBUTION_ABI_FIELDS);
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map((entry) => entry.commandId),
    COMMAND_IDS,
  );
  assert.deepEqual(Object.keys(coreKernel).sort(), [...APPLICATION_RUNTIME_EXPORTS].sort());
  assert.deepEqual(Object.keys(moduleSdk).sort(), [...MODULE_SDK_RUNTIME_EXPORTS].sort());

  const sdkSource = readText("src/core-kernel/module-sdk/index.ts");
  const typeNames = Array.from(
    sdkSource.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/gmu),
    (match) => match[1] ?? "",
  )
    .flatMap((group) => group.split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort();
  assert.deepEqual(typeNames, [...MODULE_SDK_TYPE_EXPORTS].sort());
  for (const entry of CVN6_REGISTRATION_ENTRIES) {
    assert.deepEqual(Object.keys(entry.contributions[0] ?? {}), CONTRIBUTION_ABI_FIELDS);
  }

  const task = JSON.parse(readText(TASK_PATH)) as {
    readonly meta: Record<string, unknown>;
  };
  const parent = JSON.parse(readText(PARENT_PATH)) as {
    readonly meta: Record<string, unknown>;
  };
  assert.equal(task.meta.default_runtime, "typescript");
  assert.equal(task.meta.default_runtime_switch_authorized, false);
  assert.equal(parent.meta.rkp2_default_runtime, "typescript");
  assert.equal(parent.meta.rkp2_default_runtime_switch_authorized, false);
  assert.equal("createRustKernelSmokeSession" in coreKernel, false);
  assert.equal("readRustKernelSmokeSession" in coreKernel, false);
});

test("Stage 1 fixture helpers are deterministic and detached", () => {
  const first = createMinimalRkp2StoreFixture();
  const second = createMinimalRkp2StoreFixture();
  assert.equal(first.fixtureId, "minimal-score-v1");
  assert.equal(second.fixtureId, "minimal-score-v1");
  assert.notEqual(first, second);
  assert.notEqual(first.document, second.document);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    createRkp2StoreFixtureCatalog().map((fixture) => fixture.fixtureId),
    ["minimal-score-v1"],
  );

  (first.document.metadata as { title: string }).title = "mutated first fixture";
  assert.equal(second.document.metadata.title, "Core fixture");
});
