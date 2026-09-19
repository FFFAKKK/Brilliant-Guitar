import { test } from "node:test";
import assert = require("node:assert/strict");
import {
  KernelPluginDiagnosticLog,
  kernelPluginDiagnostics,
  recordKernelPluginDiagnostic,
} from "../../src/core-kernel/errors/plugin-diagnostics";

test("kernel/plugin diagnostics retain bounded, non-payload context", () => {
  const log = new KernelPluginDiagnosticLog();
  const observed: string[] = [];
  const unsubscribe = log.subscribe((entry) => observed.push(entry.reportId));
  for (let index = 0; index < 130; index += 1) {
    log.append({
      code: "command.contribution-contract-violation",
      context: { stage: "callback", operation: "prepare", moduleId: "fixture.module", contributionId: "fixture.contribution" },
    });
  }
  unsubscribe();
  assert.equal(log.list().length, 128);
  assert.equal(log.list()[0]?.moduleId, "fixture.module");
  assert.equal(log.list()[0]?.contributionId, "fixture.contribution");
  assert.equal(log.list()[0]!.message, "插件返回结果违反内核协议");
  assert.equal(observed.length, 130);
  assert.match(log.list()[0]!.reportId, /^kdiag-/u);
});

test("the process log records stable conflict codes with a report id", () => {
  kernelPluginDiagnostics.clear();
  const entry = recordKernelPluginDiagnostic("command.required-contribution-incompatible", {
    stage: "assembly", operation: "create",
  });
  assert.equal(entry.code, "command.required-contribution-incompatible");
  assert.equal(entry.message, "插件不支持乐谱所需的扩展版本");
  assert.equal(kernelPluginDiagnostics.list().at(-1)?.reportId, entry.reportId);
  kernelPluginDiagnostics.clear();
});

test("effect rejection diagnostics retain attribution without target or payload data", () => {
  const log = new KernelPluginDiagnosticLog();
  const context = {
    stage: "callback" as const,
    operation: "prepare" as const,
    moduleId: "fixture.module",
    contributionId: "fixture.contribution",
    effectIndex: 3,
    effectKind: "fixture.effect.apply",
    failureCode: "command.target-not-found",
    target: { kind: "note", noteId: "private-note-id" },
    payload: { private: "score-content" },
  };
  const entry = log.append({
    code: "command.contribution-effect-rejected",
    context,
  });
  assert.deepEqual(entry, {
    reportId: entry.reportId,
    occurredAt: entry.occurredAt,
    code: "command.contribution-effect-rejected",
    stage: "callback",
    operation: "prepare",
    moduleId: "fixture.module",
    contributionId: "fixture.contribution",
    effectIndex: 3,
    effectKind: "fixture.effect.apply",
    failureCode: "command.target-not-found",
    message: "插件请求的内核修改被拒绝",
  });
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes("private-note-id"), false);
  assert.equal(serialized.includes("score-content"), false);
});
