import assert = require("node:assert/strict");
import { test } from "node:test";

import * as coreKernel from "../../src/core-kernel/index";
import {
  STRICT_INPUT_MAX_DEPTH,
  STRICT_INPUT_MAX_PROPERTIES,
} from "../../src/core-kernel/codec/strict-input-capture";
import type {
  CreateScoreDocumentResult,
  ScoreDocument,
} from "../../src/core-kernel/index";
import {
  cloneCvn3FactoryInput,
  createCvn3FactoryInput,
  createCvn3UnsupportedMultiPartInput,
} from "./fixtures/cvn-3-score";

function requireCreated(
  result: CreateScoreDocumentResult,
): Extract<CreateScoreDocumentResult, { readonly status: "created" }> {
  assert.equal(result.status, "created");
  if (result.status !== "created") {
    assert.fail("expected created factory result");
  }
  return result;
}

function requireRejected(
  result: CreateScoreDocumentResult,
): Extract<CreateScoreDocumentResult, { readonly status: "rejected" }> {
  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected rejected factory result");
  }
  return result;
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function nestedValue(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

function factoryPropertyFixture(length: number): CreateScoreDocumentResult {
  return coreKernel.createScoreDocument({
    oversized: new Array<null>(length).fill(null),
  });
}

test("factory creates the exact one-Measure document without a session", () => {
  const input = createCvn3FactoryInput();
  const result = requireCreated(coreKernel.createScoreDocument(input));
  const part = input.initialParts[0];

  assert.deepEqual(result.document, {
    schemaVersion: "brilliant-score-1",
    id: input.documentId,
    metadata: input.metadata,
    measureDefinitions: [input.initialMeasure],
    parts: [
      {
        id: part.id,
        name: part.name,
        instrument: part.instrument,
        staves: part.staves,
        measureContents: [
          {
            measureId: input.initialMeasure.id,
            voices: part.voices,
          },
        ],
      },
    ],
    extensions: [],
  } satisfies ScoreDocument);
  assert.deepEqual(result.support, { status: "supported", diagnostics: [] });
  assertDeeplyFrozen(result);
});

test("factory preserves decoded order and creates semantic-valid unsupported multi-Part scores", () => {
  const input = createCvn3UnsupportedMultiPartInput();
  const result = requireCreated(coreKernel.createScoreDocument(input));

  assert.equal(result.document.measureDefinitions.length, 1);
  assert.deepEqual(
    result.document.parts.map((part) => ({
      id: part.id,
      staves: part.staves.map((staff) => staff.id),
      measureContents: part.measureContents.map((content) => ({
        measureId: content.measureId,
        voices: content.voices.map((voice) => voice.id),
      })),
    })),
    input.initialParts.map((part) => ({
      id: part.id,
      staves: part.staves.map((staff) => staff.id),
      measureContents: [
        {
          measureId: input.initialMeasure.id,
          voices: part.voices.map((voice) => voice.id),
        },
      ],
    })),
  );
  assert.deepEqual(result.support, {
    status: "unsupported",
    diagnostics: [
      {
        code: "unsupported.part-count",
        messageKey: "core.unsupported.part-count",
        path: ["parts"],
      },
    ],
  });
});

test("factory maps exact shape, tuple, sparse, version, and safe-integer failures to invalid input", () => {
  const extra = cloneCvn3FactoryInput() as unknown as Record<string, unknown>;
  extra.unexpected = true;
  assert.deepEqual(coreKernel.createScoreDocument(extra), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.extra-field",
          messageKey: "core.decode.extra-field",
          path: ["unexpected"],
          details: { field: "unexpected" },
        },
      ],
    },
  });

  const wrongVersion = cloneCvn3FactoryInput() as unknown as {
    factoryVersion: number;
  };
  wrongVersion.factoryVersion = 2;
  assert.deepEqual(coreKernel.createScoreDocument(wrongVersion), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.union",
          messageKey: "core.decode.union",
          path: ["factoryVersion"],
        },
      ],
    },
  });

  const emptyParts = cloneCvn3FactoryInput() as unknown as {
    initialParts: unknown[];
  };
  emptyParts.initialParts = [];
  assert.deepEqual(coreKernel.createScoreDocument(emptyParts), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.type",
          messageKey: "core.decode.type",
          path: ["initialParts"],
          details: { expected: "non-empty-array" },
        },
      ],
    },
  });

  const emptyStaves = cloneCvn3FactoryInput() as unknown as {
    initialParts: Array<{ staves: unknown[] }>;
  };
  emptyStaves.initialParts[0]!.staves = [];
  assert.deepEqual(coreKernel.createScoreDocument(emptyStaves), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.type",
          messageKey: "core.decode.type",
          path: ["initialParts", 0, "staves"],
          details: { expected: "non-empty-array" },
        },
      ],
    },
  });

  const emptyVoices = cloneCvn3FactoryInput() as unknown as {
    initialParts: Array<{ voices: unknown[] }>;
  };
  emptyVoices.initialParts[0]!.voices = [];
  assert.deepEqual(coreKernel.createScoreDocument(emptyVoices), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.type",
          messageKey: "core.decode.type",
          path: ["initialParts", 0, "voices"],
          details: { expected: "non-empty-array" },
        },
      ],
    },
  });

  const unsafeNumerator = cloneCvn3FactoryInput() as unknown as {
    initialMeasure: { meter: { numerator: number } };
  };
  unsafeNumerator.initialMeasure.meter.numerator = 1.5;
  assert.deepEqual(coreKernel.createScoreDocument(unsafeNumerator), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.type",
          messageKey: "core.decode.type",
          path: ["initialMeasure", "meter", "numerator"],
          details: { expected: "safe-integer" },
        },
      ],
    },
  });

  const sparseParts = cloneCvn3FactoryInput() as unknown as {
    initialParts: unknown[];
  };
  sparseParts.initialParts = new Array<unknown>(1);
  assert.deepEqual(coreKernel.createScoreDocument(sparseParts), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.json-value",
          messageKey: "core.decode.json-value",
          path: ["initialParts"],
          details: { reason: "sparse-array" },
        },
      ],
    },
  });

  const nonFiniteTempo = cloneCvn3FactoryInput() as unknown as {
    metadata: { tempo: { bpm: number } };
  };
  nonFiniteTempo.metadata.tempo.bpm = Number.POSITIVE_INFINITY;
  assert.deepEqual(coreKernel.createScoreDocument(nonFiniteTempo), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.non-finite-number",
          messageKey: "core.decode.non-finite-number",
          path: ["metadata", "tempo", "bpm"],
        },
      ],
    },
  });

  const fractionalTempo = cloneCvn3FactoryInput() as unknown as {
    metadata: { tempo: { bpm: number } };
  };
  fractionalTempo.metadata.tempo.bpm = 120.5;
  assert.equal(coreKernel.createScoreDocument(fractionalTempo).status, "created");
});

