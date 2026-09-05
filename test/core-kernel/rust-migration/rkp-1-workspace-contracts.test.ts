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

const PLANNING_HEAD = "89115daedc623c0d35386a4a433cc7fd95215223";
const REPAIRED_PLANNING_HEAD =
  "b944876aefc2b359b459bb8565afa38c0635765b";
const AUDITED_IMPLEMENTATION_HEAD =
  "94387b339b5e4d9ce6b7f97597a1b56edd051f01";
const MATRIX_PATH =
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/file-test-and-rollback-matrix.md";
const ARCHIVED_TASK_PATH =
  ".trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/task.json";
const PARENT_PATH =
  ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";

const ACCEPTED_PLANNING_ONLY_PATHS = new Set([
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/check.jsonl",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/design.md",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/implement.jsonl",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/implement.md",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/prd.md",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/cvn7-historical-boundary-repair.md",
  ".trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/file-test-and-rollback-matrix.md",
]);

const CRATES = [
  "brilliant-core-types",
  "brilliant-score-foundation",
  "brilliant-extension-protocol",
  "brilliant-kernel-contracts",
  "brilliant-kernel-runtime",
  "brilliant-kernel-session",
  "brilliant-kernel-node",
] as const;

const NON_NODE_CRATES = CRATES.filter(
  (name) => name !== "brilliant-kernel-node",
);

