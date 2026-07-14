import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

type CodecResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostics: readonly unknown[] };

test("unknown extension payload survives a deep semantic JSON round-trip", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.encodeScoreDocumentJson, "function");
  assert.equal(typeof api.parseScoreDocumentJson, "function");
  const encode = api.encodeScoreDocumentJson as (value: unknown) => CodecResult;
  const parse = api.parseScoreDocumentJson as (value: string) => CodecResult;
  const document = cloneCoreScoreFixture();
  const payload = {
    settings: {
      enabled: true,
      ratio: 1.25,
      labels: ["first", "second"],
      nested: [{ value: null }, { value: 7 }],
    },
  } as const;
  const withExtension = {
    ...document,
    extensions: [
      {
        namespace: "org.example.future",
        schemaVersion: 3,
        owner: { kind: "part", partId: "part-1" },
        payload,
      },
    ],
  };

  const encoded = encode(withExtension);
  assert.equal(encoded.ok, true);
  if (!encoded.ok || typeof encoded.value !== "string") {
    return;
  }
  const decoded = parse(encoded.value);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) {
    return;
  }
  const roundTripped = decoded.value as typeof withExtension;
  assert.deepEqual(roundTripped.extensions[0]?.payload, payload);
});
