import {
  isAgentApprovalPreview,
} from "./agent-contracts.ts";
import type {
  AgentApprovalPreview,
  AgentRunFailureCode,
} from "./agent-contracts.ts";
import type { AgentRunOutcome } from "./run-controller.ts";

export type AgentEvaluationCategory =
  | "capability-routing"
  | "grounded-answer"
  | "failure-handling"
  | "context-continuity"
  | "write-safety";

export type AgentEvaluationTerminalReason = "completed" | "failed" | "cancelled" | "non-terminal";

export interface AgentEvaluationApprovalPreview {
  readonly capabilityId: string;
  readonly preview: AgentApprovalPreview;
}

export interface AgentEvaluationExpectations {
  readonly terminalReason: AgentEvaluationTerminalReason;
  readonly failureCode: AgentRunFailureCode | null;
  readonly requiredCapabilityIds: readonly string[];
  readonly forbiddenCapabilityIds: readonly string[];
  readonly exactCapabilitySequence: readonly string[] | null;
  readonly verificationSatisfied: boolean | null;
  readonly requiredEvidence: readonly string[];
  readonly responseIncludes: readonly string[];
  readonly approvalRequired: boolean | null;
  readonly requiredApprovalPreviews: readonly AgentEvaluationApprovalPreview[];
  readonly maxTurns: number;
  readonly maxCapabilityCalls: number;
  readonly maxDurationMs: number | null;
}

export interface AgentEvaluationCase {
  readonly id: string;
  readonly title: string;
  readonly category: AgentEvaluationCategory;
  readonly fixtureId: string;
  readonly goal: string;
  readonly expectations: AgentEvaluationExpectations;
}

export interface AgentEvaluationObservation {
  readonly terminalReason: AgentEvaluationTerminalReason;
  readonly failureCode: AgentRunFailureCode | null;
  readonly capabilitySequence: readonly string[];
  readonly successfulCapabilityIds: readonly string[];
  readonly verificationSatisfied: boolean;
  readonly verificationEvidence: readonly string[];
  readonly response: string | null;
  readonly approvalRequired: boolean;
  readonly approvalPreviews: readonly AgentEvaluationApprovalPreview[];
  readonly turnCount: number;
  readonly capabilityCallCount: number;
  readonly durationMs: number | null;
}

export type AgentEvaluationCriterion =
  | "terminal-reason"
  | "failure-code"
  | "required-capability"
  | "forbidden-capability"
  | "capability-sequence"
  | "completion-verification"
  | "verification-evidence"
  | "response-content"
  | "approval-required"
  | "approval-preview"
  | "turn-budget"
  | "capability-call-budget"
  | "duration-budget"
  | "executor-completed";