test("factory separates sorted semantic diagnostics from profile classification", () => {
  const semanticInvalid = cloneCvn3FactoryInput() as unknown as {
    documentId: string;
    initialParts: Array<{ voices: Array<{ defaultStaffId: string }> }>;
  };
  semanticInvalid.documentId = "";
  semanticInvalid.initialParts[0]!.voices[0]!.defaultStaffId = "missing-staff";
  assert.deepEqual(coreKernel.createScoreDocument(semanticInvalid), {
    status: "rejected",
    failure: {
      code: "factory.semantic-invalid",
      diagnostics: [
        {
          code: "semantic.id-empty",
          messageKey: "core.semantic.id-empty",
          path: ["id"],
        },
        {
          code: "semantic.staff-reference-missing",
          messageKey: "core.semantic.staff-reference-missing",
          path: [
            "parts",
            0,
            "measureContents",
            0,
            "voices",
            0,
            "defaultStaffId",
          ],
        },
      ],
    },
  });

  const invalidPickup = cloneCvn3FactoryInput() as unknown as {
    initialMeasure: {
      pickupDuration: { numerator: number; denominator: number };
    };
  };
  invalidPickup.initialMeasure.pickupDuration = { numerator: 5, denominator: 1 };
  const pickupFailure = requireRejected(
    coreKernel.createScoreDocument(invalidPickup),
  );
  assert.equal(pickupFailure.failure.code, "factory.semantic-invalid");
  if (pickupFailure.failure.code === "factory.semantic-invalid") {
    assert.deepEqual(pickupFailure.failure.diagnostics, [
      {
        code: "semantic.pickup-exceeds-measure",
        messageKey: "core.semantic.pickup-exceeds-measure",
        path: ["measureDefinitions", 0, "pickupDuration"],
      },
    ]);
  }

  const duplicateId = cloneCvn3FactoryInput() as unknown as {
    initialParts: Array<{ id: string }>;
  };
  duplicateId.initialParts[0]!.id = "factory-score";
  const duplicateFailure = requireRejected(
    coreKernel.createScoreDocument(duplicateId),
  );
  assert.equal(duplicateFailure.failure.code, "factory.semantic-invalid");
  if (duplicateFailure.failure.code === "factory.semantic-invalid") {
    assert.deepEqual(duplicateFailure.failure.diagnostics, [
      {
        code: "semantic.id-duplicate",
        messageKey: "core.semantic.id-duplicate",
        path: ["parts", 0, "id"],
        details: { id: "factory-score" },
      },
    ]);
  }

  const invalidMeter = cloneCvn3FactoryInput() as unknown as {
    initialMeasure: { meter: { numerator: number } };
  };
  invalidMeter.initialMeasure.meter.numerator = 0;
  const meterFailure = requireRejected(coreKernel.createScoreDocument(invalidMeter));
  assert.equal(meterFailure.failure.code, "factory.semantic-invalid");
  if (meterFailure.failure.code === "factory.semantic-invalid") {
    assert.deepEqual(meterFailure.failure.diagnostics, [
      {
        code: "semantic.meter-numerator-invalid",
        messageKey: "core.semantic.meter-numerator-invalid",
        path: ["measureDefinitions", 0, "meter", "numerator"],
      },
      {
        code: "semantic.measure-duration-invalid",
        messageKey: "core.semantic.measure-duration-invalid",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "start",
        ],
        details: { reason: "meter-numerator-invalid" },
      },
    ]);
  }

  const invalidSequence = cloneCvn3FactoryInput() as unknown as {
    initialParts: Array<{
      voices: Array<{ sequence: { start: { numerator: number } } }>;
    }>;
  };
  invalidSequence.initialParts[0]!.voices[0]!.sequence.start.numerator = -1;
  const sequenceFailure = requireRejected(
    coreKernel.createScoreDocument(invalidSequence),
  );
  assert.equal(sequenceFailure.failure.code, "factory.semantic-invalid");
  if (sequenceFailure.failure.code === "factory.semantic-invalid") {
    assert.deepEqual(sequenceFailure.failure.diagnostics, [
      {
        code: "semantic.fraction-sign-invalid",
        messageKey: "core.semantic.fraction-sign-invalid",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "start",
        ],
      },
    ]);
  }

  const missingExtensionOwner = cloneCvn3FactoryInput() as unknown as {
    extensions: Array<unknown>;
  };
  missingExtensionOwner.extensions = [
    {
      namespace: "com.example.owner",
      schemaVersion: 1,
      owner: { kind: "part", partId: "missing-part" },
      payload: {},
    },
  ];
  const extensionFailure = requireRejected(
    coreKernel.createScoreDocument(missingExtensionOwner),
  );
  assert.equal(extensionFailure.failure.code, "factory.semantic-invalid");
  if (extensionFailure.failure.code === "factory.semantic-invalid") {
    assert.deepEqual(extensionFailure.failure.diagnostics, [
      {
        code: "semantic.extension-owner-missing",
        messageKey: "core.semantic.extension-owner-missing",
        path: ["extensions", 0, "owner", "partId"],
      },
    ]);
  }
});

