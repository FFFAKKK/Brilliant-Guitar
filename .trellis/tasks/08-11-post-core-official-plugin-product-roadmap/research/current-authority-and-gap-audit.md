# Current Authority and Product Gap Audit

## Audit date and scope

- Date: 2026-08-11.
- Read-only evidence scope: product requirements/specs/technical documents, accepted Core/CVN/GD-0 records, live worktrees, current production tree, package/build configuration and CVN-2 candidate verification evidence.
- This report intentionally separates accepted, candidate and future state.

## Git and worktree authority

| Surface | Branch/commit | State | Authority use |
|---|---|---|---|
| Main checkout | `codex/k1-5-errors-diagnostics-reports-migration` / `7fbf8c1` | stale for current roadmap; unrelated untracked maintenance path | not a post-Core base |
| Unified CVN-2 planning line | `codex/cvn-2-official-module-sdk-frozen-assembly` / `faaf424` | clean committed planning base plus separate dirty implementation candidate | chosen planning base commit only |
| Post-Core roadmap | `codex/post-core-official-plugin-product-roadmap` / base `faaf424` | planning-only worktree | authority for this task |

The post-Core worktree branches from the committed object, so it contains none of the CVN-2 uncommitted production or test changes.

## Accepted capability

- Pure Core Kernel V1 closed.
- CVN-0 accepted/archived.
- CVN-1 accepted/archived.
- CVN-3 accepted/archived.
- final repaired CVN-4 accepted/archived with 25 Core commands.
- Extensibility Reservation Gate accepted/archived.
- GD-0 documentation/architecture contract accepted/archived.

The accepted line provides one ScoreDocument, one command/transaction/history/replay/dirty/event owner, strict validation, detached reads, frozen Registry/gateway, structural lifecycle commands and unknown ExtensionBlock preservation.

## Candidate capability

The CVN-2 worktree contains an uncommitted official-module SDK/frozen-catalog candidate. Its task record reports repaired SDK/catalog checks and pending final independent implementation review. A local 2026-08-10 verification reproduced typecheck and full 350/350 tests, but green checks do not create acceptance. This task therefore records CVN-2 as candidate and does not consume its source changes.

## Planned Core completion

| Stage | Planned result | Dependency |
|---|---|---|
| CVN-2 | official-module SDK and detached frozen catalog | accepted CVN-1, GD-0, reservation gate |
| CVN-6 | integrated module runtime, validation, classification, migration | accepted CVN-2 |
| CVN-5 | range delete/transpose and atomic batch | accepted CVN-2/3/4/6 |
| CVN-7 | compatibility, reliability, scale and resource qualification | accepted CVN-0～6 |

## Product-layer gap against the original goal

### Product host

Documented: Tauri desktop, React/Vite Workbench, Editor Session, command palette, shortcuts, properties, settings and i18n.

Implemented: none. The repository currently contains only `src/core-kernel/**` production code.

### Guitar domain

Documented: standard six-string tuning, string/fret input, WrittenPitch derivation and first guitar techniques.

Implemented: generic WrittenPitch and opaque ExtensionBlock only. GD-0 is an accepted contract, not production Guitar behavior.

### Layout and rendering

Documented: framework-neutral Layout primitives, SVG first, VexFlow adapter, staff/tab synchronization and hit testing.

Implemented: none.

### Playback

Documented: deterministic playback events, transport controls, metronome, base tempo and cursor.

Implemented: none.

### Persistence

Documented: `.bgp` package, manifest, score, resources, atomic save, autosave, recovery and real migrations.

Implemented: semantic `brilliant-score-1` codec/current-schema compatibility only; physical package and IO remain absent.

### Export

Documented: PDF and PNG in the first product loop.

Implemented: none.

### Commercial-grade open-source product

Core evidence is strong: strict TypeScript, extensive regression tests, deterministic contracts and independent acceptance workflow.

Repository/product delivery is still missing root README/LICENSE/NOTICE/CONTRIBUTING/DCO/changelog, CI/lint/format/release commands, installable desktop app, product fixtures and end-to-end qualification.

### Performance

Core VNext research measured a 51,200-Event trivial metadata submit around 183 ms and undo around 214 ms on the reference machine. CVN-7 contains exact Core targets but no final benchmark harness yet. Product layout/render/playback/open/save/export performance has no implementation evidence.

## Audit verdict

The current Core-first order matches the intended strategy. The repository has not drifted into the wrong architecture; it is simply at the kernel stage. The durable risk is an undefined transition after CVN-7. This parent task closes that gap by making the first post-Core target Official Guitar Domain and mapping every missing product capability to an independently gated task.
