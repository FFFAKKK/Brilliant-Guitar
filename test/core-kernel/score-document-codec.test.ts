import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";
import {
  cloneCoreScoreFixture,
  createCoreScoreFixture,
} from "./fixtures/core-score";

type Diagnostic = {
  readonly code: string;
  readonly messageKey: string;
  readonly path: readonly (string | number)[];
};
type DecodeResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
type EncodeResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

test("strict codec round-trips a single-Part score", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.encodeScoreDocumentJson, "function");
  assert.equal(typeof api.parseScoreDocumentJson, "function");
  const encode = api.encodeScoreDocumentJson as (value: unknown) => EncodeResult;
  const parse = api.parseScoreDocumentJson as (value: string) => DecodeResult;
  const document = createCoreScoreFixture();

  const encoded = encode(document);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) {
    return;
  }
  const decoded = parse(encoded.value);
  assert.deepEqual(decoded, { ok: true, value: document });
});

test("codec rejects malformed JSON and future schema versions without throwing", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.parseScoreDocumentJson, "function");
  assert.equal(typeof api.decodeScoreDocument, "function");
  const parse = api.parseScoreDocumentJson as (value: string) => DecodeResult;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;

  assert.deepEqual(parse("{"), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-syntax",
        messageKey: "core.decode.json-syntax",
        path: [],
      },
    ],
  });

  const future = cloneCoreScoreFixture() as unknown as Record<string, unknown>;
  future.schemaVersion = "brilliant-score-2";
  assert.deepEqual(decode(future), {
    ok: false,
    diagnostics: [
      {
        code: "decode.unsupported-schema-version",
        messageKey: "core.decode.unsupported-schema-version",
        path: ["schemaVersion"],
        details: { actual: "brilliant-score-2" },
      },
    ],
  });
});

test("codec rejects extra fields at nested strict boundaries", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.decodeScoreDocument, "function");
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;
  const document = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{ sequence: { events: Array<Record<string, unknown>> } }>;
      }>;
    }>;
  };
  const firstEvent =
    document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0];
  assert.ok(firstEvent);
  document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0] = {
    ...firstEvent,
    startTick: 960,
  };

  assert.deepEqual(decode(document), {
    ok: false,
    diagnostics: [
      {
        code: "decode.extra-field",
        messageKey: "core.decode.extra-field",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          0,
          "startTick",
        ],
        details: { field: "startTick" },
      },
    ],
  });
});

test("codec rejects unknown union kinds with a stable path", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;
  const document = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: { events: Array<{ content: { kind: string } }> };
        }>;
      }>;
    }>;
  };
  document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!.content.kind =
    "future-kind";

  assert.deepEqual(decode(document), {
    ok: false,
    diagnostics: [
      {
        code: "decode.union",
        messageKey: "core.decode.union",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          0,
          "content",
          "kind",
        ],
      },
    ],
  });
});

test("codec diagnostics are deterministic and unreadable input never escapes", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;
  const invalid = { schemaVersion: "brilliant-score-2" };
  assert.deepEqual(decode(invalid), decode(invalid));

  const unreadable = {} as Record<string, unknown>;
  Object.defineProperty(unreadable, "schemaVersion", {
    enumerable: true,
    get(): never {
      throw new Error("untrusted getter");
    },
  });
  Object.assign(unreadable, {
    id: "score-1",
    metadata: {},
    measureDefinitions: [],
    parts: [],
    extensions: [],
  });
  assert.deepEqual(decode(unreadable), {
    ok: false,
    diagnostics: [
      {
        code: "decode.unreadable-input",
        messageKey: "core.decode.unreadable-input",
        path: [],
      },
    ],
  });
});

test("codec rejects sparse arrays instead of silently changing their meaning", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;
  const document = cloneCoreScoreFixture() as unknown as {
    extensions: unknown[];
  };
  document.extensions = [
    {
      namespace: "org.example.sparse",
      schemaVersion: 1,
      owner: { kind: "score" },
      payload: { items: new Array<unknown>(1) },
    },
  ];

  assert.deepEqual(decode(document), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-value",
        messageKey: "core.decode.json-value",
        path: ["extensions", 0, "payload", "items", 0],
      },
    ],
  });
});

test("codec reports structural sparse-array holes as invalid JSON values", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;

  const topLevel = cloneCoreScoreFixture() as unknown as { parts: unknown[] };
  topLevel.parts = new Array<unknown>(1);
  assert.deepEqual(decode(topLevel), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-value",
        messageKey: "core.decode.json-value",
        path: ["parts", 0],
      },
    ],
  });

  const nested = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{ sequence: { events: unknown[] } }>;
      }>;
    }>;
  };
  nested.parts[0]!.measureContents[0]!.voices[0]!.sequence.events =
    new Array<unknown>(1);
  assert.deepEqual(decode(nested), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-value",
        messageKey: "core.decode.json-value",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          0,
        ],
      },
    ],
  });
});
