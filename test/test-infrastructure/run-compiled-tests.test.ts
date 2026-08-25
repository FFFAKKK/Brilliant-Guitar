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
import { PassThrough, Transform, Writable } from "node:stream";
import { test } from "node:test";

import {
  canonicalManifestHeader,
  codeUnitCompare,
  enumerateCompiledTests,
  executeCompiledTests,
  RunnerContractError,
  type DiscoverySeams,
  type ExecutionSeams,
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

function writePackage(repoRoot: string): void {
  writeFileSync(resolve(repoRoot, "package.json"), "{}\n", "utf8");
}

function quietReporter(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(_event, _encoding, callback) {
      callback();
    },
  });
}

function quietSink(options?: { fail?: boolean }): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
    final(callback) {
      callback(options?.fail === true ? new Error("sink failed") : undefined);
    },
  });
}

function scheduledStream(
  schedule: (stream: PassThrough) => void,
): PassThrough {
  const stream = new PassThrough({ objectMode: true });
  queueMicrotask(() => schedule(stream));
  return stream;
}

function emitTestEvent(
  stream: PassThrough,
  type: string,
  data: Readonly<Record<string, unknown>>,
): void {
  stream.emit(type, data);
  stream.write({ type, data });
}

function passingExecutionSeams(
  repoRoot: string,
  capture?: {
    options?: Readonly<{ files: readonly string[]; concurrency: true }>;
    header?: string;
  },
): Partial<ExecutionSeams> {
  return {
    cwd: () => repoRoot,
    nodeVersion: () => "20.20.2",
    run(options) {
      if (capture !== undefined) capture.options = options;
      return scheduledStream((stream) => {
        for (const file of options.files) {
          emitTestEvent(stream, "test:pass", {
            nesting: 0,
            file,
            name: file,
          });
        }
        stream.end();
      });
    },
    reporter: quietReporter,
    reporterSink: quietSink,
    writeManifestHeader(header) {
      if (capture !== undefined) capture.header = header;
    },
  };
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

test("programmatic run receives the exact manifest array and common Node 20 options", async () => {
  const root = fixtureRoot("run-options");
  try {
    writePackage(root);
    writeFixture(root, "alpha.test.js");
    writeFixture(root, "nested/beta.test.js");
    const capture: {
      options?: Readonly<{ files: readonly string[]; concurrency: true }>;
      header?: string;
    } = {};
    const result = await executeCompiledTests(
      root,
      passingExecutionSeams(root, capture),
    );
    assert.deepEqual(capture.options, {
      files: result.request.files,
      concurrency: true,
    });
    assert.equal(Object.isFrozen(result.request.files), true);
    assert.deepEqual(result.request, {
      files: result.request.files,
      cwd: resolve(root),
      isolation: "process",
      concurrency: true,
    });
    assert.equal(capture.header, canonicalManifestHeader(result.manifest));
    assert.equal(
      Object.hasOwn(capture.options ?? {}, "cwd") ||
        Object.hasOwn(capture.options ?? {}, "isolation"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("observer attaches synchronously and accepts Node 20 and Node 24 top-level fixtures", async () => {
  for (const version of ["20.20.2", "24.15.0"]) {
    const root = fixtureRoot(`events-${version}`);
    try {
      writePackage(root);
      writeFixture(root, "single.test.js");
      await executeCompiledTests(root, {
        ...passingExecutionSeams(root),
        nodeVersion: () => version,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("outcome normalizer uses pass data.file as idempotent manifest coverage", async () => {
  const root = fixtureRoot("coverage-success");
  try {
    writePackage(root);
    writeFixture(root, "alpha.test.js");
    writeFixture(root, "nested/beta.test.js");
    await executeCompiledTests(root, {
      ...passingExecutionSeams(root),
      run(options) {
        return scheduledStream((stream) => {
          const [alpha, beta] = options.files;
          assert.ok(alpha);
          assert.ok(beta);
          emitTestEvent(stream, "test:pass", {
            nesting: 0,
            file: alpha,
            name: "opaque internal title",
            details: { type: "fail" },
          });
          emitTestEvent(stream, "test:pass", {
            nesting: 7,
            file: alpha,
            name: resolve(root, "absolute-title-is-not-identity.test.js"),
          });
          emitTestEvent(stream, "test:pass", {
            nesting: 0,
            file: alpha,
            name: beta,
          });
          emitTestEvent(stream, "test:pass", {
            nesting: 3,
            file: beta,
            name: "second opaque title",
          });
          stream.end();
        });
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("outcome normalizer rejects fail, interruption and malformed or partial coverage", async () => {
  const cases: readonly Readonly<{
    code: RunnerContractError["code"];
    emit(stream: PassThrough, files: readonly string[]): void;
    files?: readonly string[];
  }>[] = [
    {
      code: "runner.test-failed",
      emit(stream) {
        emitTestEvent(stream, "test:fail", { nesting: 4 });
        stream.end();
      },
    },
    {
      code: "runner.test-failed",
      emit(stream) {
        emitTestEvent(stream, "test:fail", { nesting: 0 });
        stream.end();
      },
    },
    {
      code: "runner.test-interrupted",
      emit(stream, files) {
        stream.emit("test:interrupted", { nesting: 0, file: files[0] });
        stream.end();
      },
    },
    {
      code: "runner.outcome-missing",
      emit(stream, files) {
        emitTestEvent(stream, "test:complete", {
          nesting: 0,
          file: files[0],
          name: files[0],
          details: { type: "pass" },
        });
        stream.end();
      },
    },
    {
      code: "runner.outcome-path-missing",
      emit(stream, files) {
        emitTestEvent(stream, "test:pass", {
          nesting: 0,
          name: files[0],
        });
        stream.end();
      },
    },
    {
      code: "runner.outcome-path-missing",
      emit(stream, files) {
        emitTestEvent(stream, "test:pass", {
          nesting: 0,
          file: 42,
          name: files[0],
        });
        stream.end();
      },
    },
    {
      code: "runner.outcome-path-missing",
      emit(stream) {
        emitTestEvent(stream, "test:pass", {
          nesting: 0,
          file: "dist/test/single.test.js",
        });
        stream.end();
      },
    },
    {
      code: "runner.outcome-unknown",
      emit(stream, files) {
        emitTestEvent(stream, "test:pass", {
          nesting: 0,
          file: resolve(files[0] ?? "", "..", "outside.test.js"),
          name: files[0],
        });
        stream.end();
      },
    },
    {
      code: "runner.outcome-missing",
      files: ["alpha.test.js", "beta.test.js"],
      emit(stream, files) {
        emitTestEvent(stream, "test:pass", {
          nesting: 2,
          file: files[0],
          name: "only alpha was discovered",
        });
        stream.end();
      },
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const root = fixtureRoot(`outcome-${index}`);
    try {
      writePackage(root);
      for (const file of fixture.files ?? ["single.test.js"]) {
        writeFixture(root, file);
      }
      await rejectsWithCode(
        () =>
          executeCompiledTests(root, {
            ...passingExecutionSeams(root),
            run(options) {
              return scheduledStream((stream) => {
                fixture.emit(stream, options.files);
              });
            },
          }),
        fixture.code,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("stream, run and reporter failures never produce a successful result", async () => {
  const cases: readonly Readonly<{
    code: RunnerContractError["code"];
    overrides(root: string): Partial<ExecutionSeams>;
  }>[] = [
    {
      code: "runner.run-threw",
      overrides(root) {
        return {
          ...passingExecutionSeams(root),
          run() {
            throw new Error("run failed");
          },
        };
      },
    },
    {
      code: "runner.stream-error",
      overrides(root) {
        return {
          ...passingExecutionSeams(root),
          run() {
            return scheduledStream((stream) => {
              stream.destroy(new Error("stream failed"));
            });
          },
        };
      },
    },
    {
      code: "runner.stream-aborted",
      overrides(root) {
        return {
          ...passingExecutionSeams(root),
          run() {
            return scheduledStream((stream) => {
              stream.emit("aborted");
              stream.end();
            });
          },
        };
      },
    },
    {
      code: "runner.stream-incomplete",
      overrides(root) {
        return {
          ...passingExecutionSeams(root),
          run(options) {
            return scheduledStream((stream) => {
              emitTestEvent(stream, "test:pass", {
                nesting: 0,
                file: options.files[0],
                name: "pass before premature close",
              });
              stream.emit("close");
              stream.end();
            });
          },
        };
      },
    },
    {
      code: "runner.reporter-failed",
      overrides(root) {
        return {
          ...passingExecutionSeams(root),
          reporterSink: () => quietSink({ fail: true }),
        };
      },
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const root = fixtureRoot(`stream-${index}`);
    try {
      writePackage(root);
      writeFixture(root, "single.test.js");
      await rejectsWithCode(
        () => executeCompiledTests(root, fixture.overrides(root)),
        fixture.code,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("repository and supported-version preflights fail before run", async () => {
  const root = fixtureRoot("preflight");
  try {
    writePackage(root);
    writeFixture(root, "single.test.js");
    let runCalls = 0;
    await rejectsWithCode(
      () =>
        executeCompiledTests(root, {
          ...passingExecutionSeams(root),
          cwd: () => resolve(root, ".."),
          run() {
            runCalls += 1;
            return new PassThrough({ objectMode: true });
          },
        }),
      "runner.repository-cwd",
    );
    await rejectsWithCode(
      () =>
        executeCompiledTests(root, {
          ...passingExecutionSeams(root),
          nodeVersion: () => "19.9.0",
          run() {
            runCalls += 1;
            return new PassThrough({ objectMode: true });
          },
        }),
      "runner.node-unsupported",
    );
    assert.equal(runCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
