# Review Candidate — RKP-2 Part Owner Wire Contract Repair

## Verdict requested

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`.

This is a docs-only planning candidate. It does not claim planning acceptance or authorize implementation.

## Exact object

- Base: `ce673a2ad62348fa73458d493a45f9c005bf0288`
- Branch: `codex/rkp-2-part-owner-wire-contract-repair`
- Task: `.trellis/tasks/08-26-rkp-2-part-owner-wire-contract-repair`
- Parent: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- Root-cause audit: P0/P1/P2=`0/1/0`, bounded blocking planning child required
- First planning review of `7e211869b7ab8d5ead3916ca8d98107d55f182db`: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/1/0`
- Child targeted rereview state: pending

## Candidate decision

The public owner wire remains exactly score `{kind}` or Part `{kind,partId}`. The Rust identifier `part_id` receives only `#[serde(rename = "partId")]`; the enum receives `deny_unknown_fields`. No alias is accepted. Foundation directly proves Part mapping/Part-extra rejection and exact Score normal decode/encode. Because internally tagged unit `Score` does not reject extras under this derived serde configuration, Contracts and TypeScript remain the sole public score-extra exact-shape owners; no custom Foundation deserializer or unit-variant change is allowed.

## Scope proof

Planning changes are confined to:

- eleven artifacts inside the new child task;
- the RKP-2 task/handoff/review blocking projection;
- the Rust-parent task projection.

Relative to the base, `src/**`, `test/**`, `crates/**`, Cargo/toolchain/rustfmt, package/tsconfig and active spec contents must be zero-delta.

Future technical ownership is exactly the six paths listed in `design.md`; all other production/test paths are protected.

## Review checklist

- [ ] Public `partId` and forbidden `part_id` are unambiguous.
- [ ] Field rename is bidirectional and Part struct fields are closed without claiming derived-serde score-extra closure.
- [ ] Contracts/TypeScript exclusively enforce score-extra public exact shape; Foundation adds no custom deserializer or unit-variant change.
- [ ] No alias, migration or second codec owner exists.
- [ ] Root cause is Foundation, not Contracts, TypeScript or Runtime.
- [ ] Existing stable code/path/violation and zero-publication behavior are preserved.
- [ ] Score/Part unknown blocks, nested JSON and order are covered through real native create/read.
- [ ] Six technical paths are necessary and sufficient.
- [ ] R0–R3 and their rollback points are independent.
- [ ] Planning PASS, implementation authorization, implementation audit, acceptance/archive/integration and S6.1 resume remain distinct.
- [ ] TypeScript default and `2/22/28/51/8/34/9/brilliant-score-1` remain fixed.

## Current lifecycle truth

RKP-2 S6.0 remains committed and is not rewritten. Stage 6 remains started/authorized but operationally paused. S6.1/S6.2/S6.3 are false. This child is planning-only with start/production authorization false, candidate-ready false, review pending, archive/push/cutover/measurement/RKP-3 false.

## Self-audit

Bounded-repair planning self-audit reports P0/P1/P2=`0/0/0` after recording the first independent P1. This is not an independent verdict. Targeted independent rereview remains required.

## Gate evidence

- Trellis child/RKP-2/Rust parent: PASS.
- JSON/JSONL, path existence/uniqueness, parent reference once, Markdown fences and diff-check: PASS.
- Exact planning paths: 15; protected production/test/config/spec delta: zero; RKP-2 JSONLs: zero.
- TypeScript typecheck/build: PASS.
- Clean exact-base dynamic runner: 78 files, manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 576 discovered / 575 pass / 1 expected GC skip / 0 fail.
- Native baseline: 13/13.
- Fresh LF Rust baseline: 70/70 plus fmt/check/clippy/MSRV PASS.
- Candidate workspace-law: expected fail-closed `6/7`; exact clean base: `7/7`. Neither the test nor its accepted allowlist is modified during planning.

The candidate-level RKP-2 workspace-law intentionally does not yet recognize an unreviewed child. Updating that executable allowlist during planning would violate this task's zero-test-delta boundary; the future R2 stage owns the already allowlisted workspace-law change after planning PASS and activation.
