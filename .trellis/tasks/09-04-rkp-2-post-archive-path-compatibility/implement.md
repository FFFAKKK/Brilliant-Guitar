# Implementation Plan — RKP-2 Post-Archive Path Compatibility

## Entry gate

- Base is `afdb88efedafac49e396722c85f608cd9d19b890`.
- RED is already reproduced: focused `4/11`, archived validation 12 missing same-task active-path references.
- Direct bounded planning check must pass before `task.py start`.
- TypeScript remains default; E3, qualification, cutover, RKP-3 and push are forbidden.

## Stage 1 — Freeze planning and activate

1. Validate task JSON/JSONL and exact parent-child linkage.
2. Commit the planning candidate.
3. Run a direct scope/rollback/acceptance check and record its exact head.
4. Start the task and commit the activation state alone.

## Stage 2 — Implement the root fix

1. Add exact RKP-2 active/archive location mapping to the workspace-contract test.
2. Keep historical active paths for Git-at-commit evidence and use mapped paths only for current reads.
3. Anchor accepted descendant changes at the activation commit and allow only the literal repair paths.
4. Add the same-task archived JSONL resolver to `task_context.py`.
5. Add hostile assertions for ambiguous/missing/malformed current RKP-2 locations.

## Stage 3 — Focused GREEN

Run:

```text
npm.cmd run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
python ./.trellis/scripts/task.py validate .trellis/tasks/archive/2026-09/08-24-rkp-2-indexed-live-score-store-load-encode-parity
python -m compileall .trellis/scripts/common/task_context.py
```

Do not proceed if any path-only failure remains or any kernel/runtime assertion regresses.

## Stage 4 — Prevention and final gate

1. Complete `research/bug-analysis.md` with the five-dimension analysis and GREEN evidence.
2. Update `.trellis/spec/core-kernel/backend/rust-runtime-transition.md`; record that no repository template counterpart exists.
3. Run task validation, `npm.cmd run typecheck`, `npm.cmd run build`, one full `npm.cmd test`, `git diff --check`, exact protected-path/status checks, and JSON parsing.
4. Record evidence and commit the candidate. No E3/Rust/qualification command is allowed.

## Commit and rollback map

1. `docs(rkp-2): plan post-archive path compatibility repair`
2. `chore(rkp-2): activate post-archive path compatibility repair`
3. `fix(rkp-2): resolve archived task paths exactly`
4. `docs(rkp-2): record post-archive repair evidence`

Revert 4 then 3 to remove implementation/evidence while retaining the approved plan; revert 2 then 1 only if the entire repair is abandoned. Existing RKP-2 archive commits are never rewritten.
