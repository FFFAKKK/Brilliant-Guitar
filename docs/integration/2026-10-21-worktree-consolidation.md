# Worktree Consolidation Receipt

Date: 2026-10-21, Asia/Shanghai.

Redundant checkouts and stale application references have been retired. Three
working checkouts remain, all on E:. The C: worktree directory is empty and the
repository's `.worktrees` directory is physically empty. The application archive
queue is empty. The future default worktree-root setting is still unverified.

Machine-readable observations are in
[the evidence receipt](2026-10-21-worktree-consolidation-evidence.json).

## Keep three checkouts with distinct responsibilities

The starting inventory contained 67 registered worktrees. Two verified E:
replacements were added and 66 original registrations retired, leaving three:
a net reduction of 64. Temporary recovery checkouts are excluded from this count.

| Retained checkout | Consumer |
| --- | --- |
| Main repository | Sole integration entry point |
| `E:/Codex/worktrees/4c4f/brilliant_guitar` | Unfinished docs-only Pi/MCP audit; owner confirmed stopped |
| `E:/Codex/worktrees/7b1c/brilliant_guitar` | Frozen visual source; owner confirmed stopped; unaccepted Tab/tooling proposals retained |

The CVN-7 baseline/candidate pair and RKP-4 candidate had no current consumers.
All 2,754 ordinary files, including 538 ignored files, were preserved and restored
into independent detached checkouts for direct comparison. After updating the
operator handoffs and task storage pointers, the original three checkouts and
temporary rehearsal checkouts were retired without force. Original branches and
exact commits remain available. Future benchmark operations must first restore
the two distinct CVN-7 inputs; task acceptance and measurement gates are unchanged.

The remaining visual proposals have not been accepted into main merely because
their source environment was retained.

Nine stale live worktree attachments, 16 empty marker shells and 24 historical
human-chat references were resolved. Historical internal approvals, archived
chats and valid recovery attachments remain available. Changing the Codex
account is no longer a prerequisite for the completed cleanup.

## Unregistered directories were checked and removed too

The registration list did not include five historical clone, audit and cache
groups under `.worktrees`. They contained 15 independent primary clones and
59,890 ordinary files totalling 3,867,295,803 bytes. Two historical reconstruction
clones each contained four staged paths; those changes were preserved, not
imported into main.

Complete ZIPs retain the working files, ignored outputs and each clone's Git
objects, refs and index. Every saved file was directly compared with its source.
The Git data and dirty originals were restored; each clone's own Git directory,
HEAD, refs and staged diff were verified. After fresh consumer and source checks,
only the five exact unregistered directories were removed using native Windows
file operations. Registered worktrees were not deleted by that route.

The retained ZIPs total 2,582,101,192 bytes. The logical source-minus-archive
reduction is 1,285,194,611 bytes, about 1.20 GiB on E:. The source-removal phase
increased observed E: free space by 3,883,249,664 bytes, after ZIP creation;
that phase measurement is not a net figure after archive overhead.
The 2,006,702,927 bytes of temporary restore samples were removed separately and
are excluded from old-source savings. Recovery ZIPs and manifests remain.

The final acceptance receipt confirms that both old-tree directories are empty,
the archive queue is empty, all five ZIP manifests remain readable, and the
registered worktree list, main history and existing protected patch were preserved.

## Recover content before recreating a historical environment

Local recovery material is under
`.repo-archive/2026-10-19/worktree-main-consolidation/`, outside temporary storage.
It contains preserved refs/bundles, original files, scoped WIP, per-source
recovery instructions and actual removal receipts.

Use that directory's `STATUS_20261021.md` and the referenced `RECOVERY.md` for the
specific source. Restore into a separate E: directory; do not overwrite mixed
main WIP. Coverage of ignored files is source-specific. Independent ZIP/bundle
recovery checks do not establish that the application's one-click restore has
been exercised.

Completed queue repair must not be replayed. Do not retry successful archive
jobs, rewrite historical account ownership, clear unknown application state,
or delete Git objects to make old path references disappear.

## Recorded UI changes and approved repair reference

The integration changed presentation as well as consolidating files. The user
did not request a UI change and has instructed that the differences be recorded
first, with UI repair deferred until the worktrees are settled.

