import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  CVN3_PROJECTED_COMMAND_IDS,
  CVN4_PROJECTED_COMMAND_IDS,
  CVN5_PROJECTED_COMMAND_IDS,
  assertCvn1CharacterizationShape,
  collectCvn1CharacterizationTrace,
  projectCvn1CharacterizationTrace,
  serializeCvn1CharacterizationTrace,
  type Cvn1CharacterizationTraceV1,
} from "./fixtures/cvn-1-characterization";
import type { RegistryContributionSummary } from "../../src/core-kernel/index";

const EXPECTED_TRACE_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-1-characterization.expected.json",
);
const EXPECTED_TRACE_SHA256 =
  "CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9";

type RegistryCommandDescriptor = Extract<
  RegistryContributionSummary,
  { readonly kind: "command" }
>;

const SYNTHETIC_CVN3_COMMAND_DESCRIPTORS = [
  {
    id: "core.measure.insert",
    sourceModuleId: "core.commands",
    apiVersion: 1,
    requiredCapabilities: ["command:execute"],
    titleKey: "core.command.measure-insert.title",
    kind: "command",
    targetKind: "document",
  },
  {
    id: "core.measure.remove",
    sourceModuleId: "core.commands",
    apiVersion: 1,
    requiredCapabilities: ["command:execute"],
    titleKey: "core.command.measure-remove.title",
    kind: "command",
    targetKind: "measure",
  },
  {
    id: "core.measure.move",
    sourceModuleId: "core.commands",
    apiVersion: 1,
    requiredCapabilities: ["command:execute"],
    titleKey: "core.command.measure-move.title",
    kind: "command",
    targetKind: "measure",
  },
  {
    id: "core.measure.set-definition",
    sourceModuleId: "core.commands",
    apiVersion: 1,
    requiredCapabilities: ["command:execute"],
    titleKey: "core.command.measure-set-definition.title",
    kind: "command",
    targetKind: "measure",
  },
] as const satisfies readonly RegistryCommandDescriptor[];

const UNRELATED_FUTURE_COMMAND_DESCRIPTOR = {
  id: "core.future.inspect",
  sourceModuleId: "core.commands",
  apiVersion: 1,
  requiredCapabilities: ["command:execute"],
  titleKey: "core.command.future-inspect.title",
  kind: "command",
  targetKind: "document",
} as const satisfies RegistryCommandDescriptor;

const SYNTHETIC_CVN4_COMMAND_DESCRIPTORS: readonly RegistryCommandDescriptor[] =
  CVN4_PROJECTED_COMMAND_IDS.map(
    (id): RegistryCommandDescriptor => ({
      id,
      sourceModuleId: "core.commands",
      apiVersion: 1,
      requiredCapabilities: ["command:execute"],
      titleKey: "core.command.cvn4-projection.title",
      kind: "command",
      targetKind: "part",
    }),
  );

const SYNTHETIC_CVN5_COMMAND_DESCRIPTORS: readonly RegistryCommandDescriptor[] =
  CVN5_PROJECTED_COMMAND_IDS.map(
    (id): RegistryCommandDescriptor => ({
      id,
      sourceModuleId: "core.commands",
      apiVersion: 1,
      requiredCapabilities: ["command:execute"],
      titleKey: "core.command.cvn5-projection.title",
      kind: "command",
      targetKind: "document",
    }),
  );

function appendSyntheticCvn3Surface(
  trace: Cvn1CharacterizationTraceV1,
  unrelatedDescriptor?: RegistryCommandDescriptor,
): Cvn1CharacterizationTraceV1 {
  const summary = trace.registryCase.summary;
  if (summary.status !== "authorized") {
    throw new Error("expected CVN-1 characterization Registry summary");
  }
  return {
    ...trace,
    runtimeExports: [...trace.runtimeExports, "createScoreDocument"],
    catalog: [
      ...trace.catalog,
      {
        commandId: "core.measure.insert",
        targetKind: "document",
      },
      {
        commandId: "core.measure.remove",
        targetKind: "measure",
      },
      {
        commandId: "core.measure.move",
        targetKind: "measure",
      },
      {
        commandId: "core.measure.set-definition",
        targetKind: "measure",
      },
    ],
    registryCase: {
      ...trace.registryCase,
      summary: {
        status: "authorized",
        value: {
          ...summary.value,
          contributions: [
            ...summary.value.contributions,
            ...SYNTHETIC_CVN3_COMMAND_DESCRIPTORS,
            ...(unrelatedDescriptor === undefined ? [] : [unrelatedDescriptor]),
          ],
        },
      },
    },
  };
}

