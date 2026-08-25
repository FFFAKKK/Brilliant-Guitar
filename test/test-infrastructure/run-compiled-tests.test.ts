import assert = require("node:assert/strict");
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

function quietSink(options?: { fail?: boolean; slow?: boolean }): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      if (options?.slow === true) {
        setImmediate(callback);
      } else {
        callback();
      }
    },
    final(callback) {
      callback(options?.fail === true ? new Error("sink failed") : undefined);
    },
  });
}

function failingReporterTransform(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(_event, _encoding, callback) {
      callback(new Error("reporter transform failed"));
    },
  });
}

function independentlyEnumerateCompiledTests(repoRoot: string): string[] {
  const root = resolve(repoRoot, "dist/test");
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false);
      const absolute = resolve(directory, entry.name);
      const stats = lstatSync(absolute);
      assert.equal(stats.isSymbolicLink(), false);
      if (stats.isDirectory()) {
        visit(absolute);
      } else if (stats.isFile() && entry.name.endsWith(".test.js")) {
        files.push(absolute.slice(root.length + 1).replaceAll("\\", "/"));
      }
    }
  };
  visit(root);
  return files.sort(codeUnitCompare);
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
    writePackage(root);
    writeFixture(root, "real/inside.test.js");
    const testRoot = resolve(root, "dist/test");
    symlinkSync(resolve(testRoot, "real"), resolve(testRoot, "linked"), "junction");
    let runCalls = 0;
    await rejectsWithCode(
      () =>
        executeCompiledTests(root, {
          ...passingExecutionSeams(root),
          run() {
            runCalls += 1;
            return new PassThrough({ objectMode: true });
          },
        }),
      "runner.entry-symbolic",
    );
    assert.equal(runCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "root junction, unsupported entry and invalid repository fail before run",
  { timeout: 5_000 },
  async () => {
    const rootSymbolic = fixtureRoot("root-symbolic");
    const unsupported = fixtureRoot("unsupported-entry");
    const invalidRepository = fixtureRoot("invalid-repository");
    try {
      writePackage(rootSymbolic);
      const target = resolve(rootSymbolic, "compiled-target");
      mkdirSync(target, { recursive: true });
      writeFileSync(resolve(target, "inside.test.js"), "// compiled fixture\n", "utf8");
      mkdirSync(resolve(rootSymbolic, "dist"), { recursive: true });
      symlinkSync(target, resolve(rootSymbolic, "dist/test"), "junction");

      writePackage(unsupported);
      const unsupportedPath = writeFixture(unsupported, "unsupported.entry");
      const unsupportedSeams: DiscoverySeams = {
        async lstat(path) {
          const stats = await lstat(path, { bigint: true });
          return path === unsupportedPath
            ? {
                dev: stats.dev,
                ino: stats.ino,
                isDirectory: () => false,
                isFile: () => false,
                isSymbolicLink: () => false,
              }
            : stats;
        },
        async readdir(path) {
          return readdir(path, { withFileTypes: true });
        },
      };

      writeFixture(invalidRepository, "single.test.js");

      const fixtures: readonly Readonly<{
        root: string;
        code: RunnerContractError["code"];
        discovery?: DiscoverySeams;
      }>[] = [
        { root: rootSymbolic, code: "runner.root-symbolic" },
        {
          root: unsupported,
          code: "runner.entry-unsupported",
          discovery: unsupportedSeams,
        },
        {
          root: invalidRepository,
          code: "runner.repository-invalid",
        },
      ];

      for (const fixture of fixtures) {
        let runCalls = 0;
        await rejectsWithCode(
          () =>
            executeCompiledTests(
              fixture.root,
              {
                ...passingExecutionSeams(fixture.root),
                run() {
                  runCalls += 1;
                  return new PassThrough({ objectMode: true });
                },
              },
              fixture.discovery,
            ),
          fixture.code,
        );
        assert.equal(runCalls, 0, `${fixture.code} must fail before run()`);
      }
    } finally {
      rmSync(rootSymbolic, { recursive: true, force: true });
      rmSync(unsupported, { recursive: true, force: true });
      rmSync(invalidRepository, { recursive: true, force: true });
    }
  },
);

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
  const fixtures = [
    { version: "20.20.2", details: { duration_ms: 1 } },
    { version: "24.15.0", details: { duration_ms: 1, type: "test" } },
  ] as const;
  for (const fixture of fixtures) {
    const root = fixtureRoot(`events-${fixture.version}`);
    try {
      writePackage(root);
      writeFixture(root, "single.test.js");
      await executeCompiledTests(root, {
        ...passingExecutionSeams(root),
        nodeVersion: () => fixture.version,
        run(options) {
          return scheduledStream((stream) => {
            emitTestEvent(stream, "test:pass", {
              nesting: 9,
              file: options.files[0],
              name: "opaque title",
              details: fixture.details,
            });
            stream.end();
          });
        },
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

test("reporter backpressure cannot change structured file coverage", async () => {
  for (const slow of [false, true]) {
    const root = fixtureRoot(`reporter-${slow ? "slow" : "fast"}`);
    try {
      writePackage(root);
      writeFixture(root, "first.test.js");
      writeFixture(root, "second.test.js");
      await executeCompiledTests(root, {
        ...passingExecutionSeams(root),
        reporterSink: () => quietSink({ slow }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("real Node empty and all-skipped files satisfy the same data.file coverage", () => {
  const root = fixtureRoot("real-empty-skip");
  try {
    writePackage(root);
    writeFixture(root, "empty.test.js");
    const skipped = writeFixture(root, "nested/all-skipped.test.js");
    writeFileSync(
      skipped,
      'const { test } = require("node:test");\ntest.skip("skipped", () => {});\n',
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      [resolve(__dirname, "run-compiled-tests.js")],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      },
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const header = JSON.parse(result.stdout.split(/\r?\n/u)[0] ?? "") as {
      kind?: unknown;
      fileCount?: unknown;
      sha256?: unknown;
    };
    const files = ["empty.test.js", "nested/all-skipped.test.js"];
    assert.deepEqual(header, {
      kind: "full-test-manifest-v1",
      fileCount: 2,
      sha256: createHash("sha256")
        .update(`${files.join("\n")}\n`, "utf8")
        .digest("hex"),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hard-link aliases and invalid identity prevent every runner call", async () => {
  const root = fixtureRoot("pre-run-identity");
  try {
    writePackage(root);
    const original = writeFixture(root, "original.test.js");
    linkSync(original, resolve(root, "dist/test/alias.test.js"));
    let runCalls = 0;
    await rejectsWithCode(
      () =>
        executeCompiledTests(root, {
          ...passingExecutionSeams(root),
          run() {
            runCalls += 1;
            return new PassThrough({ objectMode: true });
          },
        }),
      "runner.physical-alias",
    );
    assert.equal(runCalls, 0);

    rmSync(resolve(root, "dist/test/alias.test.js"));
    const nonBigIntIdentity: DiscoverySeams = {
      async lstat(path) {
        const stats = await lstat(path, { bigint: true });
        return path === original
          ? {
              dev: 1,
              ino: 2n,
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
      () =>
        executeCompiledTests(
          root,
          {
            ...passingExecutionSeams(root),
            run() {
              runCalls += 1;
              return new PassThrough({ objectMode: true });
            },
          },
          nonBigIntIdentity,
        ),
      "runner.identity-unavailable",
    );
    assert.equal(runCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current compiled tree independently equals the emitted manifest set and hash", async () => {
  const discovery = await enumerateCompiledTests(process.cwd());
  const independent = independentlyEnumerateCompiledTests(process.cwd());
  assert.deepEqual(discovery.manifest.files, independent);
  assert.equal(discovery.manifest.fileCount, independent.length);
  assert.equal(
    discovery.manifest.sha256,
    createHash("sha256")
      .update(`${independent.join("\n")}\n`, "utf8")
      .digest("hex"),
  );
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

test(
  "first structured failure survives a later reporter pipeline failure",
  { timeout: 5_000 },
  async () => {
    const cases: readonly Readonly<{
      label: string;
      code: RunnerContractError["code"];
      emit(stream: PassThrough, files: readonly string[]): void;
      reporterFailure: "sink-final" | "transform";
    }>[] = [
      {
        label: "nested-fail-then-sink-final",
        code: "runner.test-failed",
        emit(stream) {
          emitTestEvent(stream, "test:fail", { nesting: 4 });
          stream.end();
        },
        reporterFailure: "sink-final",
      },
      {
        label: "top-level-fail-then-transform",
        code: "runner.test-failed",
        emit(stream) {
          emitTestEvent(stream, "test:fail", { nesting: 0 });
          stream.end();
        },
        reporterFailure: "transform",
      },
      {
        label: "interrupted-then-sink-final",
        code: "runner.test-interrupted",
        emit(stream) {
          stream.emit("test:interrupted", { nesting: 0 });
          stream.end();
        },
        reporterFailure: "sink-final",
      },
      {
        label: "missing-pass-file-then-sink-final",
        code: "runner.outcome-path-missing",
        emit(stream) {
          emitTestEvent(stream, "test:pass", { nesting: 0 });
          stream.end();
        },
        reporterFailure: "sink-final",
      },
      {
        label: "non-string-pass-file-then-transform",
        code: "runner.outcome-path-missing",
        emit(stream) {
          emitTestEvent(stream, "test:pass", { nesting: 0, file: 42 });
          stream.end();
        },
        reporterFailure: "transform",
      },
      {
        label: "relative-pass-file-then-sink-final",
        code: "runner.outcome-path-missing",
        emit(stream) {
          emitTestEvent(stream, "test:pass", {
            nesting: 0,
            file: "dist/test/single.test.js",
          });
          stream.end();
        },
        reporterFailure: "sink-final",
      },
      {
        label: "unknown-pass-file-then-transform",
        code: "runner.outcome-unknown",
        emit(stream, files) {
          emitTestEvent(stream, "test:pass", {
            nesting: 0,
            file: resolve(files[0] ?? "", "..", "unknown.test.js"),
          });
          stream.end();
        },
        reporterFailure: "transform",
      },
      {
        label: "valid-pass-then-sink-final",
        code: "runner.reporter-failed",
        emit(stream, files) {
          emitTestEvent(stream, "test:pass", { nesting: 0, file: files[0] });
          stream.end();
        },
        reporterFailure: "sink-final",
      },
      {
        label: "stream-error-before-reporter-failure",
        code: "runner.stream-error",
        emit(stream) {
          stream.destroy(new Error("stream failed first"));
        },
        reporterFailure: "sink-final",
      },
      {
        label: "stream-abort-before-reporter-failure",
        code: "runner.stream-aborted",
        emit(stream) {
          stream.emit("aborted");
          stream.end();
        },
        reporterFailure: "sink-final",
      },
    ];

    for (const fixture of cases) {
      const root = fixtureRoot(`first-failure-${fixture.label}`);
      try {
        writePackage(root);
        writeFixture(root, "single.test.js");
        await rejectsWithCode(
          () =>
            executeCompiledTests(root, {
              ...passingExecutionSeams(root),
              run(options) {
                return scheduledStream((stream) => fixture.emit(stream, options.files));
              },
              reporter:
                fixture.reporterFailure === "transform"
                  ? failingReporterTransform
                  : quietReporter,
              reporterSink: () => quietSink({ fail: true }),
            }),
          fixture.code,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
);

test(
  "reporter factory, sink factory and transform failures settle fail closed",
  { timeout: 5_000 },
  async () => {
    const cases: readonly Readonly<{
      label: string;
      overrides(root: string): Partial<ExecutionSeams>;
    }>[] = [
      {
        label: "reporter-factory",
        overrides(root) {
          return {
            ...passingExecutionSeams(root),
            reporter() {
              throw new Error("reporter factory failed");
            },
          };
        },
      },
      {
        label: "reporter-sink-factory",
        overrides(root) {
          return {
            ...passingExecutionSeams(root),
            reporterSink() {
              throw new Error("reporter sink factory failed");
            },
          };
        },
      },
      {
        label: "reporter-transform-callback",
        overrides(root) {
          return {
            ...passingExecutionSeams(root),
            reporter: failingReporterTransform,
          };
        },
      },
    ];

    for (const fixture of cases) {
      const root = fixtureRoot(fixture.label);
      try {
        writePackage(root);
        writeFixture(root, "single.test.js");
        await rejectsWithCode(
          () => executeCompiledTests(root, fixture.overrides(root)),
          "runner.reporter-failed",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
);

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