| ID | Recorded change or integration choice | Source |
| --- | --- | --- |
| UI-01 | Kept engineering-side event, measure, key, clef and metadata controls rather than the visual source's complete presentation | `design/frame-visual/src/score/core-score-view.js`, related `score-*-controls.js` and `styles/score-view.css`; C4 `6c401a68` |
| UI-02 | Did not import the visual source's staff/Tab presentation switch; the visual preview has the two controls and main does not | `design/frame-visual/src/runtime-preview.js`, `src/fixtures/core-score-plugin.js`, `src/host/backup-ui-runtime.js` and presentation modules; C4 `6c401a68` |
| UI-03 | Explicitly fit the layout-page action to score width and adopted selected viewport/frame behavior | `design/frame-visual/src/features/workspace-layout-page.js`, `src/host/stage-viewport.js`, `src/host/workspace-commands.js`, `src/shell/visual-zoom.js`; C4 `6c401a68` |
| UI-04 | Adopted shared Tab engraving, rests, spacing and paper-flow hunks | `shared/notation/paper-flow.ts`, `tablature-layout.ts`, `tablature-renderer.ts` and related fixtures; C4 `6c401a68` |
| UI-05 | Added/fixed guarded native Save / Don't Save / Cancel close handling and destruction | `apps/desktop/src-tauri/src/native_close.rs`, `commands.rs`, `lib.rs` and scoped clients; `379b6d7d` |

UI-01 controls predate consolidation in the preserved engineering WIP; selecting
them still changed the visual result. The 12 visual proposals not imported were
an integration decision, not a user rejection of that appearance.

The local task's `research/ui-change-provenance-20261021.md` records the complete
33-path adopted-hunk index, the 12 retained proposals' source, comparisons and
the deferred repair scope. The existing `research/visual-dispositions.json`
retains all 120 source dispositions. These records are in the recovery/task
material, not an additional product-code batch.

Combined-presentation acceptance is open. After worktree cleanup, the user
approved the preserved `7b1c` visual source as the presentation reference,
retaining main's editing, history, save and recovery authorities. The scoped
repair is authorized but not yet implemented in this receipt. A readonly preview
switch must not be presented as an editable product capability. No UI edit or
whole-tree rollback is part of this documentation commit.

## Preserve the partial native close evidence

The tested product source is main commit
`3f775837dc625e72b5d3199f65013c7107fcea78`, built from the existing isolated
export rather than unrelated main working files. Direct source comparison
found 1,283 exact files, 42 Git-text newline equivalents, no missing files and
no differing files in the recorded build-input scope.

The real Windows application used the separate identity
`com.brilliantguitar.consolidation.native20261021`. These paths passed:

- Unsaved close displays Save / Don't Save / Cancel.
- Cancel preserves the open unsaved document.
- Cancelling the native save picker preserves the unsaved A4.
- Saving through the native picker creates the E: test file and exits.
- Relaunching and opening the recent file restores the A4 and saved state.

The Don't Save branch remains unverified and is deferred under the user's
worktree-first instruction. The temporary test title was
`TEMP-DISCARD-20261021`; the saved A4 file is preserved separately and directly
unchanged. A later process check found no test-application/profile consumer.
Neither process exit nor profile cleanup counts as passing Don't Save.

Native observations, source comparison, build receipt and saved test score are
under `integration-evidence/native-product-acceptance-20261021/` in the recovery
directory. Both disposable C: test profiles have been removed after checking
for application/profile consumers and preserving all 297 files in verified E:
ZIPs. The source files totalled 75,218,462 bytes; the measured C: free-space
increase for removal was 75,599,872 bytes. Daily backup/workbench and Codex data
were outside this operation. ZIPs and the actual removal receipt are under
`profile-retirement-20261021/` in the native evidence directory.

## Publication and remaining work

The earlier 83-commit publication was verified on 2026-10-20 at remote main
`6c401a6879be384e9552487401cafe3ce4e47eb9`. This is the last verified remote
observation, not a fresh remote query.

Five subsequent local commits end at `3f775837`: guarded save snapshots,
desktop lint maintenance, ordered recovery, native close and compatible
headless plugin sessions. The prior maintenance receipt is committed at
`fc2944c7`, making six local commits after the last verified remote observation.
This continuation has not pushed them.

Remaining work is separated by scope:

1. Saving and reading back the supported global worktree-root setting
   `E:/Codex/worktrees`. Existing migrations do not prove that future trees use it.
   The official Worktrees documentation names Settings > Worktrees > Worktree root.
   This session has no supported settings-write tool, so the setting remains open.
2. Applying the approved `7b1c` presentation reference within main's engineering
   contracts, reviewing UI-01 through UI-05 and completing the native Don't Save
   branch. Implementation and combined-presentation acceptance remain open.

Thirty previously reported product modifications were directly equal to the
index. Path-limited stat refresh changed no staged entries or product content.
The pre-existing frontend-index patch remains excluded. Local task metadata,
recovery archives and historical evidence are not force-added. This documentation
update contains only this document and its evidence JSON; no product code,
new push or shutdown is included.