const EXPECTED_GRAPH: Readonly<Record<(typeof CRATES)[number], readonly string[]>> = {
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

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

function git(args: readonly string[]): string {
  return execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function lines(value: string): string[] {
  return value === ""
    ? []
    : value.split(/\r?\n/u).filter((line) => line !== "");
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

function projectDependencies(source: string): string[] {
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

function reviewedAllowlistAt(commit: string): string[] {
  const matrix = git(["show", `${commit}:${MATRIX_PATH}`]);
  const futureSection = matrix.split("## Stage ownership and rollback", 1)[0] ?? "";
  const paths: string[] = [];
  for (const match of futureSection.matchAll(/```text\r?\n([\s\S]*?)```/gu)) {
    for (const path of lines(match[1] ?? "")) {
      paths.push(path.trim());
    }
  }
  return paths;
}

function auditedImplementationChangedPaths(): Set<string> {
  const paths = new Set<string>(
    lines(
      git([
        "diff",
        "--name-only",
        `${PLANNING_HEAD}..${AUDITED_IMPLEMENTATION_HEAD}`,
      ]),
    ),
  );
  for (const path of ACCEPTED_PLANNING_ONLY_PATHS) {
    paths.delete(path);
  }
  return paths;
}

test("implementation diff is a literal subset of the audited allowlist", () => {
  const originalPaths = reviewedAllowlistAt(PLANNING_HEAD);
  const repairedPaths = reviewedAllowlistAt(REPAIRED_PLANNING_HEAD);
  const originalAllowlist = new Set(originalPaths);
  const allowlist = new Set(repairedPaths);
  const changed = auditedImplementationChangedPaths();
  assert.equal(originalPaths.length, 39);
  assert.equal(originalAllowlist.size, 39);
  assert.equal(repairedPaths.length, 40);
  assert.equal(allowlist.size, 40);
  assert.deepEqual(
    [...originalAllowlist].filter((path) => !allowlist.has(path)),
    [],
  );
  assert.deepEqual(
    [...allowlist].filter((path) => !originalAllowlist.has(path)),
    ["test/core-kernel/cvn-7-qualification-boundary.test.ts"],
  );
  for (const path of allowlist) {
    assert.doesNotThrow(
      () => git(["cat-file", "-e", `${AUDITED_IMPLEMENTATION_HEAD}:${path}`]),
      `missing audited allowlist path: ${path}`,
    );
  }
  for (const path of changed) {
    assert.equal(allowlist.has(path), true, `unreviewed changed path: ${path}`);
  }

  const changedRuntimePaths = [...changed].filter(
    (path) => path.startsWith("src/") || path.startsWith("test/"),
  );
  assert.deepEqual(changedRuntimePaths.sort(), [
    "src/core-kernel/native/rust-kernel-smoke.ts",
    "test/core-kernel/cvn-7-qualification-boundary.test.ts",
    "test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts",
    "test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts",
  ]);
  for (const protectedPath of [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src/core-kernel/index.ts",
    "src/core-kernel/module-sdk/index.ts",
  ]) {
    assert.equal(changed.has(protectedPath), false, protectedPath);
  }
});

test("Cargo workspace, pins, features and direct dependency graph are exact", () => {
  const root = readText("Cargo.toml");
  assert.match(root, /resolver\s*=\s*"3"/u);
  assert.match(root, /edition\s*=\s*"2024"/u);
  assert.match(root, /rust-version\s*=\s*"1\.88\.0"/u);
  assert.match(root, /serde\s*=\s*\{ version = "=1\.0\.229", features = \["derive"\] \}/u);
  assert.match(root, /serde_json\s*=\s*\{ version = "=1\.0\.151", features = \["float_roundtrip"\] \}/u);
  assert.match(root, /napi\s*=\s*\{ version = "=3\.12\.0", default-features = false \}/u);
  assert.match(root, /napi-derive\s*=\s*\{ version = "=3\.6\.2", default-features = false, features = \["strict"\] \}/u);
  assert.match(root, /napi-build\s*=\s*"=2\.4\.0"/u);

  const workspaceMembers = lines(section(root, "workspace"))
    .filter((line) => line.includes("crates/"))
    .map((line) => /"crates\/([^"/]+)"/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  assert.deepEqual(workspaceMembers, [...CRATES, ...CRATES]);

  const actualCrates = readdirSync(resolve("crates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualCrates, [...CRATES].sort());

  for (const crate of CRATES) {
    const manifest = readText(`crates/${crate}/Cargo.toml`);
    assert.deepEqual(
      projectDependencies(manifest).sort(),
      [...EXPECTED_GRAPH[crate]].sort(),
    );
    if (crate === "brilliant-kernel-node") {
      assert.equal(section(manifest, "lib").trim(), 'crate-type = ["cdylib"]');
      assert.equal(
        section(manifest, "features").trim(),
        'default = ["node-api-v8"]\nnode-api-v8 = ["napi/napi8"]',
      );
    } else {
      assert.equal(section(manifest, "features").trim(), "default = []");
    }
  }

  const toolchain = readText("rust-toolchain.toml");
  assert.match(toolchain, /channel\s*=\s*"1\.97\.1"/u);
  assert.match(toolchain, /profile\s*=\s*"minimal"/u);
  assert.match(toolchain, /components\s*=\s*\["rustfmt", "clippy"\]/u);
  assert.equal(
    readText("rustfmt.toml"),
    'edition = "2024"\nnewline_style = "Auto"\n',
  );
  for (const file of rustFiles("crates")) {
    assert.doesNotMatch(readText(file), /\r/u, `non-normalized scan input: ${file}`);
  }
  assert.equal(readText("Cargo.lock").includes('name = "brilliant-kernel-node"'), true);

  const allManifests = ["Cargo.toml", ...CRATES.map((crate) => `crates/${crate}/Cargo.toml`)]
    .map(readText)
    .join("\n");
  for (const forbidden of [
    "anyhow",
    "thiserror",
    "tokio",
    "tracing",
    "wasm-bindgen",
    "tauri",
  ]) {
    assert.equal(allManifests.includes(forbidden), false, forbidden);
  }
});

test("strict codec duplicate lookup cannot regress to a per-member linear scan", () => {
  const codec = readText("crates/brilliant-kernel-contracts/src/codec.rs");
  const mapVisitorStart = codec.indexOf("fn visit_map");
  const mapVisitorEnd = codec.indexOf("fn strict_json", mapVisitorStart);
  assert.notEqual(mapVisitorStart, -1);
  assert.notEqual(mapVisitorEnd, -1);
  const mapVisitor = codec.slice(mapVisitorStart, mapVisitorEnd);
  assert.doesNotMatch(mapVisitor, /\.iter\(\)\s*\.any\s*\(/u);
  assert.match(mapVisitor, /BTreeMap|\.entry\s*\(/u);
});

test("unsafe ownership is confined to boundary.rs with exact production call sites", () => {
  const files = rustFiles("crates");
  const boundaryPath = "crates/brilliant-kernel-node/src/boundary.rs";
  for (const crate of NON_NODE_CRATES) {
    assert.equal(
      readText(`crates/${crate}/src/lib.rs`).startsWith("#![forbid(unsafe_code)]"),
      true,
      crate,
    );
  }
  const nodeRoot = readText("crates/brilliant-kernel-node/src/lib.rs");
  assert.equal(nodeRoot.startsWith("#![deny(unsafe_code)]\n#![deny(unsafe_op_in_unsafe_fn)]"), true);
  assert.equal(
    (nodeRoot.match(/#\[allow\(unsafe_code\)\]\s*\r?\nmod boundary;/gu) ?? []).length,
    1,
  );

  const lintLowerings = files.flatMap((file) =>
    lines(readText(file))
      .filter((line) => line.includes("#[allow("))
      .map((line) => `${file}:${line.trim()}`),
  );
  assert.deepEqual(lintLowerings, [
    "crates/brilliant-kernel-node/src/lib.rs:#[allow(unsafe_code)]",
  ]);

  for (const file of files) {
    if (file === boundaryPath) {
      continue;
    }
    const source = readText(file);
    assert.doesNotMatch(source, /unsafe\s*(?:\{|fn\b|extern\b|impl\b|trait\b)/u, file);
  }

  const boundary = readText(boundaryPath);
  const boundaryLines = boundary.split(/\r?\n/u);
  boundaryLines.forEach((line, index) => {
    if (/unsafe\s*(?:\{|extern\b|fn\b|impl\b|trait\b)/u.test(line)) {
      const context = boundaryLines.slice(Math.max(0, index - 3), index).join("\n");
      assert.match(context, /\/\/ SAFETY:/u, `missing SAFETY before line ${index + 1}`);
    }
  });

  const production = boundary.split("#[cfg(test)]", 1)[0] ?? "";
  for (const call of [
    "napi_wrap",
    "tag_object",
    "validate_type_tag",
    "napi_unwrap",
    "napi_remove_wrap",
    "Box::from_raw",
  ]) {
    const escaped = call.replaceAll("::", "\\s*::\\s*");
    assert.equal(
      (production.match(new RegExp(`${escaped}\\s*\\(`, "gu")) ?? []).length,
      1,
      call,
    );
  }
  assert.doesNotMatch(production, /wrap_and_tag|napi_add_finalizer/u);
  assert.doesNotMatch(production, /\.(?:unwrap|expect)\s*\(|panic!\s*\(/u);

  assert.deepEqual(
    Array.from(
      nodeRoot.matchAll(/#\[napi\(js_name\s*=\s*"([^"]+)"\)\]/gu),
      (match) => match[1] ?? "",
    ).sort(),
    [
      "createKernelSessionV1",
      "operateKernelStage4V1",
      "readKernelSessionV1",
      "replayKernelStage4V1",
    ],
  );
  assert.equal((nodeRoot.match(/#\[napi(?:\([^\]]*\))?\]/gu) ?? []).length, 5);
  assert.doesNotMatch(nodeRoot, /#\[napi\([^\]]*(?:object|class|constructor|method)/u);
  assert.match(boundary, /0x4252_494c_4c49_414e/u);
  assert.match(boundary, /0x545f_524b_5031_5f31/u);
});

test("RKP-0 inventories and the TypeScript default public surface have zero drift", () => {
  const manifest = JSON.parse(readText(MANIFEST_PATH)) as {
    readonly persistedSchema: string;
    readonly commandIds: readonly string[];
    readonly applicationRuntimeExports: readonly string[];
    readonly moduleSdkRuntimeExports: readonly string[];
    readonly moduleSdkTypeExports: readonly string[];
    readonly contributionAbiFields: readonly string[];
  };
  assert.equal(manifest.persistedSchema, "brilliant-score-1");
  assert.equal(manifest.commandIds.length, 28);
  assert.equal(manifest.applicationRuntimeExports.length, 51);
  assert.equal(manifest.moduleSdkRuntimeExports.length, 8);
  assert.equal(manifest.moduleSdkTypeExports.length, 34);
  assert.equal(manifest.contributionAbiFields.length, 9);
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map((entry) => entry.commandId),
    manifest.commandIds,
  );
  assert.deepEqual(
    Object.keys(coreKernel).sort(),
    [...manifest.applicationRuntimeExports].sort(),
  );
  assert.deepEqual(
    Object.keys(moduleSdk).sort(),
    [...manifest.moduleSdkRuntimeExports].sort(),
  );
  assert.equal("createRustKernelSmokeSession" in coreKernel, false);
  assert.equal("readRustKernelSmokeSession" in coreKernel, false);
  assert.doesNotMatch(readText("src/core-kernel/index.ts"), /rust-kernel-smoke/u);
});

test("archived RKP-1 lifecycle facts remain durable", () => {
  const task = JSON.parse(readText(ARCHIVED_TASK_PATH)) as {
    readonly status: string;
    readonly meta: Record<string, unknown>;
  };
  const parent = JSON.parse(readText(PARENT_PATH)) as {
    readonly status: string;
    readonly children: readonly string[];
    readonly meta: Record<string, unknown>;
  };
  assert.equal(task.status, "completed");
  assert.equal(task.meta.implementation_review, "passed");
  assert.equal(task.meta.implementation_rereview, "passed");
  assert.equal(task.meta.audited_implementation_commit, AUDITED_IMPLEMENTATION_HEAD);
  assert.equal(task.meta.default_runtime, "typescript");
  assert.equal(task.meta.default_runtime_switch_authorized, false);
  assert.equal(parent.meta.rkp1_status, "accepted_archived");
  assert.equal(parent.meta.rkp1_implementation_stage, "accepted_archived");
  assert.equal(parent.meta.rkp1_audited_implementation_commit, AUDITED_IMPLEMENTATION_HEAD);
  assert.equal(
    parent.children.filter(
      (child) =>
        child === "08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke",
    ).length,
    1,
  );
});
