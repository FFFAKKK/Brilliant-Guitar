import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  canonicalManifestHeader,
  codeUnitCompare,
  enumerateCompiledTests,
  RunnerContractError,
  type DiscoverySeams,
} from "./run-compiled-tests";

function fixtureRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `full-runner-${label}-`));
}

function writeFixture(repoRoot: string, relativePath: string): string {
  const absolutePath = resolve(repoRoot, "dist/test", relativePath);
  mkdirSync(resolve(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, "// compiled fixture\n", "utf8");
  return absolutePath;
}

async function rejectsWithCode(
  action: () => Promise<unknown>,
  code: RunnerContractError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof RunnerContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("compiled test discovery is deterministic, literal and deeply detached", async () => {
  const root = fixtureRoot("enumeration");
  try {
    writeFixture(root, "z last.test.js");
    writeFixture(root, "nested/éclair.test.js");
    writeFixture(root, "nested/deep/Alpha.test.js");
    writeFixture(root, "nested/not-a-test.js");

    const reverseDirectoryOrder: DiscoverySeams = {
      async lstat(path) {
        return lstat(path, { bigint: true });
      },
      async readdir(path) {
        return (await readdir(path, { withFileTypes: true })).reverse();
      },
    };
    const discovery = await enumerateCompiledTests(root, reverseDirectoryOrder);
    const expected = [
      "nested/deep/Alpha.test.js",
      "nested/éclair.test.js",
      "z last.test.js",
    ].sort(codeUnitCompare);
    assert.deepEqual(discovery.manifest.files, expected);
    assert.deepEqual(
      discovery.absoluteFiles,
      expected.map((file) => resolve(root, "dist/test", file)),
    );
    assert.equal(discovery.manifest.fileCount, expected.length);
    assert.equal(
      discovery.manifest.sha256,
      createHash("sha256")
        .update(`${expected.join("\n")}\n`, "utf8")
        .digest("hex"),
    );
    assert.deepEqual(JSON.parse(canonicalManifestHeader(discovery.manifest)), {
      kind: "full-test-manifest-v1",
      fileCount: expected.length,
      sha256: discovery.manifest.sha256,
    });
    assert.equal(Object.isFrozen(discovery), true);
    assert.equal(Object.isFrozen(discovery.manifest), true);
    assert.equal(Object.isFrozen(discovery.manifest.files), true);
    assert.equal(Object.isFrozen(discovery.absoluteFiles), true);
    assert.throws(() => {
      (discovery.manifest.files as string[]).push("mutated.test.js");
    }, TypeError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing, non-directory and empty compiled roots fail closed", async () => {
  const missing = fixtureRoot("missing");
  const fileRoot = fixtureRoot("file-root");
  const empty = fixtureRoot("empty");
  try {
    await rejectsWithCode(
      () => enumerateCompiledTests(missing),
      "runner.root-missing",
    );
    mkdirSync(resolve(fileRoot, "dist"), { recursive: true });
    writeFileSync(resolve(fileRoot, "dist/test"), "not a directory", "utf8");
    await rejectsWithCode(
      () => enumerateCompiledTests(fileRoot),
      "runner.root-not-directory",
    );
    mkdirSync(resolve(empty, "dist/test"), { recursive: true });
    await rejectsWithCode(() => enumerateCompiledTests(empty), "runner.empty");
  } finally {
    rmSync(missing, { recursive: true, force: true });
    rmSync(fileRoot, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

test("symbolic and junction-style entries are rejected before traversal", async () => {
  const root = fixtureRoot("symbolic");
  try {
    writeFixture(root, "real/inside.test.js");
    const testRoot = resolve(root, "dist/test");
    symlinkSync(resolve(testRoot, "real"), resolve(testRoot, "linked"), "junction");
    await rejectsWithCode(
      () => enumerateCompiledTests(root),
      "runner.entry-symbolic",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real hard links are rejected as physical aliases before publication", async () => {
  const root = fixtureRoot("hardlink");
  try {
    const original = writeFixture(root, "original.test.js");
    linkSync(original, resolve(root, "dist/test/alias.test.js"));
    await rejectsWithCode(
      () => enumerateCompiledTests(root),
      "runner.physical-alias",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("normalized duplicates and unavailable physical identities fail closed", async () => {
  const root = fixtureRoot("identity");
  try {
    const file = writeFixture(root, "one.test.js");
    const duplicateEntries: DiscoverySeams = {
      async lstat(path) {
        return lstat(path, { bigint: true });
      },
      async readdir(path) {
        const entries = await readdir(path, { withFileTypes: true });
        return path === resolve(root, "dist/test")
          ? [...entries, ...entries]
          : entries;
      },
    };
    await rejectsWithCode(
      () => enumerateCompiledTests(root, duplicateEntries),
      "runner.path-duplicate",
    );

    const unavailableIdentity: DiscoverySeams = {
      async lstat(path) {
        const stats = await lstat(path, { bigint: true });
        return path === file
          ? {
              dev: 0n,
              ino: 0n,
              isDirectory: () => stats.isDirectory(),
              isFile: () => stats.isFile(),
              isSymbolicLink: () => stats.isSymbolicLink(),
            }
          : stats;
      },
      async readdir(path) {
        return readdir(path, { withFileTypes: true });
      },
    };
    await rejectsWithCode(
      () => enumerateCompiledTests(root, unavailableIdentity),
      "runner.identity-unavailable",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest growth is dynamic and never depends on a count constant", async () => {
  const root = fixtureRoot("growth");
  try {
    writeFixture(root, "first.test.js");
    const before = await enumerateCompiledTests(root);
    writeFixture(root, "nested/second.test.js");
    const after = await enumerateCompiledTests(root);
    assert.equal(after.manifest.fileCount, before.manifest.fileCount + 1);
    assert.notEqual(after.manifest.sha256, before.manifest.sha256);
    assert.deepEqual(before.manifest.files, ["first.test.js"]);
    assert.deepEqual(after.manifest.files, [
      "first.test.js",
      "nested/second.test.js",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
