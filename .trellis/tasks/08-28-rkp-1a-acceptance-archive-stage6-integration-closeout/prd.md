# RKP-1A Acceptance Archive and Stage6 Integration Closeout

## Goal

Plan, but do not execute, the bounded owner closeout for independently passed RKP-1A P4 candidate `08374273b05bc992e749a17a959b64af0f293f0b`: accepted-B authority transition, native Trellis archive, archive self-reference repair, and a Stage6 fast-forward-only integration.

## Fixed facts

- Accepted implementation candidate: `08374273b05bc992e749a17a959b64af0f293f0b`; direct parent A3 is `3063e0972072e246d43add8640ba1fe1ad02d787`.
- RKP-1A currently has exactly thirteen task artifacts. Its required archive root is `.trellis/tasks/archive/2026-08/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair/`.
- Stage6 source remains `639e93555c15b46c54c8e9bb7ec610d4a77c7478`; TypeScript remains the default runtime and E2/E3 remain false.
- Current workspace-law deliberately treats `HEAD` as the sole B child of A3. A C0 planning descendant therefore creates one additional bounded governance RED; it is not a product regression.

## Requirements

1. C0 is planning-only. It must not run `task.py start`, acceptance, archive, merge, fast-forward, push, qualification, default cutover, RKP-3 or Stage6 E2.
2. Later C1-C5 must be individually authorized, committed, gated and reversible. Failure stops at the last passing boundary.
3. C1 must anchor the immutable implementation range to accepted B rather than mutable `HEAD`, retain A3→B direct/non-merge proof, and separate historical active from current archive roots.
4. C2 must use native `task.py archive` and move exactly thirteen old RKP-1A source artifacts to exactly thirteen archive destinations.
5. C3 may repair only the archived `task.json`, `implement.jsonl`, and `check.jsonl` if their active self-paths actually break after C2. Any further archive authority defect returns for planning review.
6. C4 must fast-forward Stage6 only from clean `639e935...` and only if it is an ancestor of closeout HEAD. Cherry-pick, squash, merge commit, rebase and history rewrite are forbidden.
7. C5 requires a new independent audit before archiving this closeout task. Its manifests must remain valid after its own archive.

## Acceptance criteria

- [ ] C0 planning candidate passes its own self-audit and is ready for independent closeout planning review.
- [ ] C0 changes only this new task directory plus the four RKP-1A lifecycle/evidence paths and three permitted coordination `task.json` paths.
- [ ] C0 focused workspace-law is exactly 10 tests / 6 pass / 4 expected failures: three pre-existing unaccepted-child gates plus the one RKP-1A B-child closeout-planning descendant gate.
- [ ] C1-C5 literal allowlists, historical ranges, archive inventory, transition failures, fast-forward preconditions and rollback boundaries are executable without wildcard or directory exemptions.
- [ ] No C0 action accepts, archives, integrates or starts Stage6 E2.

## Non-goals

- No production, Rust, TypeScript runtime, fixture, Cargo, package, tsconfig, specification, archive or workspace-law change in C0.
- No performance qualification, CVN-7 official measurement, 10,000 submit/replay, default-runtime switch or RKP-3 creation.
