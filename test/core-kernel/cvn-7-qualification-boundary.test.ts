import assert = require("node:assert/strict");
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  CVN7_EVIDENCE_SCHEMA_VERSION,
  CVN7_FUNCTIONAL_TIMEOUT_MS,
  CVN7_MEASURED_COUNT,
  CVN7_OPERATION_BUDGETS_MS,
  CVN7_OPERATIONS,
  CVN7_PORTABLE_RATIO_LIMIT,
  CVN7_QUALIFICATION_BASE,
  CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES,
  CVN7_STRESS_RSS_LIMIT_BYTES,
  CVN7_TASK_ID,
  CVN7_WARMUP_COUNT,
  CVN7_SAMPLE_TIMEOUT_MS,
  CVN7_STRESS_TIMEOUT_MS,
  CVN7_TIMEOUT_GRACE_MS,
} from "./qualification/cvn-7-qualification-contracts";
import {
  CVN7_FIXTURE_GENERATOR_VERSION,
  CVN7_FIXTURE_SEEDS,
  createCvn7QualificationScore,
} from "./fixtures/cvn-7-qualification-score";
import {
  classifyQualificationGates,
  createBenchmarkOperation,
  medianOf20,
  nearestRankP95Of20,
  validateBenchmarkOperation,
  validateQualificationEvidenceSet,
} from "./qualification/cvn-7-evidence-validator";
import {
  CAPTURED_NPM_EXEC_PATH,
  canonicalizeWorktreeRoot,
  completeTimedOutWorkerCleanup,
  decodeStressWorkerEnvelope,
  nativeExecutableOutput,
  npmCliOutput,
  parseNodeTestSummary,
  validateNpmCliJavaScriptPath,
  worktreeScopedGitOutput,
} from "./qualification/cvn-7-runner";
import { CVN7_CONTRACT_TRACE } from "./qualification/cvn-7-contract-trace";
import {
  collectStressSubmitOutcomes,
  maxRssKilobytesToBytes,
  runQualificationWorker,
} from "./qualification/cvn-7-worker";

const PROTECTED_BASELINE =
  "38afdc3fd508dc67f7aa446fd323837a5d550b70" as const;

