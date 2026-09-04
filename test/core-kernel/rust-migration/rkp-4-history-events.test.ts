import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  type KernelStage4CommandWireV1,
  type KernelStage4MarkPersistedWireV1,
  type RustKernelStage4NativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import {
  assertRkp4DeepFrozen,
  createRkp4MetadataCommand,
  createRkp4OperationBytes,
  parseRkp4Payload,
  type RawRkp4NativeAddon,
} from "./rkp-4-fixtures";

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawRkp4NativeAddon;

function createRawSession(): object {
  const created = addon.createKernelSessionV1(
    Buffer.from(
      JSON.stringify({ apiVersion: 1, document: createCoreScoreFixture() }),
      "utf8",
    ),
  );
  if (created.handle === undefined) throw new Error("native create rejected");
  return created.handle;
}

test("Stage-4 events are ordered, frozen, isolated, and reentrant writes stay local", async () => {
  let nativeOperationCalls = 0;
  const countingAddon: RustKernelStage4NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: addon.submitKernelStage3V1,
    operateKernelStage4V1: (handle, request) => {
      nativeOperationCalls += 1;
      return addon.operateKernelStage4V1(handle, request);
    },
  };
  const created = createRustKernelSmokeSession(
    countingAddon,
    createCoreScoreFixture(),
  );
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native create rejected");
  const session = createRustKernelStage4Session(countingAddon, created.handle);

  const order: string[] = [];
  const nestedWrites: Array<
    KernelStage4CommandWireV1 | KernelStage4MarkPersistedWireV1
  > = [];
  let allowedReadStatus = "";
  let allowedSelectStatus = "";
  let firstEvent = true;
  let unsubscribeSecond = (): void => undefined;

  session.subscribe((event) => {
    order.push(`first:${event.eventType}`);
    if (!firstEvent) return;
    firstEvent = false;
    nestedWrites.push(
      session.submit(createRkp4MetadataCommand("must not enter native")) as KernelStage4CommandWireV1,
      session.undo() as KernelStage4CommandWireV1,
      session.redo() as KernelStage4CommandWireV1,
      session.markPersisted({
        documentId: "score-1",
        documentVersion: 1,
      }) as KernelStage4MarkPersistedWireV1,
    );
    allowedReadStatus = session.read().status;
    allowedSelectStatus = session.select({
      selectorId: "core.selector.history-state",
    }).status;
    unsubscribeSecond();
    session.subscribe((nextEvent) => {
      order.push(`third:${nextEvent.eventType}`);
    });
  });
  const second = session.subscribe((event) => {
    order.push(`second:${event.eventType}`);
  });
  assert.equal(second.status, "subscribed");
  if (second.status === "subscribed") unsubscribeSecond = second.unsubscribe;

  session.subscribe(() => {
    throw new Error("isolated sync failure");
  });
  session.subscribe(() => Promise.reject(new Error("isolated async failure")));
  session.subscribe(() => ({
    then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
      reject(new Error("isolated thenable failure"));
    },
  }));
  let laterHandlerCalls = 0;
  session.subscribe(() => {
    laterHandlerCalls += 1;
  });

  let unhandledRejections = 0;
  const onUnhandled = (): void => {
    unhandledRejections += 1;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const callsBefore = nativeOperationCalls;
    const committed = session.submit(createRkp4MetadataCommand("Stage 4 events"));
    assert.equal(committed.status, "committed");
    assert.equal(nativeOperationCalls - callsBefore, 3);
    assert.deepEqual(
      order,
      [
        "first:core.document.committed",
        "second:core.document.committed",
        "first:core.session.dirty-state-changed",
        "third:core.session.dirty-state-changed",
      ],
    );
    assert.equal(laterHandlerCalls, 2);
    assert.equal(allowedReadStatus, "ok");
    assert.equal(allowedSelectStatus, "ok");
    assert.equal(nestedWrites.length, 4);
    for (const nested of nestedWrites) {
      assert.match(nested.status, /rejected$/u);
      if (
        nested.status !== "command-rejected" &&
        nested.status !== "checkpoint-rejected"
      ) {
        throw new Error("reentrant write unexpectedly succeeded");
      }
      assert.equal(nested.failure.code, "event.reentrant-write");
      assert.deepEqual(nested.events, []);
      assertRkp4DeepFrozen(nested);
    }
    assertRkp4DeepFrozen(committed);
    assert.deepEqual(
      committed.events.map((event) => [event.eventSequence, event.eventType]),
      [
        [1, "core.document.committed"],
        [2, "core.session.dirty-state-changed"],
      ],
    );
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    assert.equal(unhandledRejections, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  let duplicateCalls = 0;
  const duplicate = (): void => {
    duplicateCalls += 1;
  };
  const duplicateA = session.subscribe(duplicate);
  const duplicateB = session.subscribe(duplicate);
  assert.equal(duplicateA.status, "subscribed");
  assert.equal(duplicateB.status, "subscribed");
  assert.equal(session.undo().status, "committed");
  assert.equal(duplicateCalls, 4);
  if (duplicateA.status === "subscribed") {
    duplicateA.unsubscribe();
    duplicateA.unsubscribe();
  }
  assert.equal(session.redo().status, "committed");
  assert.equal(duplicateCalls, 6);

  const persisted = session.markPersisted({
    documentId: "score-1",
    documentVersion: 3,
  });
  assert.equal(persisted.status, "updated");
  assert.equal(persisted.events.length, 1);
  assert.equal(persisted.events[0]?.eventSequence, 7);
});

