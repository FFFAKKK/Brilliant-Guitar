# Planning review candidate

## Status

`READY FOR DEDICATED INDEPENDENT PLANNING REVIEW`

## Exact object

- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`
- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Candidate HEAD: the exact clean `git rev-parse HEAD` produced by the docs-only planning commit and named in the audit dispatch; this file intentionally avoids a self-referential hash
- Task: `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
- Status: `planning`
- `task_start_run=false`
- `production_implementation_authorized=false`

The candidate is eligible for audit only after the post-commit command set confirms clean/staged-empty status, planning-only diff, Trellis/JSON/JSONL/fence checks, typecheck/build results and the exact Node baseline classification. Any post-commit content repair creates a new HEAD and invalidates the prior audit object.

## Review question

Does this planning candidate define the smallest sufficient prerequisite that makes S6.2's raw-byte inputs and Rust source-shape tests reproducible across `core.autocrlf=true/false`, without changing Rust product behavior or prematurely resuming S6.2?

## Required review focus

1. Base `55cb575c` excludes the unaccepted S6.2 activation/E1 commits.
2. The task is the sole EOL/raw-byte planning owner and is not a concurrent implementation child.
3. `.gitattributes` adds only seven exact path rules.
4. Three Rust files change only in existing `#[cfg(test)]` source-shape checks.
5. Five LF-sensitive sites are all covered, including the site inside the ignored scale test.
6. Dual fresh-checkout verification compares raw bytes, byte lengths, SHA-256 and Git blob bytes without normalization.
7. Cargo and temporary output remain on E:.
8. E1 worker logic is preserved conceptually but `c3c4d198...` is not accepted or reused as evidence authority.
9. The separate E1 provenance P1 has exactly one successor owner and is not silently dropped.
10. E3 remains zero; TypeScript default and all later lifecycle gates remain unchanged.
11. Rollback and new-S6.2 re-entry sequence are deterministic.
12. Planning diff contains no technical/production/test/Cargo/package/tsconfig changes.

## Expected review output

- verdict first;
- P0/P1/P2 counts;
- file:line evidence for each finding;
- exact bounded repair when returning;
- exact reviewed HEAD and clean/staged-empty state;
- no file changes, implementation, task start, acceptance, archive, integration or push.