function gitOutput(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function createSyntheticEvidenceSet() {
  const header = {
    schemaVersion: 1 as const,
    taskId: CVN7_TASK_ID,
    qualificationBaseCommit: CVN7_QUALIFICATION_BASE,
    candidateCommit: "1".repeat(40),
    harnessCommit: "2".repeat(40),
    generatedAtUtc: "2026-08-13T00:00:00.000Z",
  };
  const representativeProvenance = {
    generatorVersion: 1 as const,
    fixtureKind: "representative" as const,
    seed: "cvn7-representative-v1",
  };
  const memory = {
    setupBeforeHeapUsedBytes: 1,
    operationBeforeHeapUsedBytes: 2,
    operationAfterHeapUsedBytes: 3,
    resultEncodeAfterHeapUsedBytes: 4,
    observedPeakHeapUsedBytes: 4,
    maxRssRaw: 1_024,
    maxRssPlatformUnit: "kilobytes" as const,
    maxRssBytes: 1_048_576,
  };
  const pairs = (candidateMultiplier = 1) =>
    Array.from({ length: 20 }, (_, pairIndex) => ({
      pairIndex,
      invocationOrder: pairIndex % 2 === 0
        ? ("baseline-then-candidate" as const)
        : ("candidate-then-baseline" as const),
      baselineDurationMs: pairIndex + 1,
      candidateDurationMs: (pairIndex + 1) * candidateMultiplier,
    }));
  const portableOperations = CVN7_OPERATIONS.map((operation) =>
    createBenchmarkOperation(operation, pairs(), false),
  );
  const checks = [
    ["nodeVersion", true],
    ["platform", true],
    ["arch", true],
    ["osType", true],
    ["osRelease", true],
    ["cpuModels", true],
    ["logicalCpuCount", true],
    ["physicalMemoryGiBRounded", false],
    ["processExecArgv", true],
    ["nodeOptionsPresent", true],
    ["debuggerOrInstrumentationPresent", true],
  ].map(([field, matched]) => ({ field, matched }));
  const baselineBuildManifest = {
    ...header,
    buildRole: "baseline",
    commit: CVN7_QUALIFICATION_BASE,
    fileCount: 0,
    treeSha256: EMPTY_SHA256,
    entries: [],
  };
  const candidateBuildManifest = {
    ...header,
    buildRole: "candidate",
    commit: header.candidateCommit,
    fileCount: 0,
    treeSha256: EMPTY_SHA256,
    entries: [],
  };
  const environment = {
    ...header,
    nodeVersion: "v24.15.0",
    nodeExecutableSha256: "a".repeat(64),
    platform: "win32",
    arch: "x64",
    osType: "Windows_NT",
    osRelease: "10.0.26200",
    osVersion: "10.0.26200",
    reportLabel: "synthetic-validator-fixture",
    cpuModels: Array.from(
      { length: 32 },
      () => "13th Gen Intel(R) Core(TM) i9-13900HX",
    ),
    logicalCpuCount: 32,
    physicalMemoryBytes: 40 * 2 ** 30,
    physicalMemoryGiBRounded: 40,
    processExecArgv: ["--expose-gc"],
    nodeOptionsPresent: false,
    packageLockSha256: "b".repeat(64),
    baselineBuildTreeSha256: EMPTY_SHA256,
    candidateBuildTreeSha256: EMPTY_SHA256,
    debuggerOrInstrumentationPresent: false,
    checks,
    environmentMatch: false,
  };
  const stress = {
    ...header,
    fixtureProvenance: {
      generatorVersion: 1 as const,
      fixtureKind: "stress" as const,
      seed: "cvn7-stress-v1",
    },
    counts: {
      measures: 400,
      parts: 16,
      staves: 16,
      measureContents: 6_400,
      voices: 12_800,
      events: 102_400,
      notes: 51_200,
      knownExtensionBlocks: 17,
      unknownExtensionBlocks: 1,
    },
    envelopeCount: 10_000 as const,
    liveCommittedCount: 10_000,
    replayCommittedCount: 10_000,
    statusSequencesEqual: true,
    finalDocumentEqual: true,
    documentVersionEqual: true,
    supportEqual: true,
    availabilityEqual: true,
    effectBasedHistoryVerified: true,
    wholeDocumentHistoryEvidenceAbsent: true,
    historyEvidence: {
      relativeArtifactPath: "src/core-kernel/commands/runtime.js",
      artifactSha256: "c".repeat(64),
      historyEntryLocated: true,
      effectFieldsPresent: true,
      wholeDocumentFieldsAbsent: true,
    },
    memory: { ...memory },
    peakRssLimitBytes: CVN7_STRESS_RSS_LIMIT_BYTES,
    trendLatencyMs: 1,
    processCompleted: true,
    unhandledRejectionObserved: false,
    passed: true,
  };
  return {
    environment,
    baselineBuildManifest,
    candidateBuildManifest,
    contractTrace: {
      ...header,
      contracts: CVN7_CONTRACT_TRACE,
      expectedCount: 44 as const,
      fullSuitePassed: true,
      qualificationSuitePassed: true,
    },
    functionalMatrix: {
      ...header,
      fixtureProvenance: representativeProvenance,
      cases: [{ caseId: "synthetic-functional-case", status: "passed" }] as Array<{
        caseId: string;
        status: "passed" | "failed";
        failureKind?: string;
      }>,
      passed: true,
    },
    representativeFixture: {
      ...header,
      fixtureProvenance: representativeProvenance,
      counts: {
        measures: 200,
        parts: 8,
        staves: 8,
        measureContents: 1_600,
        voices: 3_200,
        events: 25_600,
        notes: 12_800,
        knownExtensionBlocks: 9,
        unknownExtensionBlocks: 1,
      },
      idsUnique: true,
      coverageComplete: true,
      semanticValid: true,
      codecRoundTripEqual: true,
      repeatedGenerationEqual: true,
    },
    portableAb: {
      ...header,
      fixtureProvenance: representativeProvenance,
      operations: portableOperations,
      passed: true,
    },
    referenceWindows: {
      ...header,
      fixtureProvenance: representativeProvenance,
      environmentMatch: false,
      operations: portableOperations,
      representativeMemoryAggregation: "fieldwise-max-across-eight-operations",
      representativeMemoryOperationCount: 8,
      representativeMemory: { ...memory },
      absoluteBudgetsPassed: null,
      result: "REFERENCE_ENVIRONMENT_PENDING",
      qualified: false,
    },
    stress,
    summary: {
      ...header,
      result: "REFERENCE_ENVIRONMENT_PENDING",
      qualified: false,
      functionalPassed: true,
      deterministicPassed: true,
      resourcePassed: true,
      portablePassed: true,
      referencePassed: false,
      stressPassed: true,
      independentReviewPassed: false,
    },
  };
}

test("CVN7-D-FC002 version evolution remains explicit and bounded", () => {
  assert.equal(CVN7_TASK_ID, "cvn-7-core-vnext-final-qualification");
  assert.equal(CVN7_QUALIFICATION_BASE, PROTECTED_BASELINE);
  assert.equal(CVN7_EVIDENCE_SCHEMA_VERSION, 1);
  assert.equal(CVN7_FIXTURE_GENERATOR_VERSION, 1);
  assert.deepEqual(CVN7_FIXTURE_SEEDS, {
    representative: "cvn7-representative-v1",
    stress: "cvn7-stress-v1",
  });

  const reordered = createCvn7QualificationScore({
    seed: CVN7_FIXTURE_SEEDS.representative,
    generatorVersion: 1,
    fixtureKind: "representative",
  });
  assert.equal(reordered.provenance.generatorVersion, 1);
  assert.throws(
    () =>
      createCvn7QualificationScore({
        fixtureKind: "representative",
        generatorVersion: 2,
        seed: CVN7_FIXTURE_SEEDS.representative,
      }),
    /identity/u,
  );
});

test("CVN7-D-FC133 sampling pairs and aggregate rules are exact", () => {
  assert.equal(CVN7_WARMUP_COUNT, 5);
  assert.equal(CVN7_MEASURED_COUNT, 20);
  assert.equal(CVN7_OPERATIONS.length, 8);

  const pairs = Array.from({ length: CVN7_MEASURED_COUNT }, (_, pairIndex) => ({
    pairIndex,
    invocationOrder:
      pairIndex % 2 === 0
        ? ("baseline-then-candidate" as const)
        : ("candidate-then-baseline" as const),
    baselineDurationMs: pairIndex + 1,
    candidateDurationMs: (pairIndex + 1) * 1.1,
  }));
  assert.deepEqual(
    pairs.map(({ pairIndex }) => pairIndex),
    Array.from({ length: 20 }, (_, index) => index),
  );
  assert.equal(
    pairs.every(({ pairIndex, invocationOrder }) =>
      pairIndex % 2 === 0
        ? invocationOrder === "baseline-then-candidate"
        : invocationOrder === "candidate-then-baseline"),
    true,
  );

  const baselineSorted = pairs
    .map(({ baselineDurationMs }) => baselineDurationMs)
    .sort((left, right) => left - right);
  const candidateSorted = pairs
    .map(({ candidateDurationMs }) => candidateDurationMs)
    .sort((left, right) => left - right);
  assert.equal((baselineSorted[9]! + baselineSorted[10]!) / 2, 10.5);
  assert.equal(baselineSorted[18], 19);
  assert.equal((candidateSorted[9]! + candidateSorted[10]!) / 2, 11.55);
  assert.equal(candidateSorted[18], 19 * 1.1);

  assert.equal(medianOf20(baselineSorted), 10.5);
  assert.equal(nearestRankP95Of20(baselineSorted), 19);
  const operation = createBenchmarkOperation("submit-single", pairs, false);
  assert.deepEqual(validateBenchmarkOperation(operation, "submit-single"), {
    ok: true,
  });
  assert.equal(operation.absoluteBudgetApplied, false);
  assert.equal(operation.absoluteBudgetPassed, null);
  assert.deepEqual(
    validateBenchmarkOperation(
      {
        ...operation,
        pairs: operation.pairs.map((pair, index) =>
          index === 0
            ? { ...pair, invocationOrder: "candidate-then-baseline" }
            : pair),
      },
      "submit-single",
    ).ok,
    false,
  );

  assert.deepEqual(
    parseNodeTestSummary("ℹ tests 61\nℹ pass 61\nℹ fail 0\n"),
    { passed: true, testCount: 61, passCount: 61 },
  );
  assert.deepEqual(
    parseNodeTestSummary("# tests 432\n# pass 432\n# fail 0\n"),
    { passed: true, testCount: 432, passCount: 432 },
  );
  assert.throws(
    () => parseNodeTestSummary("# tests 1\nℹ pass 1\n# fail 0\n"),
    /mixes reporter summary forms/u,
  );
  assert.throws(
    () => parseNodeTestSummary("ℹ tests 2\nℹ pass 1\nℹ fail 1\n"),
    /exact all-pass/u,
  );
});

test("CVN7-D-FC134 portable and reference budgets are exact", () => {
  assert.equal(CVN7_PORTABLE_RATIO_LIMIT, 1.2);
  assert.deepEqual(CVN7_OPERATION_BUDGETS_MS, {
    "submit-single": 100,
    "undo-single": 100,
    "redo-single": 100,
    "read-cached": 50,
    "snapshot-first": 50,
    "batch-100": 300,
    "replay-100": 2_000,
    "construct-integrated": 1_000,
  });
  assert.equal(CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES, 1_073_741_824);
  assert.equal(CVN7_STRESS_RSS_LIMIT_BYTES, 2_147_483_648);
  assert.deepEqual({
    functionalOrFixture: CVN7_FUNCTIONAL_TIMEOUT_MS,
    latencyOrMemorySample: CVN7_SAMPLE_TIMEOUT_MS,
    stressSubmitOrReplay: CVN7_STRESS_TIMEOUT_MS,
    terminationGrace: CVN7_TIMEOUT_GRACE_MS,
  }, {
    functionalOrFixture: 1_800_000,
    latencyOrMemorySample: 600_000,
    stressSubmitOrReplay: 10_800_000,
    terminationGrace: 5_000,
  });
});

test("CVN7 qualification remains a zero-production-drift test-only boundary", () => {
  assert.equal(
    gitOutput([
      "diff",
      "--name-only",
      PROTECTED_BASELINE,
      "--",
      "src",
      "package-lock.json",
      "tsconfig.json",
    ]),
    "",
  );

  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    readonly scripts?: Readonly<Record<string, string>>;
  };
  assert.equal(
    packageJson.scripts?.["test:cvn7"],
    'npm run build && node --test "dist/test/core-kernel/cvn-7-*.test.js"',
  );
  assert.equal(
    packageJson.scripts?.["qualify:cvn7"],
    "node --expose-gc dist/test/core-kernel/qualification/cvn-7-runner.js",
  );

  const qualificationSources = [
    "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
    "test/core-kernel/fixtures/cvn-7-qualification-modules.ts",
    "test/core-kernel/qualification/cvn-7-worker.ts",
    "test/core-kernel/qualification/cvn-7-runner.ts",
  ] as const;
  for (const relativePath of qualificationSources) {
    const source = readFileSync(resolve(relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /(?:from|require\s*\()\s*["'][^"']*dist\/src/u,
      `${relativePath} must resolve registered build roots at runtime`,
    );
    if (relativePath.includes("fixtures/")) {
      assert.doesNotMatch(
        source,
        /^import\s+(?!type\b)[\s\S]*?from\s+["'][^"']*src\/core-kernel/gmu,
        `${relativePath} may retain production imports only as types`,
      );
    }
  }
});

test("CVN7 worker rejects a build root outside the coordinator registration set", () => {
  const result = runQualificationWorker(
    {
      schemaVersion: 1,
      action: "build-probe",
      buildRoot: resolve(".."),
      fixture: "representative",
      phase: "functional",
    },
    [process.cwd(), process.cwd()],
  );
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.failureKind, "worker-internal-failure");
  }

  const nestedDecoy = runQualificationWorker(
    {
      schemaVersion: 1,
      action: "build-probe",
      buildRoot: process.cwd(),
      fixture: "representative",
      phase: "functional",
    },
    [resolve(".."), resolve("..")],
  );
  assert.equal(nestedDecoy.status, "failed");
});

test("CVN7 maxRSS is always converted from KiB to bytes", () => {
  assert.equal(maxRssKilobytesToBytes(54_312), 55_615_488);
  assert.throws(() => maxRssKilobytesToBytes(-1), /nonnegative safe KiB/u);
});

test("CVN7 qualification failure precedence keeps functional determinism and resource distinct", () => {
  const passing = {
    functionalPassed: true,
    deterministicPassed: true,
    resourcePassed: true,
    portablePassed: true,
    environmentMatch: true,
    referencePassed: true,
  } as const;
  assert.equal(classifyQualificationGates({ ...passing, functionalPassed: false }), "NOT_QUALIFIED_FUNCTIONAL");
  assert.equal(classifyQualificationGates({ ...passing, deterministicPassed: false }), "NOT_QUALIFIED_DETERMINISM");
  assert.equal(classifyQualificationGates({ ...passing, resourcePassed: false }), "NOT_QUALIFIED_RESOURCE");
  assert.equal(classifyQualificationGates({ ...passing, portablePassed: false }), "NOT_QUALIFIED_PORTABLE_PERFORMANCE");
  assert.equal(classifyQualificationGates({ ...passing, environmentMatch: false }), "REFERENCE_ENVIRONMENT_PENDING");
  assert.equal(classifyQualificationGates({ ...passing, referencePassed: false }), "NOT_QUALIFIED_REFERENCE_PERFORMANCE");
  assert.equal(classifyQualificationGates(passing), "BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW");
});

test("CVN7 runner keeps postconditions outside every measured operation region", () => {
  const source = readFileSync(
    resolve("test/core-kernel/qualification/cvn-7-worker.ts"),
    "utf8",
  );
  const start = source.indexOf("function executeOperation(");
  const end = source.indexOf("export function maxRssKilobytesToBytes", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const operationSource = source.slice(start, end);
  const timedCallbacks = Array.from(
    operationSource.matchAll(/timed\(\(\) =>([\s\S]*?)\);/gu),
    (match) => match[1] ?? "",
  );
  assert.equal(timedCallbacks.length, 2);
  for (const callback of timedCallbacks) {
    assert.doesNotMatch(
      callback,
      /JSON\.stringify|documentHash|deeplyFrozen|\.filter\(|mixedBatch\(/u,
    );
  }
  assert.match(operationSource, /const durationMs = performance\.now\(\) - start;[\s\S]*if \(!created\.ok\)/u);
});

test("CVN7 launcher uses Node plus the captured npm CLI with exact argument boundaries", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 launcher "));
  try {
    const npmDirectory = join(temporaryRoot, "node modules", "npm", "bin");
    mkdirSync(npmDirectory, { recursive: true });
    const npmExecPath = join(npmDirectory, "npm-cli.js");
    writeFileSync(npmExecPath, "#!/usr/bin/env node\n", "utf8");
    const calls: Array<{
      readonly executable: string;
      readonly arguments_: readonly string[];
      readonly cwd: string;
    }> = [];
    const output = npmCliOutput(
      npmExecPath,
      ["run", "typecheck", "--", "--fixture", "value with spaces"],
      temporaryRoot,
      (executable, arguments_, options) => {
        calls.push({ executable, arguments_: [...arguments_], cwd: options.cwd });
        return "captured output\r\n";
      },
    );
    assert.equal(output, "captured output");
    assert.deepEqual(calls, [{
      executable: process.execPath,
      arguments_: [
        resolve(npmExecPath),
        "run",
        "typecheck",
        "--",
        "--fixture",
        "value with spaces",
      ],
      cwd: temporaryRoot,
    }]);

    const propagated = new Error("npm-preflight-command-failed");
    assert.throws(
      () => npmCliOutput(
        npmExecPath,
        ["run", "build"],
        temporaryRoot,
        () => { throw propagated; },
      ),
      (error) => error === propagated,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 launcher rejects invalid npm_execpath identities before side effects", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 launcher invalid "));
  try {
    const evidenceRoot = join(temporaryRoot, "evidence");
    mkdirSync(evidenceRoot);
    const notRegular = join(temporaryRoot, "npm-cli.js");
    mkdirSync(notRegular);
    const wrongIdentity = join(temporaryRoot, "not-npm.js");
    writeFileSync(wrongIdentity, "#!/usr/bin/env node\n", "utf8");
    const invalidValues: readonly unknown[] = [
      undefined,
      "",
      "relative/npm-cli.js",
      join(temporaryRoot, "missing", "npm-cli.js"),
      notRegular,
      wrongIdentity,
    ];
    let commandCalls = 0;
    let evidenceWrites = 0;
    let workerCalls = 0;
    for (const invalid of invalidValues) {
      assert.throws(() => {
        const validated = validateNpmCliJavaScriptPath(invalid);
        npmCliOutput(validated, ["run", "typecheck"], temporaryRoot, () => {
          commandCalls += 1;
          return "";
        });
        evidenceWrites += 1;
        workerCalls += 1;
      }, /npm_execpath/u);
    }
    assert.equal(commandCalls, 0);
    assert.equal(evidenceWrites, 0);
    assert.equal(workerCalls, 0);
    assert.deepEqual(readdirSync(evidenceRoot), []);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 runner rejects a missing startup npm identity before evidence publication", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 launcher process "));
  try {
    const evidenceRoot = join(temporaryRoot, "evidence");
    mkdirSync(evidenceRoot);
    const environment: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.toLowerCase() !== "npm_execpath" && value !== undefined) {
        environment[key] = value;
      }
    }
    const result = spawnSync(process.execPath, [
      resolve(__dirname, "qualification/cvn-7-runner.js"),
      "--mode", "functional",
      "--baseline-root", temporaryRoot,
      "--candidate-root", temporaryRoot,
      "--evidence-dir", evidenceRoot,
      "--qualification-base", CVN7_QUALIFICATION_BASE,
      "--candidate-commit", "1".repeat(40),
      "--harness-commit", "1".repeat(40),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm_execpath must be a nonempty absolute npm CLI JavaScript path/u);
    assert.equal(result.stdout, "");
    assert.deepEqual(readdirSync(evidenceRoot), []);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 worktree-scoped Git binds each canonical root with exact argv boundaries", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 git roots "));
  try {
    const candidateRoot = join(temporaryRoot, "candidate root");
    const baselineRoot = join(temporaryRoot, "baseline root");
    mkdirSync(candidateRoot);
    mkdirSync(baselineRoot);
    const candidateCanonicalRoot = canonicalizeWorktreeRoot(candidateRoot);
    const baselineCanonicalRoot = canonicalizeWorktreeRoot(baselineRoot);
    const calls: Array<{
      readonly executable: string;
      readonly arguments_: readonly string[];
      readonly cwd: string;
    }> = [];
    const execute = (
      executable: string,
      arguments_: readonly string[],
      options: { readonly cwd: string },
    ): string => {
      calls.push({ executable, arguments_: [...arguments_], cwd: options.cwd });
      return "clean\r\n";
    };
    assert.equal(
      worktreeScopedGitOutput(candidateRoot, ["status", "--porcelain=v1"], execute),
      "clean",
    );
    assert.equal(
      worktreeScopedGitOutput(baselineRoot, ["rev-parse", "HEAD"], execute),
      "clean",
    );
    assert.deepEqual(calls, [
      {
        executable: "git",
        arguments_: [
          "-c",
          `safe.directory=${candidateCanonicalRoot}`,
          "status",
          "--porcelain=v1",
        ],
        cwd: candidateCanonicalRoot,
      },
      {
        executable: "git",
        arguments_: [
          "-c",
          `safe.directory=${baselineCanonicalRoot}`,
          "rev-parse",
          "HEAD",
        ],
        cwd: baselineCanonicalRoot,
      },
    ]);
    for (const call of calls) {
      assert.equal(call.arguments_.filter((value) => value === "-c").length, 1);
      assert.equal(call.arguments_[1], `safe.directory=${call.cwd}`);
    }

    const propagated = new Error("scoped-git-failed");
    assert.throws(
      () => worktreeScopedGitOutput(candidateRoot, ["status"], () => { throw propagated; }),
      (error) => error === propagated,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 worktree root validation rejects before Git or qualification side effects", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 git invalid "));
  try {
    const evidenceRoot = join(temporaryRoot, "evidence");
    mkdirSync(evidenceRoot);
    const regularFile = join(temporaryRoot, "not-a-directory");
    writeFileSync(regularFile, "fixture", "utf8");
    const invalidRoots: readonly unknown[] = [
      undefined,
      "",
      "relative/worktree",
      join(temporaryRoot, "missing"),
      regularFile,
    ];
    let gitCalls = 0;
    for (const invalidRoot of invalidRoots) {
      assert.throws(
        () => worktreeScopedGitOutput(invalidRoot, ["status"], () => {
          gitCalls += 1;
          return "";
        }),
        /worktree root/u,
      );
    }
    assert.throws(
      () => worktreeScopedGitOutput(temporaryRoot, ["config", "safe.directory", temporaryRoot], () => {
        gitCalls += 1;
        return "";
      }),
      /may not override or persist configuration/u,
    );
    assert.equal(gitCalls, 0);
    assert.deepEqual(readdirSync(evidenceRoot), []);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 runner rejects a missing worktree before npm evidence or worker-capable preflight", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cvn7 git process "));
  try {
    const missingRoot = join(temporaryRoot, "missing baseline");
    const evidenceRoot = join(temporaryRoot, "evidence");
    mkdirSync(evidenceRoot);
    const result = spawnSync(process.execPath, [
      resolve(__dirname, "qualification/cvn-7-runner.js"),
      "--mode", "functional",
      "--baseline-root", missingRoot,
      "--candidate-root", process.cwd(),
      "--evidence-dir", evidenceRoot,
      "--qualification-base", CVN7_QUALIFICATION_BASE,
      "--candidate-commit", "1".repeat(40),
      "--harness-commit", "1".repeat(40),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /worktree root must identify an existing directory/u);
    assert.equal(result.stdout, "");
    assert.deepEqual(readdirSync(evidenceRoot), []);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("CVN7 scoped native Git probes the frozen baseline as clean", () => {
  const baselineRoot = resolve(process.cwd(), "..", "cvn-7-accepted-baseline");
  if (!existsSync(baselineRoot)) return;
  assert.equal(
    worktreeScopedGitOutput(baselineRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
    "",
  );
});

test("CVN7 preflight preserves npm ordering and the native git launcher", () => {
  const runnerSource = readFileSync(
    resolve("test/core-kernel/qualification/cvn-7-runner.ts"),
    "utf8",
  );
  assert.match(
    runnerSource,
    /export const CAPTURED_NPM_EXEC_PATH = process\.env\.npm_execpath;/u,
  );
  assert.doesNotMatch(runnerSource, /commandOutput\("npm\.cmd"|shell:\s*true|cmd\.exe|\/c["']/iu);
  const cleanBuildStart = runnerSource.indexOf("function cleanBuildManifest(");
  const cleanBuildEnd = runnerSource.indexOf("export function parseNodeTestSummary", cleanBuildStart);
  const cleanBuildSource = runnerSource.slice(cleanBuildStart, cleanBuildEnd);
  assert.match(
    cleanBuildSource,
    /npmCliOutput\(npmExecPath, \["run", "typecheck"\][\s\S]*npmCliOutput\(npmExecPath, \["run", "build"\]/u,
  );
  const preflightStart = runnerSource.indexOf("function assertPreflight(");
  const preflightEnd = runnerSource.indexOf("function timeoutFor(", preflightStart);
  const preflightSource = runnerSource.slice(preflightStart, preflightEnd);
  assert.match(
    preflightSource,
    /candidateSecond[\s\S]*\["run", "test:cvn7"\][\s\S]*\["test"\]/u,
  );
  const qualificationStart = runnerSource.indexOf("export async function runQualification(");
  const qualificationSource = runnerSource.slice(qualificationStart);
  const rootValidationIndex = qualificationSource.indexOf("canonicalizeWorktreeRoot(arguments_.baselineRoot)");
  const validationIndex = qualificationSource.indexOf("validateNpmCliJavaScriptPath(CAPTURED_NPM_EXEC_PATH)");
  assert.notEqual(rootValidationIndex, -1);
  assert.notEqual(validationIndex, -1);
  assert.equal(rootValidationIndex < validationIndex, true);
  for (const laterSideEffect of ["assertPreflight(", "mkdtempSync(", "invokeWorker(", "publishAtomically("]) {
    assert.equal(validationIndex < qualificationSource.indexOf(laterSideEffect), true);
  }
  assert.equal(
    Array.from(preflightSource.matchAll(/worktreeScopedGitOutput\(/gu)).length,
    4,
  );
  assert.doesNotMatch(runnerSource, /function gitOutput\(|safe\.directory=\*|config["'],\s*["']--(?:global|system|local)/u);

  const calls: Array<{ readonly executable: string; readonly arguments_: readonly string[] }> = [];
  const gitOutput = nativeExecutableOutput(
    "git",
    ["status", "--porcelain=v1"],
    process.cwd(),
    (executable, arguments_) => {
      calls.push({ executable, arguments_: [...arguments_] });
      return "clean\n";
    },
  );
  assert.equal(gitOutput, "clean");
  assert.deepEqual(calls, [{
    executable: "git",
    arguments_: ["status", "--porcelain=v1"],
  }]);
  assert.equal(CAPTURED_NPM_EXEC_PATH, process.env.npm_execpath);
});

test("CVN7 worker timeout settlement performs process-tree cleanup before rejection", () => {
  const cleaned: number[] = [];
  const timeoutError = completeTimedOutWorkerCleanup(1234, (processId) => {
    cleaned.push(processId);
  });
  assert.deepEqual(cleaned, [1234]);
  assert.equal(timeoutError.message, "worker-timeout");

  const source = readFileSync(
    resolve("test/core-kernel/qualification/cvn-7-runner.ts"),
    "utf8",
  );
  const start = source.indexOf("async function invokeWorker(");
  const end = source.indexOf("function resultValue(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const invocationSource = source.slice(start, end);
  assert.doesNotMatch(invocationSource, /\.unref\(\)/u);
  assert.match(
    invocationSource,
    /const finishTimeout = \(\): void => \{[\s\S]*?completeTimedOutWorkerCleanup\([\s\S]*?rejectExit\(error\);/u,
  );
  assert.match(
    invocationSource,
    /child\.once\("error"[\s\S]*?if \(timedOut\) \{\s*finishTimeout\(\);/u,
  );
});

test("CVN7 stress decoder preserves functional determinism and resource failures", () => {
  const memory = {
    setupBeforeHeapUsedBytes: 1,
    operationBeforeHeapUsedBytes: 2,
    operationAfterHeapUsedBytes: 3,
    resultEncodeAfterHeapUsedBytes: 4,
    observedPeakHeapUsedBytes: 4,
    maxRssRaw: 1_024,
    maxRssPlatformUnit: "kilobytes",
    maxRssBytes: 1_048_576,
  };
  const createEnvelope = (
    statuses: readonly string[],
    historyEntryLocated: boolean,
    maxRssRaw = 1_024,
    support: unknown = { status: "available" },
  ) => ({
    result: {
      envelopeCount: 10_000,
      committedCount: statuses.filter((status) => status === "committed").length,
      statuses: [...statuses],
      documentVersion: statuses.length,
      finalDocumentSha256: "d".repeat(64),
      support,
      writeAvailability: { status: "writable" },
      validationAvailability: { status: "complete" },
      historyStorageEvidence: {
        relativeArtifactPath: "src/core-kernel/commands/runtime.js",
        artifactSha256: "e".repeat(64),
        historyEntryLocated,
        effectFieldsPresent: historyEntryLocated,
        wholeDocumentFieldsAbsent: historyEntryLocated,
      },
      unhandledRejectionObserved: false,
    },
    observation: {
      ...memory,
      maxRssRaw,
      maxRssBytes: maxRssRaw * 1_024,
    },
  });

  const functional = decodeStressWorkerEnvelope(
    createEnvelope(Array.from({ length: 9_999 }, () => "committed"), true),
  );
  assert.equal(functional.result.statuses.length, 9_999);
  assert.equal(functional.result.committedCount, 9_999);

  const deterministic = decodeStressWorkerEnvelope(
    createEnvelope(Array.from({ length: 10_000 }, () => "committed"), false),
  );
  assert.equal(deterministic.result.historyStorageEvidence.historyEntryLocated, false);

  const resource = decodeStressWorkerEnvelope(
    createEnvelope(Array.from({ length: 10_000 }, () => "committed"), true, 3_000_000),
  );
  assert.equal(resource.observation.maxRssBytes, 3_072_000_000);

  const rejectedCommands = Array.from({ length: 10_000 }, (_, index) => index);
  const rejectedOutcomes = collectStressSubmitOutcomes(
    rejectedCommands,
    () => ({ status: "rejected" }),
  );
  assert.equal(rejectedOutcomes.finalAssessment, null);
  const allRejectedTransport = JSON.parse(JSON.stringify(createEnvelope(
    rejectedOutcomes.statuses,
    true,
    1_024,
    rejectedOutcomes.finalAssessment,
  ))) as unknown;
  const allRejectedLive = decodeStressWorkerEnvelope(allRejectedTransport);
  const allRejectedReplay = decodeStressWorkerEnvelope(allRejectedTransport);
  const transportedResult = (allRejectedTransport as { readonly result: object }).result;
  assert.equal(
    Reflect.ownKeys(transportedResult).includes("support"),
    true,
  );
  assert.equal(allRejectedLive.result.support, null);
  assert.equal(allRejectedReplay.result.support, null);
  assert.equal(allRejectedLive.result.committedCount, 0);
  assert.equal(allRejectedLive.result.statuses.length, 10_000);
  const stressFunctionalPassed = [
    allRejectedLive.result.committedCount,
    allRejectedReplay.result.committedCount,
  ].every((committedCount) => committedCount === 10_000);
  assert.equal(
    classifyQualificationGates({
      functionalPassed: stressFunctionalPassed,
      deterministicPassed: true,
      resourcePassed: true,
      portablePassed: true,
      environmentMatch: true,
      referencePassed: true,
    }),
    "NOT_QUALIFIED_FUNCTIONAL",
  );
});

test("CVN7 validator publishes complete negative evidence with the correct repair route", () => {
  const pending = createSyntheticEvidenceSet();
  assert.deepEqual(validateQualificationEvidenceSet(pending), { ok: true });

  const functional = createSyntheticEvidenceSet();
  functional.functionalMatrix.cases = [{
    caseId: "synthetic-functional-case",
    status: "failed",
    failureKind: "command-rejected",
  }];
  functional.functionalMatrix.passed = false;
  functional.summary.functionalPassed = false;
  functional.summary.result = "NOT_QUALIFIED_FUNCTIONAL";
  assert.deepEqual(validateQualificationEvidenceSet(functional), { ok: true });

  const deterministic = createSyntheticEvidenceSet();
  deterministic.stress.finalDocumentEqual = false;
  deterministic.stress.passed = false;
  deterministic.summary.deterministicPassed = false;
  deterministic.summary.stressPassed = false;
  deterministic.summary.result = "NOT_QUALIFIED_DETERMINISM";
  assert.deepEqual(validateQualificationEvidenceSet(deterministic), { ok: true });

  const resource = createSyntheticEvidenceSet();
  resource.stress.memory.maxRssRaw = 3_000_000;
  resource.stress.memory.maxRssBytes = 3_072_000_000;
  resource.stress.passed = false;
  resource.summary.resourcePassed = false;
  resource.summary.stressPassed = false;
  resource.summary.result = "NOT_QUALIFIED_RESOURCE";
  assert.deepEqual(validateQualificationEvidenceSet(resource), { ok: true });

  const portable = createSyntheticEvidenceSet();
  portable.portableAb.operations[0] = createBenchmarkOperation(
    CVN7_OPERATIONS[0],
    Array.from({ length: 20 }, (_, pairIndex) => ({
      pairIndex,
      invocationOrder: pairIndex % 2 === 0
        ? ("baseline-then-candidate" as const)
        : ("candidate-then-baseline" as const),
      baselineDurationMs: pairIndex + 1,
      candidateDurationMs: (pairIndex + 1) * 2,
    })),
    false,
  );
  portable.portableAb.passed = false;
  portable.summary.portablePassed = false;
  portable.summary.result = "NOT_QUALIFIED_PORTABLE_PERFORMANCE";
  assert.deepEqual(validateQualificationEvidenceSet(portable), { ok: true });
});

test("CVN7 evidence decoding rejects hostile and structurally incomplete sets without caller execution", () => {
  assert.deepEqual(validateQualificationEvidenceSet("{"), {
    ok: false,
    errors: ["evidence: malformed JSON"],
  });

  let getterCalls = 0;
  const hostile = Object.create(null) as Record<string, unknown>;
  for (const key of [
    "environment",
    "baselineBuildManifest",
    "candidateBuildManifest",
    "contractTrace",
    "functionalMatrix",
    "representativeFixture",
    "portableAb",
    "referenceWindows",
    "stress",
  ]) {
    hostile[key] = Object.create(null);
  }
  Object.defineProperty(hostile, "summary", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { result: "QUALIFIED", qualified: true };
    },
  });
  const hostileResult = validateQualificationEvidenceSet(hostile);
  assert.equal(hostileResult.ok, false);
  assert.equal(getterCalls, 0);

  const unreadableArray = new Proxy([], {
    ownKeys() {
      throw new Error("unexpected array reflection");
    },
  });
  const unreadableArrayEvidence = Object.create(null) as Record<string, unknown>;
  for (const key of [
    "environment",
    "baselineBuildManifest",
    "candidateBuildManifest",
    "contractTrace",
    "representativeFixture",
    "portableAb",
    "referenceWindows",
    "stress",
    "summary",
  ]) {
    unreadableArrayEvidence[key] = Object.create(null);
  }
  unreadableArrayEvidence.functionalMatrix = {
    schemaVersion: 1,
    taskId: CVN7_TASK_ID,
    qualificationBaseCommit: CVN7_QUALIFICATION_BASE,
    candidateCommit: "1".repeat(40),
    harnessCommit: "1".repeat(40),
    generatedAtUtc: "2026-08-13T00:00:00.000Z",
    fixtureProvenance: {
      generatorVersion: 1,
      fixtureKind: "representative",
      seed: "cvn7-representative-v1",
    },
    cases: unreadableArray,
    passed: true,
  };
  assert.doesNotThrow(() => validateQualificationEvidenceSet(unreadableArrayEvidence));
  assert.equal(validateQualificationEvidenceSet(unreadableArrayEvidence).ok, false);

  const extra = { ...hostile, summary: Object.create(null), extra: true };
  assert.equal(validateQualificationEvidenceSet(extra).ok, false);

  const cyclic: Record<string, unknown> = Object.create(null);
  cyclic.self = cyclic;
  assert.equal(validateQualificationEvidenceSet(cyclic).ok, false);

  const nestedCycle = Object.create(null) as Record<string, unknown>;
  for (const key of [
    "environment",
    "baselineBuildManifest",
    "candidateBuildManifest",
    "contractTrace",
    "functionalMatrix",
    "representativeFixture",
    "portableAb",
    "referenceWindows",
    "stress",
    "summary",
  ]) {
    nestedCycle[key] = Object.create(null);
  }
  (nestedCycle.summary as Record<string, unknown>).cycle = nestedCycle;
  const nestedCycleResult = validateQualificationEvidenceSet(nestedCycle);
  assert.equal(nestedCycleResult.ok, false);
  if (!nestedCycleResult.ok) {
    assert.equal(
      nestedCycleResult.errors.some((error) => error.includes("cyclic evidence forbidden")),
      true,
    );
  }

  const validatorSource = readFileSync(
    resolve("test/core-kernel/qualification/cvn-7-evidence-validator.ts"),
    "utf8",
  );
  assert.match(
    validatorSource,
    /Stage 5 evidence cannot self-assert QUALIFIED/u,
  );
});
