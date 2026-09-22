# Unified Audit Baseline Authorization

Date: 2026-09-22, Asia/Shanghai.

Date correction: `de3e3a4` incorrectly changed this handoff to September 21.
Local command timestamps establish September 22. The preservation archive
and earlier integration records retain their original September 21 dates.
The completed migration receipt is `2026-09-22-main-migration-receipt.md`.

## Decision

The user explicitly authorized integrating the existing reviewed work into
`main` before all product defects are repaired, so an independent audit can
start from one common source baseline. The requested audit task configuration
is `gpt-5.6-sol` with `xhigh` reasoning.

This supersedes earlier instructions in B8, B9, the workspace index and the
environment guide that made successful native smoke acceptance a prerequisite
for this migration. It does not waive preservation, isolation, truthful test
reporting or the later product-acceptance gate. A unified audit baseline is
not a healthy release or authorization to resume all four development lines.

## Preservation And Migration

Before migration, the coordinator reverified all 85 archived files
(1,006,766 bytes), their source files and restore-rehearsal copies; the four
audited indexes were empty. All 11 B1 protected references were unchanged.
The original main still had exactly 21 modified and 11 untracked files.

The authorized migration sequence is:

1. Commit the reviewed bootstrap correction separately from these audit notes.
2. Preserve only the 32 audited main changes on
   `codex/legacy-main-before-unified-audit`, based on
   `269112b2d85e01827e8cb81bdcc5b671afde4303`.
3. Verify every preserved Git blob against the original file using Git's
   configured clean conversion, retaining the separate raw-byte archive.
4. Return to main and fast-forward only to the fixed, clean integration commit.
   Do not merge the historical preservation branch into the product line.
5. Record the resulting full SHA, preservation SHA and fresh main verification
   results. The old pre-migration preservation command intentionally ceases
   to apply to main; do not rewrite old evidence to make it pass.

Raw archive: `.repo-archive/2026-09-21-legacy-preservation`.
Manifest SHA-256:
`5c32572a894e3c6e460705e2f22387537f5b9d1fe9c5b8da12028c9d38c1f84a`.
Other historical branches, worktrees and the existing smoke failure scene are
retained. No reset, stash, clean, rebase, force overwrite or remote push is part
of this migration. These steps describe authorization, not a completed receipt.

## Known Issues And Evidence Limits

- Native close fails after the backend session/recovery state is disposed.
  Generated window ACL lacks the close/destroy grants used by this route, and
  a rejected final close leaves the force-closing guard set. See B9 for exact
  native observations, source evidence and fault-injection limits. No real
  user document loss was observed; this remains a potential data-safety risk.
- The component registry used to be captured before plugin bootstrap.
  The correction captures it at first composition mount. Registry/layout
  tests and type checks pass, but native/React rendering acceptance is pending.
- The tempo DTO repair is committed as
  `bf1d0da26b52709a803f67a60b3ea2c0fcced7a0`; it does not fix close lifecycle.
- Historical candidate results are not new main results. Report skipped and
  failed checks explicitly; do not relabel old native artifacts with a new SHA.

## Independent Audit Contract

Create a new Git worktree from the exact post-migration main SHA, not an old
module branch. Follow `docs/development-environment.md` for locked tools and
dependencies; each checkout owns its writable `node_modules`, `target`, ports
and isolated test data. Share installed tools/download caches only.

The audit reads production source without editing it. Reports and disposable
reproduction artifacts belong to its own worktree. Do not create Trellis,
merge, push, change architecture, enable providers or use real user documents.
Do not operate the existing coordinator smoke window or other task processes.

Audit stages:

1. Verify base/environment, independently investigate lifecycle, close/save/
   recovery and error handling, and report the first high-risk findings.
2. After approval, audit startup/composition, Rust/TypeScript/native contracts,
   Score preconditions, Agent execution/approval, Plugin identity/grants and
   Kernel transaction/history boundaries.
3. After approval, consolidate the full risk register and module-scoped repair
   recommendations, with integration and regression requirements.

At each small stage, report and stop. For each finding provide severity, exact
file/line, triggering conditions, evidence/reproduction, impact, test gap and
one proposed primary owner; distinguish confirmed findings from hypotheses.
At major stages the coordinator task
`01a0bda0-44ac-77b1-8323-e9e293ae5760` summarizes for the user before work continues.
Kernel participates in reporting. The designated visual-design task is exempt
from progress reporting, not from ownership or worktree isolation; visual
restyling is outside this audit.