test("delayed persisted identity updates without inventing a dirty-state event", () => {
  const created = createRustKernelSmokeSession(addon, createCoreScoreFixture());
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native create rejected");
  const session = createRustKernelStage4Session(addon, created.handle);

  assert.equal(session.submit(createRkp4MetadataCommand("delayed A")).status, "committed");
  assert.equal(session.submit(createRkp4MetadataCommand("delayed B")).status, "committed");

  const persisted = session.markPersisted({
    documentId: "score-1",
    documentVersion: 1,
  });
  assert.equal(persisted.status, "updated");
  assert.equal(persisted.value.documentVersion, 2);
  assert.equal(persisted.value.dirty, true);
  assert.deepEqual(persisted.events, []);

  const undo = session.undo();
  assert.equal(undo.status, "committed");
  if (undo.status !== "committed") throw new Error("undo rejected");
  assert.equal(undo.value.dirty, false);
});

test("Stage-3 and Stage-4 calls share history while raw boundary failures stay exact", () => {
  const handle = createRawSession();
  const stage3 = parseRkp4Payload(
    addon.submitKernelStage3V1(
      handle,
      Buffer.from(
        JSON.stringify({
          apiVersion: 1,
          command: createRkp4MetadataCommand("legacy submit"),
        }),
        "utf8",
      ),
    ),
  );
  assert.equal(stage3.status, "committed");

  const read = parseRkp4Payload(
    addon.operateKernelStage4V1(
      handle,
      createRkp4OperationBytes({
        kind: "read",
        knownSnapshotVersion: null,
      }),
    ),
  );
  assert.deepEqual(
    (read.value as { readonly history: unknown }).history,
    { undoDepth: 1, redoDepth: 0 },
  );

  const undo = parseRkp4Payload(
    addon.operateKernelStage4V1(
      handle,
      createRkp4OperationBytes({ kind: "undo" }),
    ),
  );
  assert.equal(undo.status, "committed");
  const legacyRead = parseRkp4Payload(addon.readKernelSessionV1(handle));
  assert.deepEqual(
    (legacyRead.value as { readonly history: unknown }).history,
    { undoDepth: 0, redoDepth: 1 },
  );
  assert.equal((legacyRead.value as { readonly dirty: unknown }).dirty, false);

  const branch = parseRkp4Payload(
    addon.submitKernelStage3V1(
      handle,
      Buffer.from(
        JSON.stringify({
          apiVersion: 1,
          command: createRkp4MetadataCommand("legacy branch"),
        }),
        "utf8",
      ),
    ),
  );
  assert.equal(branch.status, "committed");
  const emptyRedo = parseRkp4Payload(
    addon.operateKernelStage4V1(
      handle,
      createRkp4OperationBytes({ kind: "redo" }),
    ),
  );
  assert.equal(emptyRedo.status, "command-rejected");
  assert.equal(
    (emptyRedo.failure as { readonly code: string }).code,
    "history.empty-redo",
  );

  assert.equal(
    (parseRkp4Payload(
      addon.operateKernelStage4V1(
        {},
        createRkp4OperationBytes({ kind: "undo" }),
      ),
    ).failure as { readonly code: string }).code,
    "bridge.handle-unknown",
  );
  const duplicate = parseRkp4Payload(
    addon.operateKernelStage4V1(
      handle,
      Buffer.from(
        '{"apiVersion":1,"operation":{"kind":"undo","kind":"redo"}}',
        "utf8",
      ),
    ),
  );
  assert.equal(
    (duplicate.failure as { readonly code: string }).code,
    "codec.invalid-shape",
  );

  const limit = 64 * 1024 * 1024;
  const spaces = Buffer.alloc(limit + 1, 0x20);
  assert.equal(
    (parseRkp4Payload(
      addon.operateKernelStage4V1(handle, spaces.subarray(0, limit)),
    ).failure as { readonly code: string }).code,
    "codec.invalid-json",
  );
  assert.deepEqual(
    parseRkp4Payload(addon.operateKernelStage4V1(handle, spaces)),
    {
      apiVersion: 1,
      status: "rejected",
      failure: {
        failureVersion: 1,
        code: "bridge.request-too-large",
        limitBytes: limit,
        actualBytes: limit + 1,
      },
    },
  );
});
