# CVN-0 Public Unknown-Guard Consistency Operator Plan

## 1. Execution Status

`IMPLEMENTATION CANDIDATE / INDEPENDENT ACCEPTANCE PENDING`.

This document instructs the later operator. Planner-owned production implementation is outside this task preparation pass.

## 2. Activation Baseline

- Branch: `codex/cvn-0-public-unknown-guard-consistency`
- Base branch: `codex/gd-0-guitar-domain-core-transaction-contract`
- Activation HEAD: `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`
- Core V1 compatibility base: `d92a7586536ac8757c318ae6f75aabd8698f85ac`
- Parent FC: CVN-FC-010
- Archived finding: CKV1-AUDIT-001

Before implementation, the operator records a fresh HEAD/status and confirms the approved planning files are present in the working tree.

## 3. Ordered Operator Checklist

### Step 0 — Read and characterize

- [x] Read child `prd.md`, `design.md`, this file, parent CVN-FC-010, active Core boundary/quality specs and archived finding.
- [x] Record existing ordinary results for JsonValue, WrittenPitch and Transposition fixtures.
- [x] Record exact public export allowlist.
- [x] Confirm protected production paths show zero pre-existing drift relative to activation HEAD.

### Step 1 — Add focused failing tests first

- [x] Create only `test/core-kernel/public-unknown-guards.test.ts` for UG-T01–UG-T13.
- [x] Prove the current baseline reproduces the three CKV1-AUDIT-001 observations before repair.
- [x] Keep counters separate for getter, Proxy `get`, `getPrototypeOf`, `ownKeys` and `getOwnPropertyDescriptor` traps.
- [x] Make the huge-sparse fixture assert zero index descriptor checks after structural rejection.
- [x] Make the deep fixture exactly 20,000 levels and avoid recursive construction/assertion helpers.

### Step 2 — Introduce the narrow private inspection helper

- [x] Prefer `src/core-kernel/domain/strict-data.ts` when it removes real duplication between pitch and extensions.
- [x] Implement only the primitives listed in design §4.
- [x] Keep every reflection operation inside a total exception boundary.
- [x] Keep helper exports private to internal module imports and absent from the Core root.
- [x] Add no dependency, cache, global mutable state, logger, Error subclass or result union.

If two local implementations are materially shorter and clearer than a helper, the operator records that private-layout choice in the check report; observable contracts remain identical.

### Step 3 — Repair pitch/transposition guards

- [x] Replace direct untrusted field reads with exact descriptor snapshots.
- [x] Validate captured values once in fixed key order.
- [x] Preserve current type-predicate signatures and numeric ranges.
- [x] Run UG-T02–UG-T07 and existing pitch transposition tests.

### Step 4 — Repair JsonValue guard

- [x] Replace recursive property reads with the iterative active-path algorithm.
- [x] Preserve finite primitive, cycle, DAG/shared-reference and sparse decisions.
- [x] Apply the array fast-rejection order before index iteration.
- [x] Run UG-T01/UG-T04–UG-T12 and existing extension tests.

### Step 5 — Compatibility and spec closeout

- [x] Run public API allowlist and semantic/command consumer tests.
- [x] Synchronize `pure-kernel-boundary.md` and `quality-guidelines.md` from “future prerequisite” to the implementation candidate contract only after code evidence is green.
- [x] Update task evidence with exact test counts and changed paths.
- [ ] Request independent review before archive/merge.

## 4. Required Verification Commands

Run from the CVN-0 worktree root:

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/public-unknown-guards.test.js
node --test dist/test/core-kernel/extensions.test.js
node --test dist/test/core-kernel/pitch-transposition.test.js
node --test dist/test/core-kernel/public-api-boundary.test.js
npm test
python ./.trellis/scripts/task.py validate 07-30-cvn-0-public-unknown-guard-consistency
git diff --check
```

Additionally inspect:

```powershell
git diff --name-only 8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c -- src test package.json tsconfig.json
rg -n "react|tauri|vexflow|web-audio|node:fs|child_process|guitar" src/core-kernel/domain test/core-kernel/public-unknown-guards.test.ts
```

The first command must list only the approved production/test paths. The dependency scan is evidence to classify manually; matches in literal test descriptions do not independently prove a violation.

## 5. Stop Conditions

Stop implementation and return the task to planning when any of these occurs:

- a public export/signature/result type would change；
- a V1 input-size cap would be added；
- command, history, replay, Registry, report, migration or persisted schema needs a behavior change；
- production files outside the three-path allowlist require edits；
- the helper grows into a generalized public codec/decoder subsystem；
- valid exact plain/null-prototype values change result；
- a getter or Proxy `get` trap executes；
- full Core behavior diverges beyond the explicitly approved hostile-shape tightening；
- a package/dependency/build configuration change is proposed。

## 6. Review Evidence Required

The operator's handoff back to the planner/reviewer must include:

- changed-file list；
- UG-T01–UG-T14 result matrix；
- getter/Proxy counter results；
- typecheck/build/focused/full test counts；
- public export diff result；
- protected path and forbidden dependency result；
- Trellis validation and `git diff --check` result；
- rollback statement。

## 7. Planner-to-Operator Gate

- [x] Task and branch created.
- [x] Parent dependency and activation hashes recorded.
- [x] PRD/design/operator plan contain exact observable contracts.
- [x] User reviewed and approved the child planning package on 2026-07-30.
- [x] `task.py start` ran after that review and transferred implementation ownership to the operator.

## 8. Implementation Candidate Evidence — 2026-07-30

- Activation HEAD: `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`.
- Planning/activation commit: `f02ba003b9d166cc328a109329efdb30f93d6af2`.
- Implementation commit: `7c60d8e32e8df8cdf70801d353551dfccad01b0c`.
- RED: the compiling focused file reported 4 passing and 8 failing tests against the activation implementation; failures covered every intended hostile boundary.
- GREEN: 12/12 focused guard tests, 17/17 guard/extension/pitch/public-API tests, 37/37 codec/semantic/command consumer tests, and 181/181 full tests passed.
- Static gates: typecheck, build, public export count `48`, forbidden-dependency scan, Trellis validation, and `git diff --check` passed.
- Production paths: `src/core-kernel/domain/extensions.ts`, `src/core-kernel/domain/pitch.ts`, and private `src/core-kernel/domain/strict-data.ts` only.
- Test path: `test/core-kernel/public-unknown-guards.test.ts` only; existing tests were preserved.
- Rollback: revert the implementation commit; no persisted schema, migration, package, dependency, or public export changed.
- Gate: implementation candidate complete; independent acceptance pending.
