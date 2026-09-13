import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus } from "../../../src/core-kernel/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { crossCatalog, crossCommand, indexSource } from "../fixtures/cross-plugin-relationship";
import { createModuleKernelIssueV1 } from "../../../src/core-kernel/module-sdk/index";

const addon = require(resolve("target/integrated-v2/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
const catalog = crossCatalog();
function create(mutate: (reply: any) => void) {
  let active = false;
  const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(bytes, execute) {
    return addon.createIntegratedKernelSessionV2(bytes, input => {
      const reply = JSON.parse(execute(input).toString("utf8"));
      if (active && JSON.parse(input.toString("utf8")).operation === "assess") mutate(reply);
      return Buffer.from(JSON.stringify(reply));
    });
  } };
  const restore = installNativeIntegratedBackendV2(transport);
  try {
    const result = CommandBus.createIntegrated(createCoreScoreFixture(), catalog);
    assert.ok(result.ok);
    assert.equal(result.value.submit(crossCommand(false)).status, "committed");
    assert.equal(result.value.submit(crossCommand(true)).status, "committed");
    assert.equal(result.value.submit({ commandVersion: 1, commandId: "core.document.set-metadata",
      target: { kind: "document", documentId: "score-1" }, payload: { metadata: { ...createCoreScoreFixture().metadata, title: "history base" } } }).status, "committed");
    return { bus: result.value, activate: () => { active = true; } };
  } finally { restore(); }
}
const metadata = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
  payload: { metadata: { ...createCoreScoreFixture().metadata, title: "must not adopt" } } };
const issueResult = createModuleKernelIssueV1({ code: "fixture.index.module.unsupported", source: { kind: "module", ...indexSource } });
assert.equal(issueResult.status, "created");
const issue = issueResult.status === "created" ? issueResult.issue : undefined;

test("Rust rejects missing, duplicate, foreign and malformed module assessments before commit or history movement", () => {
  const mutations: ((reply: any) => void)[] = [
    reply => { reply.assessment.modules.pop(); },
    reply => { reply.assessment.modules.push(reply.assessment.modules[0]); },
    reply => { reply.assessment.modules.reverse(); },
    reply => { reply.assessment.modules[0].moduleId = "foreign.module"; },
    reply => { reply.assessment.modules[0].status = "valid"; },
    reply => { reply.assessment.modules[0].extra = true; },
    reply => { reply.assessment.modules[0].issues = [{ ...issue, source: { kind: "module", moduleId: "foreign.module", contributionId: "foreign.contribution" } }]; },
    reply => { reply.assessment.modules[0].issues = [{ ...issue, messageKey: "forged" }]; },
    reply => { reply.assessment.modules[0].issues = [{ ...issue, location: { kind: "diagnostic-path", path: [0.5] } }]; },
    reply => { reply.assessment.modules[0].issues = Array(1025).fill(issue); },
    reply => { reply.availability = { writeAvailability: { status: "read-only" }, validationAvailability: { status: "incomplete" } }; },
  ];
  for (const mutate of mutations) {
    for (const operation of ["submit", "undo", "redo"] as const) {
      const { bus, activate } = create(mutate);
      if (operation === "redo") assert.equal(bus.undo().status, "committed");
      const before = bus.read(), events: unknown[] = [];
      bus.subscribe((event: unknown) => events.push(event));
      activate();
      const result = operation === "submit" ? bus.submit(metadata) : bus[operation]();
      assert.equal(result.status, "rejected", JSON.stringify(result));
      assert.deepEqual(bus.read(), before);
      assert.deepEqual(events, []);
    }
  }
});

test("Rust rejects aggregate semantic failures carrying foreign or malformed module diagnostics", () => {
  for (const issues of [[], [{ ...issue, source: { kind: "module", moduleId: "foreign.module", contributionId: "foreign.contribution" } }],
    [{ ...issue, details: [] }], [{ ...issue, location: { kind: "score-address", address: { kind: "note", noteId: "" } } }]]) {
    const { bus, activate } = create(reply => {
      for (const key of Object.keys(reply)) delete reply[key];
      reply.ok = false;
      reply.failure = { code: "command.contribution-semantic-invalid", issues };
    });
    const before = bus.read();
    activate();
    const result = bus.submit(metadata);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.equal(result.failure.code, "command.internal-error");
    assert.deepEqual(bus.read(), before);
  }
});

test("Valid plugin diagnostics retain their supported location forms and lossless details", () => {
  const locations = [
    { kind: "diagnostic-path", path: ["parts", -1, "\ud800"] },
    { kind: "score-address", address: { kind: "note", noteId: "note-1" } },
    { kind: "score-range", range: { kind: "measure-range", start: { kind: "measure", measureId: "measure-1" }, end: { kind: "measure", measureId: "measure-1" } } },
    { kind: "score-range", range: { kind: "part-measure-range", start: { kind: "part-measure", partId: "part-1", measureId: "measure-1" }, end: { kind: "part-measure", partId: "part-1", measureId: "measure-1" } } },
    { kind: "score-range", range: { kind: "voice-event-range", start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" }, end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" } } },
  ];
  for (const location of locations) {
    const expected = { ...issue, location, details: { nested: ["保留", "\ud800", null, true, -1] } };
    const { bus, activate } = create(reply => { reply.assessment.modules[0].issues = [expected]; });
    activate();
    const result = bus.submit(metadata);
    assert.equal(result.status, "committed", JSON.stringify(result));
    if (result.status === "committed") assert.deepEqual(result.assessment.modules[0]!.issues, [expected]);
  }
});

test("Captured Native read dependencies reject wrong provider, version, reader and duplicate declarations before creating a session", () => {
  for (const mutate of [
    (rows: any[]) => { rows[0].provider.moduleId = "foreign.module"; },
    (rows: any[]) => { rows[0].supportedSchemaVersions = [1]; },
    (rows: any[]) => { rows[0].reader.contributionId = "foreign.contribution"; },
    (rows: any[]) => { rows.push(rows[0]); },
    (rows: any[]) => { rows[0].ownerKinds = ["note"]; },
  ]) {
    let callbacks = 0;
    const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(bytes, executor) {
      const request = JSON.parse(bytes.toString("utf8"));
      mutate(request.assessmentReads);
      return addon.createIntegratedKernelSessionV2(Buffer.from(JSON.stringify(request)), input => { callbacks++; return executor(input); });
    } };
    const restore = installNativeIntegratedBackendV2(transport);
    try {
      const result = CommandBus.createIntegrated(createCoreScoreFixture(), catalog);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.failure.code, "command.assembly-mismatch");
      assert.equal(callbacks, 0);
    } finally { restore(); }
  }
});