function appendSyntheticCvn4Surface(
  trace: Cvn1CharacterizationTraceV1,
): Cvn1CharacterizationTraceV1 {
  const summary = trace.registryCase.summary;
  if (summary.status !== "authorized") {
    throw new Error("expected CVN-1 characterization Registry summary");
  }
  return {
    ...trace,
    catalog: [
      ...trace.catalog,
      ...CVN4_PROJECTED_COMMAND_IDS.map((commandId) => ({
        commandId,
        targetKind: "part",
      })),
    ],
    registryCase: {
      ...trace.registryCase,
      summary: {
        status: "authorized",
        value: {
          ...summary.value,
          contributions: [
            ...summary.value.contributions,
            ...SYNTHETIC_CVN4_COMMAND_DESCRIPTORS,
          ],
        },
      },
    },
  };
}

function appendSyntheticCvn5Surface(
  trace: Cvn1CharacterizationTraceV1,
): Cvn1CharacterizationTraceV1 {
  const summary = trace.registryCase.summary;
  if (summary.status !== "authorized") {
    throw new Error("expected CVN-1 characterization Registry summary");
  }
  return {
    ...trace,
    catalog: [
      ...trace.catalog,
      ...CVN5_PROJECTED_COMMAND_IDS.map((commandId) => ({
        commandId,
        targetKind: "document" as const,
      })),
    ],
    registryCase: {
      ...trace.registryCase,
      summary: {
        status: "authorized",
        value: {
          ...summary.value,
          contributions: [
            ...summary.value.contributions,
            ...SYNTHETIC_CVN5_COMMAND_DESCRIPTORS,
          ],
        },
      },
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function readExpectedTrace(): Cvn1CharacterizationTraceV1 {
  return JSON.parse(
    readFileSync(EXPECTED_TRACE_PATH, "utf8"),
  ) as Cvn1CharacterizationTraceV1;
}

test("CVN-1 freezes the pre-refactor public command spine trace", () => {
  const actual = collectCvn1CharacterizationTrace();
  const repeated = collectCvn1CharacterizationTrace();
  const expected = readExpectedTrace();
  const expectedText = readFileSync(EXPECTED_TRACE_PATH, "utf8");

  assertCvn1CharacterizationShape(actual);
  assertCvn1CharacterizationShape(repeated);
  assert.equal(
    serializeCvn1CharacterizationTrace(actual),
    serializeCvn1CharacterizationTrace(repeated),
  );
  assert.equal(serializeCvn1CharacterizationTrace(actual), expectedText);
  assert.equal(sha256(serializeCvn1CharacterizationTrace(actual)), EXPECTED_TRACE_SHA256);
  assert.equal(sha256(expectedText), EXPECTED_TRACE_SHA256);
  assert.deepEqual(actual, expected);
});

test("CVN-1 projection removes only declared CVN-3, CVN-4, and CVN-5 Registry descriptors", () => {
  const baseline = collectCvn1CharacterizationTrace();
  const projected = projectCvn1CharacterizationTrace(
    appendSyntheticCvn5Surface(
      appendSyntheticCvn4Surface(appendSyntheticCvn3Surface(baseline)),
    ),
  );

  assert.deepEqual(CVN3_PROJECTED_COMMAND_IDS, [
    "core.measure.insert",
    "core.measure.remove",
    "core.measure.move",
    "core.measure.set-definition",
  ]);
  assert.deepEqual(CVN4_PROJECTED_COMMAND_IDS, [
    "core.part.insert",
    "core.part.remove",
    "core.part.move",
    "core.part.set-name",
    "core.part.set-instrument",
    "core.staff.insert",
    "core.staff.remove",
    "core.staff.move",
    "core.staff.set-definition",
    "core.voice.insert",
    "core.voice.remove",
    "core.voice.move",
    "core.voice.set-default-staff",
    "core.voice.set-sequence-start",
    "core.event.set-staff-assignment",
  ]);
  assert.deepEqual(CVN5_PROJECTED_COMMAND_IDS, [
    "core.range.delete",
    "core.range.transpose-written-pitch",
    "core.transaction.batch",
  ]);
  assert.deepEqual(projected, baseline);
});

test("CVN-1 projection leaves unrelated trace data and Registry descriptors visible", () => {
  const baseline = collectCvn1CharacterizationTrace();
  const augmented = appendSyntheticCvn3Surface(
    baseline,
    UNRELATED_FUTURE_COMMAND_DESCRIPTOR,
  );
  const projected = projectCvn1CharacterizationTrace(augmented);
  const summary = projected.registryCase.summary;

  assert.equal(projected.commandCases, augmented.commandCases);
  assert.equal(projected.historyReplayCase, augmented.historyReplayCase);
  assert.equal(projected.unknownExtensionCase, augmented.unknownExtensionCase);
  assert.equal(summary.status, "authorized");
  if (summary.status !== "authorized") {
    assert.fail("expected projected Registry summary");
  }
  assert.equal(
    summary.value.contributions.some(
      (contribution) => contribution.id === UNRELATED_FUTURE_COMMAND_DESCRIPTOR.id,
    ),
    true,
  );
  assert.equal(
    summary.value.contributions.some((contribution) =>
      CVN3_PROJECTED_COMMAND_IDS.includes(
        contribution.id as (typeof CVN3_PROJECTED_COMMAND_IDS)[number],
      ),
    ),
    false,
  );
});
