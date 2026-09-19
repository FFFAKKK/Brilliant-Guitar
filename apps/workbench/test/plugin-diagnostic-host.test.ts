import assert from "node:assert/strict";
import test from "node:test";

import { capturePersistedPluginDiagnostics, readPersistedPluginDiagnostics } from
  "../src/services/plugin-diagnostic-host.ts";

const diagnostic = {
  reportId: "BG-UI-20260919010101-0001",
  occurredAt: 1_799_999_999_999,
  code: "UI-PLG-008",
  stage: "registration",
  operation: "ui-plugin",
  moduleId: "brilliant.instrument.guitar",
  contributionId: "brilliant.guitar.controls",
  message: "插件组件发生冲突",
};

test("persisted plugin diagnostics are captured as strict frozen transport data", () => {
  const input = [{ ...diagnostic }];
  const captured = capturePersistedPluginDiagnostics(input, 8);
  assert.deepEqual(captured, input);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured?.[0]), true);
  input[0]!.message = "changed";
  assert.equal(captured?.[0]?.message, "插件组件发生冲突");
});

test("malformed, sparse and oversized diagnostic responses fail closed", () => {
  assert.equal(capturePersistedPluginDiagnostics([{ ...diagnostic, secret: "leak" }], 8), null);
  assert.equal(capturePersistedPluginDiagnostics([{ ...diagnostic, occurredAt: -1 }], 8), null);
  assert.equal(capturePersistedPluginDiagnostics([{ ...diagnostic, message: "" }], 8), null);
  assert.equal(capturePersistedPluginDiagnostics(new Array(1), 8), null);
  assert.equal(capturePersistedPluginDiagnostics([diagnostic, diagnostic], 1), null);
});

test("diagnostic reads reject invalid caller limits before touching a host", async () => {
  await assert.rejects(() => readPersistedPluginDiagnostics(0), /between 1 and 256/);
  await assert.rejects(() => readPersistedPluginDiagnostics(257), /between 1 and 256/);
  await assert.rejects(() => readPersistedPluginDiagnostics(1.5), /between 1 and 256/);
});
