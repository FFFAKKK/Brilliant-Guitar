# Core Kernel V1 Functional Completeness and Bug Audit

## Verdict

**`pass-with-nonblocking-gaps`**

At accepted HEAD `d92a7586536ac8757c318ae6f75aabd8698f85ac`, no reproducible behavior contradicts an approved K1-1 through K1-6 contract. Fresh gates pass, 25/26 contract groups have specification and decisive test evidence, and one public-helper boundary remains under-specified. There are no P0, P1, or P2 findings and no repair blocker.

## Audit Baseline and Boundaries

- Branch: `codex/k1-6-core-kernel-integration-gate`
- Audited HEAD: `d92a7586536ac8757c318ae6f75aabd8698f85ac`
- Environment: Node.js `24.15.0`, npm `11.12.1`, Windows x64
- Scope: accepted Pure Core Kernel V1 contracts only
- Excluded: Guitar Domain, UI, rendering, playback, physical IO, import/export, networking, Extension Host, third-party execution, performance/stress/fuzz/cross-platform certification
- Repository changes made by the audit: this task directory only; no production source, test, package, configuration, active Core spec, archived task, or product document was edited

## Fresh Gate Evidence

| Gate | Result |
|---|---|
| `npm run typecheck` | passed, exit 0 |
| `npm run build` | passed, exit 0 |
| `npm test` | 169/169 passed, 0 failed |
| `git diff --check` | passed, exit 0 |
| Trellis validation | passed for `07-26-core-kernel-v1-qualification-gate` |
| Branch / HEAD check | exact authorized branch and HEAD |

## Contract Coverage

The detailed 26-row mapping is in `contract-matrix.md`.

| Classification | Count |
|---|---:|
| covered | 25 |
| coverage-gap | 0 |
| spec-gap | 1 |
| reproducible-bug | 0 |

Every public runtime export is owned by exactly one matrix row. Type-only contracts are grouped with their runtime owner. K1-6 is represented once as integration evidence because it introduced no production API.

## Focused High-Risk Evidence

The probes ran through `dist/src/core-kernel/index.js` using inline Node input only; no probe file was written into source or tests.

1. **Strict decode / hostile unknown:** a root Proxy and a nested accessor each produced only `decode.unreadable-input`; the raw exceptions did not escape. Under the accepted K1-1 contract, unreadable getters may be touched and must collapse to the stable diagnostic. Descriptor-first zero-getter behavior is separately promised and verified for command, address, Registry, and report decoders.
2. **Invalid versus unsupported:** a duplicate event ID produced semantic failure and profile status `invalid`; a semantic-valid two-note chord produced only `unsupported.chord` with status `unsupported`.
3. **Transaction/state machine:** missing target rejection left the complete read state and event list unchanged; a commit followed by identical no-op, checkpoint, undo, and redo ended at document version 3, history `1/0`, `dirty: false`. Replay of the accepted command produced the same document.
4. **Snapshot/checkpoint/dirty/events:** the focused sequence produced seven deterministic events; a rejecting async subscriber did not stop the later subscriber, which received all seven.
5. **Registry/Capability:** a valid `internal.none` module without `command:execute` received `registry.capability-denied` with `{ moduleId, capability }`; document, version, history, and dirty state remained unchanged.
6. **Issue/report privacy:** a diagnostic with an accessor `details` field produced `report.invalid-input`, executed zero getter calls, and leaked no private error text. A sparse diagnostics array produced a rejected report containing only `report.invalid-input`.
7. **Migration and ExtensionBlock:** current-schema migration returned `not-required` with a completed report; opaque extension JSON remained deeply equal and detached from later caller mutation. Command/replay extension preservation is additionally covered by the accepted suite.

## Findings

### CKV1-AUDIT-001 — P3 — Public unknown-value guard behavior is not specified

**Classification:** `spec-gap` (not a `reproducible-bug`)

**Affected public entries:**

- `isWrittenPitch(value: unknown)`
- `isTransposition(value: unknown)`
- `isJsonValue(value: unknown)`

**Shortest stable observation:**

```text
isWrittenPitch(Proxy with throwing step getter)       -> throws PITCH_GET; getCalls = 1
isTransposition(Proxy with throwing diatonic getter)  -> throws TRANSPOSITION_GET; getCalls = 1
isJsonValue(object with enumerable value getter)      -> true; getCalls = 1
```

**Expected contract:** not defined. `score-document-model.md` defines the data shapes and the strict score decoder result boundary, but it does not decide whether these separately exported predicates accept only trusted runtime values, must never throw, or must avoid accessor/Proxy execution.

**Actual result:** the three helpers expose different hostile-object behavior. Existing tests cover normal JSON, cycles, sparse arrays, transposition outcomes, and root-export presence, but do not establish one hostile-input policy for the predicates themselves.

**Affected state:** none. The observation is limited to direct predicate calls; no `CommandBus`, history, dirty/checkpoint, event, Registry, report, or migration state is created or mutated. Approved strict public decoders continue to return their closed results.

**Next action:** the planner should make one explicit API decision in a separate approved task: either document these predicates as trusted-value helpers, or require a descriptor-first/no-throw hostile-input contract and add focused regression tests. No Core repair is justified until that contract is chosen.

## Severity Summary

| Severity | Count | Blocking |
|---|---:|---|
| P0 | 0 | yes |
| P1 | 0 | yes |
| P2 | 0 | no current finding |
| P3 | 1 | no |

## Final Decision

Pure Core Kernel V1 passes functional-completeness and reproducible-defect qualification against its approved contracts, with the single nonblocking public-helper spec gap above. The audit does not authorize a repair or any Guitar/product implementation; either action remains separately planned and approved.
