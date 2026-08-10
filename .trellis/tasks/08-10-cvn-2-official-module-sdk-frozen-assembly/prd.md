# CVN-2 Official Module SDK and Frozen Contribution Assembly

> **Lifecycle:** PLANNING BASE PREPARED. The task remains `planning`; `task.py start` and production implementation remain outside this checkpoint.

## Goal

Define an independently reviewable CVN-2 V1 work package that gives statically composed official modules one versioned authoring SDK and compiles their descriptors plus composition-root bindings into one detached, deterministic, deeply frozen, all-or-nothing contribution catalog. This task prepares only that authoring/catalog seam; stateful module execution remains owned by CVN-6.

## Confirmed Entry Baseline

The unified planning baseline is merge commit `706802c`, with accepted-line parents `ebd8075` (Extensibility Reservation Gate plus GD-0) and `7ad1ff1` (final CVN-4 repair and re-acceptance). It contains all required accepted evidence:

| Dependency | Candidate/charter | Acceptance |
|---|---|---|
| final CVN-4 local correctness repair | `b0272e2` | `7f33e7d` |
| Extensibility Reservation charter | `7c4e852` | `253d19e` |
| GD-0 domain/Core transaction contract | `451627e` | `a2b9009` |

CVN-1 is already accepted and archived. The parent roadmap records final CVN-4, the accepted extensibility charter, and accepted/archived GD-0 together.

## Requirements

### CVN2-R001 — Lifecycle and authority

- The task status stays `planning` throughout planning-base preparation and detailed planning review.
- Task creation and planning approval do not activate implementation. `task.py start` requires a later explicit execution decision after complete planning artifacts and independent planning review.
- The unified merge commit is the only accepted planning base; neither source line may be used alone.

### CVN2-R002 — Exact contract ownership

- CVN-2 owns exactly `CVN-FC-110` and `CVN-FC-111`.
- `CVN-FC-110` fixes the single additive authoring entry `kernel.domain-commands.v1` and the minimum `CompiledDomainCommandContributionV1` ABI.
- `CVN-FC-111` fixes detached, deterministic, all-or-nothing frozen catalog construction and its startup limits.
- No other parent FC becomes a primary CVN-2 contract through implementation convenience.

### CVN2-R003 — Authoring SDK boundary

- The public module-authoring surface is versioned and distinct from the application-facing Core root.
- The V1 contribution shape retains the exact fields `apiVersion`, `moduleId`, `contributionId`, `extensionNamespaces`, `extensionRequirements`, `commands`, `validate`, `classify`, and `effects`.
- Manifests select data descriptors only. Callable bindings originate only from statically imported composition-root code.
- Only the accepted identity profile (`official`, `builtin | internal-module`, `system-trusted`) and complete required capabilities may compile.

### CVN2-R004 — Frozen catalog boundary

- Construction validates strict shape/version, identity parity, trust/capability, uniqueness, namespace/target ownership, descriptor/binding parity, exact supported schema versions, effect ownership, synchronous returns, resource caps, and deep freeze in the parent-defined order.
- One failed contribution yields no accepted partial catalog and no active integrated session.
- The ready catalog exposes no registration mutation, replacement, unloading, hot reload, writable Session, history owner, event owner, or replay owner.

### CVN2-R005 — Compatibility and failure posture

- Preserve all accepted Core V1 behavior, the exact twenty-eight Core command IDs, GD-0 public-contract fences, CVN-4 final repaired behavior, and zero Core-to-Guitar imports.
- Failures, issues, facts, and summaries remain detached, frozen, data-only, deterministically ordered, and restricted to their accepted allowlists.
- Rollback is additive: removing the unused SDK/catalog entry must restore the accepted Core-only baseline without persisted-document migration.

### CVN2-R006 — Explicit exclusions

- CVN-6 retains writable integrated Registry/bus/gateway/replay, module effect execution, validation/classification runtime, compatibility availability, diagnostics, migration, read-only degradation, and unified events.
- CVN-5 retains bounded Core/module batch behavior.
- Runtime discovery, package installation, unload/replacement, hot reload, manifest-provided functions, arbitrary callbacks/patches, Guitar-specific behavior, Domain Selector contribution, assembly generations/Host, and every reserved future extension port remain separately gated.

## Acceptance Criteria

### Planning-base checkpoint

- [x] CVN2-AC001: one isolated branch/worktree contains `b0272e2`, `7f33e7d`, `7c4e852`, `253d19e`, `451627e`, and `a2b9009`.
- [x] CVN2-AC002: the durable roadmap records final CVN-4, the accepted Extensibility Reservation charter, and accepted/archived GD-0 in one snapshot.
- [x] CVN2-AC003: the child exists with status `planning` and records implementation authorization as false.
- [x] CVN2-AC004: the child owns exactly `CVN-FC-110/111`.
- [x] CVN2-AC005: CVN-6 runtime integration, CVN-5 batch, and reserved future ports are explicitly excluded.
- [x] CVN2-AC006: unified-base Trellis validation, typecheck, build and the full `315/315` regression pass.

### Required before activation

- [ ] CVN2-AC007: a converged PRD, `design.md`, and `implement.md` freeze exact public exports, private catalog boundaries, failure priority, resource limits, fixtures, file ownership, rollback points, and decisive commands without duplicating parent contracts.
- [ ] CVN2-AC008: `implement.jsonl` and `check.jsonl` contain real task-specific spec/research context and pass Trellis validation.
- [ ] CVN2-AC009: an independent planning review reports explicit P0/P1/P2 counts and confirms that only `CVN-FC-110/111` are owned.
- [ ] CVN2-AC010: the user reviews the completed planning artifacts before any `task.py start` transition.

## Open Planning Work

Detailed technical design and the ordered operator checklist are the next gate. They must derive exact answers from the accepted parent/GD-0/charter documents and current source/tests before asking for product intent. No unresolved product decision is introduced by planning-base preparation.
