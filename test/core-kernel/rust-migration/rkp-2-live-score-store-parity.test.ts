import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import type { RustKernelSmokeNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import {
  createPartOwnerExtensionRkp2StoreFixture,
  createRkp2DuplicateIdFixture,
  createRkp2MissingStaffReferenceFixture,
  createRkp2StoreFixtureCatalog,
  createTopologyOptionalRkp2StoreFixture,
} from "./rkp-2-store-fixtures";

interface RawNativeCreateResult {
  readonly payload: Buffer;
  readonly handle?: object;
}

interface RawNativeAddon extends RustKernelSmokeNativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => RawNativeCreateResult;
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
}

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawNativeAddon;

function canonicalCreateBytes(document: unknown): Buffer {
  return Buffer.from(JSON.stringify({ apiVersion: 1, document }), "utf8");
}

function createAccepted(document: unknown): Required<RawNativeCreateResult> {
  const created = addon.createKernelSessionV1(canonicalCreateBytes(document));
  const payload = JSON.parse(created.payload.toString("utf8")) as {
    readonly status?: unknown;
  };
  assert.equal(payload.status, "created");
  assert.ok(created.handle);
  return created as Required<RawNativeCreateResult>;
}

function readPayload(handle: object): {
  readonly status: string;
  readonly value: {
    readonly snapshot: { readonly document: unknown; readonly documentVersion: number };
    readonly history: { readonly undoDepth: number; readonly redoDepth: number };
    readonly dirty: boolean;
  };
} {
  return JSON.parse(addon.readKernelSessionV1(handle).toString("utf8")) as ReturnType<
    typeof readPayload
  >;
}

test("native LiveScoreStore create/read preserves every canonical Stage 5 fixture", () => {
  assert.deepEqual(Object.keys(addon).sort(), [
    "createKernelSessionV1",
    "readKernelSessionV1",
  ]);
  const fixtures = [
    ...createRkp2StoreFixtureCatalog(),
    createTopologyOptionalRkp2StoreFixture(),
  ];
  for (const fixture of fixtures) {
    const created = createAccepted(fixture.document);
    const read = readPayload(created.handle);
    assert.equal(read.status, "ok", fixture.fixtureId);
    assert.equal(read.value.snapshot.documentVersion, 0, fixture.fixtureId);
    assert.deepEqual(read.value.history, { undoDepth: 0, redoDepth: 0 });
    assert.equal(read.value.dirty, false);
    assert.deepEqual(read.value.snapshot.document, fixture.document, fixture.fixtureId);
  }
});

test("native reads are byte-repeatable and detached from input and output aliases", () => {
  const source = createTopologyOptionalRkp2StoreFixture().document;
  const expected = structuredClone(source);
  const created = createAccepted(source);

  (source.metadata as { title: string }).title = "mutated after native create";
  (source.extensions[0]?.payload as { z?: number }).z = 999;

  const firstBytes = addon.readKernelSessionV1(created.handle);
  const secondBytes = addon.readKernelSessionV1(created.handle);
  assert.deepEqual(firstBytes, secondBytes);
  const first = JSON.parse(firstBytes.toString("utf8")) as {
    value: { snapshot: { document: unknown } };
  };
  assert.deepEqual(first.value.snapshot.document, expected);

  (first.value.snapshot.document as { metadata: { title: string } }).metadata.title =
    "mutated returned object";
  const third = readPayload(created.handle);
  assert.deepEqual(third.value.snapshot.document, expected);
});

test("native export preserves optional fields, array order, and opaque extensions", () => {
  const fixture = createTopologyOptionalRkp2StoreFixture();
  const created = createAccepted(fixture.document);
  const read = readPayload(created.handle);
  const document = read.value.snapshot.document as typeof fixture.document;

  assert.deepEqual(
    document.measureDefinitions.map((measure) => measure.id),
    ["measure-z", "measure-a"],
  );
  assert.deepEqual(
    document.parts[0]?.measureContents.map((content) => content.measureId),
    ["measure-a", "measure-z"],
  );
  assert.deepEqual(document.measureDefinitions[1]?.pickupDuration, {
    numerator: 1,
    denominator: 1,
  });
  assert.deepEqual(
    document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0]
      ?.duration.timeModification,
    { actualNotes: 1, normalNotes: 1 },
  );
  assert.equal(
    Object.hasOwn(
      document.parts[0]?.measureContents[1]?.voices[0]?.sequence.events[0] ?? {},
      "staffId",
    ),
    false,
  );
  assert.deepEqual(document.extensions, fixture.document.extensions);
});