export interface AgentEvaluationCheck {
  readonly criterion: AgentEvaluationCriterion;
  readonly subject: string | null;
  readonly passed: boolean;
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface AgentEvaluationCaseReport {
  readonly caseId: string;
  readonly status: "passed" | "failed" | "infrastructure-failed";
  readonly score: number;
  readonly observation: AgentEvaluationObservation | null;
  readonly checks: readonly AgentEvaluationCheck[];
}

export interface AgentEvaluationSuiteReport {
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
  readonly infrastructureFailedCases: number;
  readonly passRate: number;
  readonly averageScore: number;
  readonly reports: readonly AgentEvaluationCaseReport[];
}

export interface AgentEvaluationExecutor {
  execute(testCase: AgentEvaluationCase): Promise<AgentRunOutcome>;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validText(value: string, maximum: number): boolean {
  return value.trim().length > 0 && value.length <= maximum;
}

function validateTextList(name: string, values: readonly string[]): void {
  if (!unique(values) || values.some((value) => !validText(value, 256))) {
    throw new Error(`Agent evaluation ${name} must contain unique non-empty values`);
  }
}

function validateTextSequence(name: string, values: readonly string[]): void {
  if (values.some((value) => !validText(value, 256))) {
    throw new Error(`Agent evaluation ${name} must contain non-empty values`);
  }
}

export function defineAgentEvaluationCase(testCase: AgentEvaluationCase): AgentEvaluationCase {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(testCase.id)) {
    throw new Error("Agent evaluation case id is invalid");
  }
  if (!validText(testCase.title, 160)
    || !validText(testCase.fixtureId, 160)
    || !validText(testCase.goal, 1200)) {
    throw new Error("Agent evaluation case metadata is invalid");
  }
  const expected = testCase.expectations;
  validateTextList("required capabilities", expected.requiredCapabilityIds);
  validateTextList("forbidden capabilities", expected.forbiddenCapabilityIds);
  validateTextList("required evidence", expected.requiredEvidence);
  validateTextList("response fragments", expected.responseIncludes);
  for (const item of expected.requiredApprovalPreviews) {
    if (!validText(item.capabilityId, 256) || !isAgentApprovalPreview(item.preview)) {
      throw new Error("Agent evaluation approval preview expectation is invalid");
    }
  }
  if (expected.exactCapabilitySequence !== null) {
    validateTextSequence("exact capability sequence", expected.exactCapabilitySequence);
  }
  if (expected.requiredCapabilityIds.some((id) => expected.forbiddenCapabilityIds.includes(id))) {
    throw new Error("Agent evaluation capability expectations conflict");
  }
  if (!Number.isSafeInteger(expected.maxTurns) || expected.maxTurns < 0
    || !Number.isSafeInteger(expected.maxCapabilityCalls) || expected.maxCapabilityCalls < 0
    || expected.maxDurationMs !== null
      && (!Number.isSafeInteger(expected.maxDurationMs) || expected.maxDurationMs < 0)) {
    throw new Error("Agent evaluation budgets are invalid");
  }
  if (expected.terminalReason === "completed" && expected.failureCode !== null) {
    throw new Error("Completed evaluation cases cannot expect a failure code");
  }
  if (expected.terminalReason === "failed" && expected.failureCode === null) {
    throw new Error("Failed evaluation cases must expect a failure code");
  }
  if (expected.terminalReason !== "failed" && expected.failureCode !== null) {
    throw new Error("Only failed evaluation cases can expect a failure code");
  }
  return Object.freeze({
    ...testCase,
    expectations: Object.freeze({
      ...expected,
      requiredCapabilityIds: Object.freeze([...expected.requiredCapabilityIds]),
      forbiddenCapabilityIds: Object.freeze([...expected.forbiddenCapabilityIds]),
      exactCapabilitySequence: expected.exactCapabilitySequence === null
        ? null
        : Object.freeze([...expected.exactCapabilitySequence]),
      requiredEvidence: Object.freeze([...expected.requiredEvidence]),
      responseIncludes: Object.freeze([...expected.responseIncludes]),
      requiredApprovalPreviews: Object.freeze(expected.requiredApprovalPreviews.map((item) => Object.freeze({
        capabilityId: item.capabilityId,
        preview: Object.freeze({ ...item.preview }),
      }))),
    }),
  });
}

export function observeAgentEvaluation(outcome: AgentRunOutcome): AgentEvaluationObservation {
  const state = outcome.run.state;
  const terminalReason: AgentEvaluationTerminalReason = state.lifecycle === "terminal"
    ? state.terminalReason
    : "non-terminal";
  const failureCode = state.lifecycle === "terminal" && state.terminalReason === "failed"
    ? state.failureCode
    : null;
  const timestamps = outcome.run.events.map((event) => event.occurredAt);
  const durationMs = timestamps.length === 0
    ? null
    : Math.max(0, timestamps.at(-1)! - timestamps[0]!);
  const approvalRequests = outcome.run.events.flatMap((event) => event.event.type === "approval.required"
    ? [event.event.approval]
    : []);
  const approvalPreviews = approvalRequests.flatMap((approval) => approval.items.flatMap((item) => (
    item.preview == null ? [] : [{ capabilityId: item.capabilityId, preview: item.preview }]
  )));
  return Object.freeze({
    terminalReason,
    failureCode,
    capabilitySequence: Object.freeze(outcome.run.invocations.map((invocation) => invocation.capabilityId)),
    successfulCapabilityIds: Object.freeze(outcome.run.invocations
      .filter((invocation) => invocation.state.status === "succeeded"
        && invocation.result?.status === "completed")
      .map((invocation) => invocation.capabilityId)),
    verificationSatisfied: outcome.verification?.satisfied === true,
    verificationEvidence: Object.freeze([...(outcome.verification?.evidence ?? [])]),
    response: outcome.response,
    approvalRequired: approvalRequests.length > 0,
    approvalPreviews: Object.freeze(approvalPreviews.map((item) => Object.freeze({
      capabilityId: item.capabilityId,
      preview: Object.freeze({ ...item.preview }),
    }))),
    turnCount: outcome.run.turns.length,
    capabilityCallCount: outcome.run.invocations.reduce((count, invocation) => count
      + invocation.events.filter((event) => event.event.type === "invocation.dispatched").length, 0),
    durationMs,
  });
}

function check(
  criterion: AgentEvaluationCriterion,
  subject: string | null,
  passed: boolean,
  expected: unknown,
  actual: unknown,
): AgentEvaluationCheck {
  return Object.freeze({ criterion, subject, passed, expected, actual });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameApprovalPreview(
  left: AgentEvaluationApprovalPreview,
  right: AgentEvaluationApprovalPreview,
): boolean {
  if (left.capabilityId !== right.capabilityId || left.preview.kind !== right.preview.kind) {
    return false;
  }
  if (left.preview.kind === "field-change" && right.preview.kind === "field-change") {
    return left.preview.field === right.preview.field
      && left.preview.before === right.preview.before
      && left.preview.after === right.preview.after;
  }
  if (left.preview.kind !== "change-list" || right.preview.kind !== "change-list"
    || left.preview.changes.length !== right.preview.changes.length) return false;
  const rightChanges = right.preview.changes;
  return left.preview.changes.every((change, index) => {
    const candidate = rightChanges[index];
    return candidate !== undefined
      && change.field === candidate.field
      && change.before === candidate.before
      && change.after === candidate.after;
  });
}

export function evaluateAgentOutcome(
  testCase: AgentEvaluationCase,
  outcome: AgentRunOutcome,
): AgentEvaluationCaseReport {
  const observation = observeAgentEvaluation(outcome);
  const expected = testCase.expectations;
  const checks: AgentEvaluationCheck[] = [
    check("terminal-reason", null, observation.terminalReason === expected.terminalReason,
      expected.terminalReason, observation.terminalReason),
    check("failure-code", null, observation.failureCode === expected.failureCode,
      expected.failureCode, observation.failureCode),
  ];
  for (const capabilityId of expected.requiredCapabilityIds) checks.push(check(
    "required-capability",
    capabilityId,
    observation.successfulCapabilityIds.includes(capabilityId),
    true,
    observation.successfulCapabilityIds.includes(capabilityId),
  ));
  for (const capabilityId of expected.forbiddenCapabilityIds) checks.push(check(
    "forbidden-capability",
    capabilityId,
    !observation.capabilitySequence.includes(capabilityId),
    false,
    observation.capabilitySequence.includes(capabilityId),
  ));
  if (expected.exactCapabilitySequence !== null) checks.push(check(
    "capability-sequence",
    null,
    sameStrings(observation.capabilitySequence, expected.exactCapabilitySequence),
    expected.exactCapabilitySequence,
    observation.capabilitySequence,
  ));
  if (expected.verificationSatisfied !== null) checks.push(check(
    "completion-verification",
    null,
    observation.verificationSatisfied === expected.verificationSatisfied,
    expected.verificationSatisfied,
    observation.verificationSatisfied,
  ));
  for (const evidence of expected.requiredEvidence) checks.push(check(
    "verification-evidence",
    evidence,
    observation.verificationEvidence.includes(evidence),
    true,
    observation.verificationEvidence.includes(evidence),
  ));
  for (const fragment of expected.responseIncludes) checks.push(check(
    "response-content",
    fragment,
    observation.response?.includes(fragment) === true,
    true,
    observation.response?.includes(fragment) === true,
  ));
  if (expected.approvalRequired !== null) checks.push(check(
    "approval-required",
    null,
    observation.approvalRequired === expected.approvalRequired,
    expected.approvalRequired,
    observation.approvalRequired,
  ));
  for (const preview of expected.requiredApprovalPreviews) checks.push(check(
    "approval-preview",
    `${preview.capabilityId}:${preview.preview.kind === "field-change"
      ? preview.preview.field
      : "change-list"}`,
    observation.approvalPreviews.some((actual) => sameApprovalPreview(actual, preview)),
    preview,
    observation.approvalPreviews,
  ));
  checks.push(check("turn-budget", null, observation.turnCount <= expected.maxTurns,
    expected.maxTurns, observation.turnCount));
  checks.push(check("capability-call-budget", null,
    observation.capabilityCallCount <= expected.maxCapabilityCalls,
    expected.maxCapabilityCalls, observation.capabilityCallCount));
  if (expected.maxDurationMs !== null) checks.push(check(
    "duration-budget",
    null,
    observation.durationMs !== null && observation.durationMs <= expected.maxDurationMs,
    expected.maxDurationMs,
    observation.durationMs,
  ));

  const passedChecks = checks.filter((item) => item.passed).length;
  const score = checks.length === 0 ? 1 : passedChecks / checks.length;
  return Object.freeze({
    caseId: testCase.id,
    status: passedChecks === checks.length ? "passed" : "failed",
    score,
    observation,
    checks: Object.freeze(checks),
  });
}

function infrastructureFailure(testCase: AgentEvaluationCase): AgentEvaluationCaseReport {
  return Object.freeze({
    caseId: testCase.id,
    status: "infrastructure-failed",
    score: 0,
    observation: null,
    checks: Object.freeze([
      check("executor-completed", null, false, true, false),
    ]),
  });
}

export async function runAgentEvaluationSuite(
  cases: readonly AgentEvaluationCase[],
  executor: AgentEvaluationExecutor,
): Promise<AgentEvaluationSuiteReport> {
  if (cases.length === 0) throw new Error("Agent evaluation suite must not be empty");
  if (!unique(cases.map((testCase) => testCase.id))) {
    throw new Error("Agent evaluation suite contains duplicate case ids");
  }
  const validatedCases = cases.map(defineAgentEvaluationCase);
  const reports: AgentEvaluationCaseReport[] = [];
  for (const testCase of validatedCases) {
    try {
      reports.push(evaluateAgentOutcome(testCase, await executor.execute(testCase)));
    } catch {
      reports.push(infrastructureFailure(testCase));
    }
  }
  const passedCases = reports.filter((report) => report.status === "passed").length;
  const infrastructureFailedCases = reports.filter(
    (report) => report.status === "infrastructure-failed",
  ).length;
  const failedCases = reports.length - passedCases - infrastructureFailedCases;
  const totalCases = reports.length;
  return Object.freeze({
    totalCases,
    passedCases,
    failedCases,
    infrastructureFailedCases,
    passRate: totalCases === 0 ? 1 : passedCases / totalCases,
    averageScore: totalCases === 0
      ? 1
      : reports.reduce((sum, report) => sum + report.score, 0) / totalCases,
    reports: Object.freeze(reports),
  });
}
