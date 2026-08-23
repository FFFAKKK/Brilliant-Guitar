# Baseline Regression Evidence

## Reproduction

- worktree: `.worktrees/rkp-2-indexed-live-score-store-load-encode-parity`
- base: `063b332dd48c05796fb3450a8004f42ff2148b20`
- date: 2026-08-24
- command: build, then `node --test dist/test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.js`

## Result

Six tests were discovered: four passed and two failed.

1. Historical matrix lookup failed with `Filename too long` because the test-owned Git helper omitted per-command `core.longpaths=true`.
2. Lifecycle assertion failed with `ENOENT` because it read the removed active child path and still expected `in_progress` after native archive.

Static inspection also found that `candidateChangedPaths()` mixes `PLANNING_HEAD..HEAD` with current dirty state. That is a moving future-stage projection, not the closed independently audited RKP-1 interval.

## Classification

This is a post-archive regression in one test and lifecycle projection, not a Rust runtime behavior regression. TypeScript build passes before the focused test, and the repair requires no production change.
