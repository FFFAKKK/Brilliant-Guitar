# CVN-0 Public Unknown-Guard Consistency Operator Plan

## 1. Execution Status

`ACCEPTED / ARCHIVE PENDING — FINAL INDEPENDENT RE-REVIEW PASSED 2026-08-04`.

This document records the approved operator plan and its execution evidence. Production work began only after the task activation gate.

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

## 9. Independent Review Repair Evidence — 2026-07-30

- Independent review returned the first candidate for repair at documentation HEAD `5055eb7882c0dd2ae3bf011ed5eee0787ddfd4cb`: standard cross-Realm dense arrays were rejected, and shared DAG containers were revalidated exponentially.
- Repair commit: `fce2be2f68adc6362f83b95467a17ffef736ad78`.
- RED: 12/14 focused tests passed. The cross-Realm fixture returned `false`, and the 18-unique-container DAG reached 393,214 descriptor inspections before the expected 35 assertion failed.
- GREEN: 14/14 focused tests pass. The same cross-Realm fixture returns `true`; the DAG requires exactly 35 descriptor inspections on its first call and 70 cumulatively after a second call, proving per-call completion with zero retained cross-call state.
- Compatibility: 42/42 related extension/pitch/public-API/codec/semantic/command tests pass; the full compiled test corpus passes 183/183 under the Node test runner's official single-process isolation mode.
- Static evidence: typecheck, build, focused helper coverage (93.70% lines / 92.73% branches), public export count `48` and SHA-256 `99f4e3c6f35e4765cf9b338efe9421dfa0fa74c2a6b26b2f623ed13deb3b923c`, forbidden/debug scan, and `git diff --check` pass.
- Environment note: default process-isolated Node test discovery reached Windows `spawn EPERM`; `node --test --test-isolation=none "dist/test/**/*.test.js"` ran the identical compiled glob and all 183 tests in the current process.
- Gate at that checkpoint: repaired implementation candidate complete; independent re-review was pending and the task remained `in_progress`.

## 10. Second Independent Review Repair Evidence — 2026-08-01

- Independent re-review of repair commit `fce2be2f68adc6362f83b95467a17ffef736ad78` closed the cross-Realm and shared-DAG findings, then returned two remaining boundaries: reflection traps could replace later-used built-ins outside the helper catch, and an Array instance used as a custom prototype could pass the Array-brand-only rule and supply inherited `toJSON`.
- P1 RED was staged as one progressive fixture: before the public wrappers it leaked `PRIVATE_UG_SET_ADD_SIDE_EFFECT`; after wrapping only `isJsonValue` it advanced to `PRIVATE_UG_INCLUDES_SIDE_EFFECT`; after wrapping `isWrittenPitch` it advanced to `PRIVATE_UG_SAFE_INTEGER_SIDE_EFFECT`. Wrapping all three complete public predicate bodies made the fixture return `false` at every stage while `finally` restored each global descriptor.
- P2 RED first proved `Object.setPrototypeOf([1], [])` and an inherited-`toJSON` prototype were accepted. A stronger structurally linked user-constructor/prototype pair with a null-rooted parent also failed before the Realm-native constructor check was added.
- GREEN: 16/16 focused tests pass. Standard cross-Realm dense arrays remain accepted; Array-branded custom prototypes, inherited `toJSON`, mismatched/back-linked user constructors and the stronger structural spoof all return `false`.
- Compatibility: 42/42 related extension/pitch/public-API/codec/semantic/command tests pass; the exact full `npm test` corpus passes 185/185.
- Focused coverage: `extensions.ts` 96.43% lines / 96.15% branches / 100% functions; `strict-data.ts` 95.03% lines / 94.20% branches / 100% functions; pitch guard branches 100% (the focused file intentionally does not exercise the separate transposition algorithm).
- Gate: second-repair implementation candidate complete in the worktree; final independent re-review remains pending, CVN0-AC011 remains unchecked, and the task stays `in_progress`.

## 11. Third Independent Review Repair Evidence — 2026-08-03

