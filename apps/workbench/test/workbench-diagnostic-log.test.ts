import assert from "node:assert/strict";
import test from "node:test";
import { WorkbenchDiagnosticLog } from "../src/feedback/diagnostic-log.ts";

const entry = (sequence: number) => ({ sequence, occurredAt: sequence,
  issue: { code: `issue.${sequence}`, message: "test", severity: "warning" as const,
    source: "host" as const, target: { scope: "workbench" as const } } });

test("diagnostics stay bounded in memory and can be cleared", () => {
  const log = new WorkbenchDiagnosticLog(2);
  log.append(entry(1)); log.append(entry(2)); log.append(entry(3));
  assert.deepEqual(log.list().map((item) => item.sequence), [2, 3]);
  const snapshot = [...log.list()]; snapshot.pop();
  assert.deepEqual(log.list().map((item) => item.sequence), [2, 3]);
  log.clear();
  assert.deepEqual(log.list(), []);
  assert.throws(() => new WorkbenchDiagnosticLog(0), /positive integer/);
});
