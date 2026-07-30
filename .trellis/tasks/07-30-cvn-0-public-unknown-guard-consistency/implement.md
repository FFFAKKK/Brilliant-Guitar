# CVN-0 Public Unknown-Guard Consistency Operator Plan

## 1. Execution Status

`IN PROGRESS / USER PLAN APPROVED / TASK.PY START RUN`.

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

- [ ] Read child `prd.md`, `design.md`, this file, parent CVN-FC-010, active Core boundary/quality specs and archived finding.
- [ ] Record existing ordinary results for JsonValue, WrittenPitch and Transposition fixtures.
- [ ] Record exact public export allowlist.
- [ ] Confirm protected production paths show zero pre-existing drift relative to activation HEAD.

### Step 1 — Add focused failing tests first

- [ ] Create only `test/core-kernel/public-unknown-guards.test.ts` for UG-T01–UG-T13.
- [ ] Prove the current baseline reproduces the three CKV1-AUDIT-001 observations before repair.
- [ ] Keep counters separate for getter, Proxy `get`, `getPrototypeOf`, `ownKeys` and `getOwnPropertyDescriptor` traps.
- [ ] Make the huge-sparse fixture assert zero index descriptor checks after structural rejection.
- [ ] Make the deep fixture exactly 20,000 levels and avoid recursive construction/assertion helpers.

### Step 2 — Introduce the narrow private inspection helper

- [ ] Prefer `src/core-kernel/domain/strict-data.ts` when it removes real duplication between pitch and extensions.
- [ ] Implement only the primitives listed in design §4.
- [ ] Keep every reflection operation inside a total exception boundary.
- [ ] Keep helper exports private to internal module imports and absent from the Core root.
- [ ] Add no dependency, cache, global mutable state, logger, Error subclass or result union.

If two local implementations are materially shorter and clearer than a helper, the operator records that private-layout choice in the check report; observable contracts remain identical.

### Step 3 — Repair pitch/transposition guards

- [ ] Replace direct untrusted field reads with exact descriptor snapshots.
- [ ] Validate captured values once in fixed key order.
- [ ] Preserve current type-predicate signatures and numeric ranges.
- [ ] Run UG-T02–UG-T07 and existing pitch transposition tests.

### Step 4 — Repair JsonValue guard

- [ ] Replace recursive property reads with the iterative active-path algorithm.
- [ ] Preserve finite primitive, cycle, DAG/shared-reference and sparse decisions.
- [ ] Apply the array fast-rejection order before index iteration.
- [ ] Run UG-T01/UG-T04–UG-T12 and existing extension tests.

### Step 5 — Compatibility and spec closeout

- [ ] Run public API allowlist and semantic/command consumer tests.
- [ ] Synchronize `pure-kernel-boundary.md` and `quality-guidelines.md` from “future prerequisite” to the accepted implemented contract only after code evidence is green.
- [ ] Update task evidence with exact test counts and changed paths.
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