- The second-repair audit closed raw exception leakage but reproduced three forged-return false positives: no-op `Array.prototype.push` accepted `{ invalid: undefined }`, forged `includes` accepted step `H`, and forged `Number.isSafeInteger` accepted fractional Transposition fields. It also reproduced real VM Realm `Array.prototype` pollution through own `toJSON` and a replacement null-rooted parent with `toJSON`.
- RED: the focused suite compiled with 16/18 passing; the two new fixtures failed through the public export boundary.
- GREEN: strict-data, traversal, and pitch guards capture required primordials at module initialization, invoke them through captured `Reflect.apply`, and reject live replacement. Cross-Realm recognition now compares captured Array/Object prototype descriptor surfaces. A call-local validated-prototype list is final-revalidated before success, preserving 20,000-level iterative behavior without cross-call retention.
- Security closure: direct public-boundary reproduction yields `false` for all three forged-return cases and both VM pollution cases; an unmodified VM `[1, true, null]` remains `true`.
- Compatibility: 18/18 focused tests, 42/42 related extension/pitch/public-API/codec/semantic/command tests, and 187/187 full tests pass. The 20,000-level focused fixture completed in 39.89 ms in the post-fix focused run.
- Focused coverage: `strict-data.ts` 89.63% lines / 84.25% branches / 100% functions; `extensions.ts` 94.87% lines / 93.33% branches / 100% functions; pitch guard branches 90.91%.
- Gate: third-repair implementation candidate is ready for final independent re-review; CVN0-AC011 remains unchecked and the task stays `in_progress`.

## 12. Fourth Independent Review Repair Evidence — 2026-08-03

- The follow-up P2 reproduced a collision in the generic cross-Realm descriptor fingerprint: `Array.prototype.values = Set.prototype.values` left two native sources as `function values() { [native code] }`, so source comparison could not distinguish them even though calling `value.values()` threw `TypeError`.
- Contract decision: JsonValue validates only inherited prototype behavior that can alter an otherwise dense array's JSON meaning — the Realm-native Array/Object constructor back-references, a null-rooted Object parent, and absence of own `toJSON` on both prototypes. It deliberately does not fingerprint unrelated Array methods such as `values`.
- GREEN: `strict-data.ts` removes the generic recursive descriptor/function-surface system (352 lines after the reduction) and retains the narrow JSON-serialization/prototype-chain validation. Existing own/inherited `toJSON`, custom prototype, and replaced-parent fixtures continue to return `false`.
- Regression: focused UG-T07 now builds a VM value with `Array.prototype.values = Set.prototype.values`; `JSON.stringify(value)` remains `[1]`, direct `value.values()` throws cross-Realm `TypeError`, and `isJsonValue(value)` remains `true` by the documented contract. The focused suite passes 19/19.
- Direct public-boundary reproduction reports `{ unrelatedMethod: true, unrelatedMethodJson: "[1]", unrelatedMethodInvocation: "TypeError", ownToJson: false, replacedParent: false, validCrossRealm: true }`.
- Verification: typecheck and build pass; the complete `npm test` corpus passes 188/188. Focused coverage is `strict-data.ts` 91.54% lines / 88.46% branches / 100% functions, `extensions.ts` 94.87% / 93.33% / 100%, and pitch guard branches 90.91%.
- Gate: fourth-repair implementation candidate is complete; final acceptance is recorded below and archive bookkeeping is pending.

## 13. Final Independent Re-Review — 2026-08-04

- Scope: reviewed the four CVN-0 production/test paths and the synchronized Core/task documentation against CVN0-R001–R006 and CVN0-AC001–AC011.
- Fresh verification: `npm.cmd run typecheck`, `npm.cmd test`, all three task validations, and `git diff --check` pass; the full suite reports 188/188.
- Direct public-boundary probes confirm forged `push`, `includes`, and `Number.isSafeInteger` outcomes return `false`; a standard VM array remains `true`; VM `toJSON` pollution and a replaced parent return `false`; the documented non-serialization `values` substitution remains `true` with unchanged JSON output.
- Review verdict: no reproducible P0/P1/P2. CVN0-AC011 passes. The implementation introduces no public export, public size policy, retained traversal state, mutable global guard state, generalized decoder, or out-of-scope Core/Guitar/UI/IO dependency.
- Closeout: work commits, task archive, and session journal are the remaining bookkeeping actions.