test("factory is deterministic, alias-isolated, deeply frozen, and does not invoke hostile hooks", () => {
  const input = cloneCvn3FactoryInput() as unknown as {
    metadata: { title: string };
    extensions: Array<{
      namespace: string;
      schemaVersion: number;
      owner: { kind: "score" };
      payload: { nested: { retained: boolean } };
    }>;
  };
  input.extensions = [
    {
      namespace: "com.example.factory",
      schemaVersion: 1,
      owner: { kind: "score" },
      payload: { nested: { retained: true } },
    },
  ];
  const first = requireCreated(coreKernel.createScoreDocument(input));
  const second = requireCreated(coreKernel.createScoreDocument(input));
  assert.deepEqual(first, second);
  assertDeeplyFrozen(first);

  input.metadata.title = "caller mutation";
  input.extensions[0]!.payload.nested.retained = false;
  assert.equal(first.document.metadata.title, "Factory score");
  assert.equal(
    (first.document.extensions[0]!.payload.nested as { retained: boolean })
      .retained,
    true,
  );

  let getterCalls = 0;
  const accessor = cloneCvn3FactoryInput() as unknown as Record<string, unknown>;
  Object.defineProperty(accessor, "documentId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "unexpected";
    },
  });
  assert.deepEqual(coreKernel.createScoreDocument(accessor), {
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: [
        {
          code: "decode.unreadable-input",
          messageKey: "core.decode.unreadable-input",
          path: ["documentId"],
        },
      ],
    },
  });
  assert.equal(getterCalls, 0);

  let getCalls = 0;
  const proxy = new Proxy(cloneCvn3FactoryInput(), {
    get(target, key, receiver) {
      getCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(coreKernel.createScoreDocument(proxy).status, "created");
  assert.equal(getCalls, 0);

  let toJsonCalls = 0;
  const withToJson = cloneCvn3FactoryInput() as unknown as Record<string, unknown>;
  withToJson.toJSON = () => {
    toJsonCalls += 1;
    return {};
  };
  assert.equal(coreKernel.createScoreDocument(withToJson).status, "rejected");
  assert.equal(toJsonCalls, 0);
});

test("factory applies the strict capture depth and property limits before schema diagnostics", () => {
  assert.equal(
    requireRejected(coreKernel.createScoreDocument(nestedValue(64))).failure.code,
    "factory.invalid-input",
  );
  assert.deepEqual(coreKernel.createScoreDocument(nestedValue(65)), {
    status: "rejected",
    failure: {
      code: "factory.resource-limit-exceeded",
      limitKind: "input-depth",
      limit: 64,
      actual: 65,
    },
  });

  const atLimit = factoryPropertyFixture(STRICT_INPUT_MAX_PROPERTIES - 1);
  assert.equal(requireRejected(atLimit).failure.code, "factory.invalid-input");
  assert.deepEqual(
    factoryPropertyFixture(STRICT_INPUT_MAX_PROPERTIES),
    {
      status: "rejected",
      failure: {
        code: "factory.resource-limit-exceeded",
        limitKind: "input-properties",
        limit: 1_048_576,
        actual: 1_048_577,
      },
    },
  );
  assert.equal(STRICT_INPUT_MAX_DEPTH, 64);
});
