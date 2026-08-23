# Design — RKP-1 Post-Archive Workspace Contract and Authority Repair

## 1. Boundary

This repair changes one regression test and lifecycle authority only. It does not reinterpret the independently audited implementation at `94387b339b5e4d9ce6b7f97597a1b56edd051f01`.

```text
historical planning commit paths ── git show ──┐
                                               ├─ frozen RKP-1 allowlist proof
audited implementation commit 94387b ─────────┘

current checkout archived task ──────────────── current lifecycle proof
```

Historical and current projections are deliberately separate. A historical path remains valid at its source commit after native archive moves current authority.

## 2. Exact constants

The repaired test uses explicit planning, repaired-planning and audited-implementation commits, plus distinct historical matrix and current archived-task paths. No commit or path is derived from current branch names.

## 3. Git helper and long-path rule

Every call through the test-owned helper becomes equivalent to:

```ts
execFileSync("git", ["-c", "core.longpaths=true", ...args], ...)
```

No persistent Git configuration, shell concatenation or filesystem alias is used. Argument boundaries remain `execFileSync` array boundaries.

## 4. Frozen implementation projection

`auditedImplementationChangedPaths()` performs exactly:

```text
git diff --name-only 89115daedc623c0d35386a4a433cc7fd95215223..94387b339b5e4d9ce6b7f97597a1b56edd051f01
```

It removes the same seven accepted planning-only paths and compares the remainder with the forty-path repaired matrix at `b944876...`. It never reads current `HEAD`, unstaged diff, staged diff, status or untracked paths.

Historical allowlist file existence is checked with `git cat-file -e 94387b:ALLOWLIST_PATH` or an equivalent exact-commit object lookup. A later checkout may add, move or remove files without rewriting RKP-1 history.

## 5. Current lifecycle projection

The lifecycle assertion reads the archived child and active parent. It verifies child `completed`, exact completion date, passed implementation reviews, exact audited head, parent RKP-1 `accepted_archived`, one child occurrence, TypeScript default and no default cutover. Mutable future-stage coordination fields are excluded.

## 6. Authority repair

The archived task keeps historical evidence. Current-state fields are corrected to `accepted_archived`; a dated appendix records archive, journal, final parent projection and later regression repair. The parent records this repair as the only current planning child until acceptance.

## 7. File ownership

### Planning candidate

Only this new task directory and the active Rust remediation parent `task.json` may change.

### Future implementation

Exactly these non-task paths may change:

```text
test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts
.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/task.json
.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/review-candidate.md
.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/operator-handoff.md
.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/implementation-evidence.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
```

The repair task's own state, handoff and evidence files may also change. No wildcard expands this allowlist.

## 8. Rollback

Implementation is one test commit plus narrow authority projection. Reverting them returns to `063b332d`; product runtime artifacts never move. RKP-2 planning resumes only after independent implementation PASS and repair archive.