test("native part owner uses only partId and preserves ordered unknown blocks", () => {
  const fixture = createPartOwnerExtensionRkp2StoreFixture();
  const expected = structuredClone(fixture.document);
  const created = createAccepted(fixture.document);

  const firstBytes = addon.readKernelSessionV1(created.handle);
  const secondBytes = addon.readKernelSessionV1(created.handle);
  assert.deepEqual(firstBytes, secondBytes);
  const wire = firstBytes.toString("utf8");
  assert.match(wire, /"owner":\{"kind":"part","partId":"part-z"\}/u);
  assert.equal(wire.includes("part_id"), false);

  const first = JSON.parse(wire) as {
    value: { snapshot: { document: typeof fixture.document } };
  };
  assert.deepEqual(first.value.snapshot.document.extensions, expected.extensions);
  const firstPartPayload = first.value.snapshot.document.extensions[1]?.payload as {
    order?: unknown[];
  };
  firstPartPayload.order?.push("mutated detached output");
  const third = readPayload(created.handle);
  assert.deepEqual(
    (third.value.snapshot.document as typeof fixture.document).extensions,
    expected.extensions,
  );
});

test("native malformed extension owners keep stable failures and publish zero handle", () => {
  const fixture = createPartOwnerExtensionRkp2StoreFixture();
  const ownerPath = ["document", "extensions", 1, "owner"] as const;
  const cases = [
    {
      owner: { kind: "part", part_id: "part-z" },
      path: [...ownerPath, "partId"],
      violation: "missing-field",
    },
    {
      owner: { kind: "part", partId: "part-z", part_id: "part-z" },
      path: ownerPath,
      violation: "extra-field",
    },
    {
      owner: { kind: "part", partId: "part-z", extra: true },
      path: ownerPath,
      violation: "extra-field",
    },
    {
      owner: { kind: "score", partId: "part-z" },
      path: ownerPath,
      violation: "extra-field",
    },
  ] as const;

  for (const entry of cases) {
    const document = structuredClone(fixture.document) as unknown as {
      extensions: Array<{ owner: unknown }>;
    };
    document.extensions[1]!.owner = entry.owner;
    const result = addon.createKernelSessionV1(canonicalCreateBytes(document));
    assert.deepEqual(Object.keys(result), ["payload"]);
    assert.deepEqual(JSON.parse(result.payload.toString("utf8")), {
      apiVersion: 1,
      status: "rejected",
      failure: {
        failureVersion: 1,
        code: "codec.invalid-shape",
        path: entry.path,
        violation: entry.violation,
      },
    });
  }
});

test("native invalid TS fixtures keep existing stable failures and publish no handle", () => {
  const cases = [
    {
      document: createRkp2DuplicateIdFixture(),
      failure: {
        failureVersion: 1,
        code: "score.invalid-structure",
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
          "id",
        ],
        violation: "duplicate-id",
      },
    },
    {
      document: createRkp2MissingStaffReferenceFixture(),
      failure: {
        failureVersion: 1,
        code: "score.invalid-structure",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "defaultStaffId",
        ],
        violation: "invalid-reference",
      },
    },
  ] as const;

  for (const entry of cases) {
    const result = addon.createKernelSessionV1(canonicalCreateBytes(entry.document));
    assert.deepEqual(Object.keys(result), ["payload"]);
    assert.deepEqual(JSON.parse(result.payload.toString("utf8")), {
      apiVersion: 1,
      status: "rejected",
      failure: entry.failure,
    });
  }
});
