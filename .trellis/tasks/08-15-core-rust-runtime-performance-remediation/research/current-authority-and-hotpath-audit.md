# Current Authority and Hot-Path Audit

## Architecture authority after V2 acceptance

- Current architecture authority: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` at `e81c739b...`, independently audited by `01a01da3...` with `PASS`, P0/P1/P2=`0/0/0`, 34/34.
- Current TypeScript implementation/specs: observable migration oracle only; active specs remain authoritative for accepted behavior until a separately accepted Rust stage changes implementation.
- Authority sync: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`; RKP-1 must consume its independently audited/accepted result and is not created here.
- Rust target: exactly seven crates; Kernel Runtime owns mechanisms, Kernel Session owns use cases/composition, Product Host owns ApplicationAssembly/Extension Host, and Instrument Plugins are equal protocol consumers.

## Live baseline

- Worktree source: clean `codex/cvn-7-core-vnext-final-qualification`
- HEAD: `b21540fa3636e6c8e827ff24c2099f4ff331285d`
- Current baseline tests: typecheck/build pass, CVN-7 `84/84`, full `531/531`
- Current application runtime exports: 51
- Current Core commands: 28
- Current Module SDK: the exact 8 runtime / 34 type names frozen in `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md`
- Current contribution ABI: nine fields
- Persisted schema: `brilliant-score-1`

The current Core specifications still describe a pure TypeScript runtime. The product authority selects a Windows-first Tauri 2 + TypeScript + React + Vite product. RKP-0 must add a transition authority without prematurely claiming the Rust runtime is already active.

## Latest official input

The official run on `b21540fa` reached the frozen `stress-submit` worker and hit the 10,800,000 ms liveness timeout. The diagnostic record is 411 requests / 410 results, `worker_started=true`, `measurement_complete=false`, `evidence_valid=false`, `partial_evidence=false`, with no accepted evidence publication. It is a scalability input for this plan, not a CVN-7 pass/fail result.

## Decisive hot paths

### Full nested target scan

`src/core-kernel/commands/target-resolver.ts:185-260` walks Parts, Staves, MeasureContents, Voices, Events and Notes for a nested target. A single Note lookup therefore scales with document size despite stable IDs already being present.

### Whole-document candidate clone

`src/core-kernel/commands/effects.ts:1736-1753` calls `cloneValue(document)` before applying an effect set. The batch coordinator similarly creates a whole isolated candidate.

### Growing history-array copies

`src/core-kernel/commands/runtime.ts:181-205`, `:439-457` and `:475-493` build new undo/redo arrays for commit, undo and redo. Long stress histories therefore add a quadratic copying component.

### Full integrated views and repeated semantic work

`src/core-kernel/commands/integrated-runtime.ts:641-768` clones Core document data and compatible ExtensionBlocks for contribution callbacks, performs full semantic validation, recomputes availability and profiles, then invokes validators/classifiers. `:2134-2150` runs this pipeline after the Core transition.

## Planning conclusion

The current behavior is well specified and extensively tested, but the live state representation is not suitable for commercial interactive scale. Merely rewriting the same nested immutable algorithm in Rust would preserve the dominant complexity. The migration therefore requires new indices, a transaction overlay, a compact history structure and incremental validation, with TypeScript retained only as a temporary behavior oracle.
