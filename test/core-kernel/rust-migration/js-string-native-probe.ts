import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CommandBus } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { createRkp4MetadataCommand } from "./rkp-4-fixtures";

// Explicit diagnostic executable while the string-domain migration is open.
// It exits unsuccessfully on parity gaps; it is not a passing qualification test.
export function probeJsStringNativeCompatibility() {
  const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
  const rows: Array<Record<string, unknown>> = [];
  const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  let mismatchCount = 0;
  for (const [label, text] of [["high", "\ud800"], ["low", "\udc00"], ["pair", "😀"], ["replacement", "\ufffd"]] as const) {
    const units = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
    for (const field of ["title", "extension-value", "extension-key", "staff-id"] as const) {
      const source = createCoreScoreFixture();
      const document = {
        ...source,
        metadata: { ...source.metadata, title: field === "title" ? text : source.metadata.title },
        extensions: field.startsWith("extension") ? [{ namespace: "example.surrogate", schemaVersion: 1, owner: { kind: "score" as const }, payload: field === "extension-value" ? { value: text } : { [text]: "retained" } }] : source.extensions,
        parts: field !== "staff-id" ? source.parts : source.parts.map(part => ({
          ...part, staves: part.staves.map(staff => ({ ...staff, id: text })),
          measureContents: part.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({ ...voice, defaultStaffId: text })) })),
        })),
      };
      const ts = CommandBus.create(document);
      assert.equal(ts.ok, true, "reference string acceptance");
      if (!ts.ok) throw new Error("TS oracle required");
      const reference = ts.value.read();
      assert.ok(reference.ok);
      assert.deepEqual(reference.value.snapshot.document, document);
      const native = createRustKernelSmokeSession(addon, document);
      let equal = false;
      if ("handle" in native) {
        const read = createRustKernelStage4Session(addon, native.handle).read();
        equal = read.status === "ok" && isDeepStrictEqual(plain(read.value.snapshot.document), document);
      }
      if (!equal) mismatchCount++;
      rows.push({ label, units, field, ts: "accepted", native: native.result, snapshotEqual: equal });
    }
    const document = createCoreScoreFixture();
    const ts = CommandBus.create(document);
    if (!ts.ok) throw new Error("TS session required");
    const native = createRustKernelSmokeSession(addon, document);
    if (!("handle" in native)) throw new Error("native control session required");
    const session = createRustKernelStage4Session(addon, native.handle);
    const command = createRkp4MetadataCommand(text);
    for (const [action, referenceAction, nativeAction] of [
      ["submit", () => ts.value.submit(command), () => session.submit(command)],
      ["undo", () => ts.value.undo(), () => session.undo()],
      ["redo", () => ts.value.redo(), () => session.redo()],
    ] as const) {
      const referenceResult = referenceAction();
      const nativeResult = nativeAction();
      const reference = ts.value.read();
      const read = session.read();
      assert.ok(reference.ok);
      const equal = read.status === "ok" && isDeepStrictEqual(plain(read.value.snapshot.document), reference.value.snapshot.document);
      if (referenceResult.status !== nativeResult.status || !equal) mismatchCount++;
      rows.push({ label, units, field: "command", action, ts: referenceResult, native: nativeResult, snapshotEqual: equal });
    }
  }
  return { probeVersion: 1, mismatchCount, rows };
}

if (require.main === module) {
  const report = probeJsStringNativeCompatibility();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.mismatchCount === 0 ? 0 : 1;
}
