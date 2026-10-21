# Worktree Consolidation Receipt

Date: 2026-10-21, Asia/Shanghai.

Redundant checkouts and stale application references have been retired. Six
working checkouts remain, all on E:. The C: worktree directory is empty and the
application archive queue is empty. The future default worktree-root setting
is still unverified.

Machine-readable observations are in
[the evidence receipt](2026-10-21-worktree-consolidation-evidence.json).

## Keep six useful checkouts, not six competing main branches

The starting inventory contained 67 registered worktrees. Two verified E:
replacements were added and 63 original registrations retired, leaving six:
a net reduction of 61.

| Retained checkout | Consumer |
| --- | --- |
| Main repository | Sole integration entry point |
| `E:/Codex/worktrees/4c4f/brilliant_guitar` | Unfinished Pi/MCP architecture audit |
| `E:/Codex/worktrees/7b1c/brilliant_guitar` | Active visual source; unaccepted Tab/tooling proposals |
| `.worktrees/cvn-7-accepted-baseline` | Actual benchmark baseline |
| `.worktrees/cvn-7-core-vnext-final-qualification` | Paired benchmark candidate |
| `.worktrees/rkp-4-history-snapshots-events-replay-planning` | Independent candidate awaiting owner acceptance |

The remaining proposals and candidates have not been accepted into main merely
because their physical environments were retained. Benchmark pairs must stay
distinct while their existing consumers need them.

Nine stale live worktree attachments, 16 empty marker shells and 24 historical
human-chat references were resolved. Historical internal approvals, archived
chats and valid recovery attachments remain available. Changing the Codex
account is no longer a prerequisite for the completed cleanup.

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

## Record UI changes now; defer repair until worktree cleanup

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

Combined-presentation acceptance is open. No further UI change or whole-tree
rollback is part of this maintenance receipt. Worktree cleanup continues
independently; product repair and remaining native interaction acceptance wait.

## Preserve the partial native close evidence

The tested product source is main commit
`3f775837dc625e72b5d3199f65013c7107fcea78`, built from the existing isolated
export rather than main's unrelated product WIP. Direct source comparison
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
headless plugin sessions. This continuation has not pushed them.

Remaining work is separated by scope:

1. Saving and reading back the supported global worktree-root setting
   `E:/Codex/worktrees`. Existing migrations do not prove that future trees use it.
2. After the worktree work is settled, reviewing UI-01 through UI-05 and completing
   the native Don't Save branch. Neither is accepted by this maintenance record.

Main's 30 unrelated tracked product changes and the pre-existing frontend-index
patch are excluded. Local task metadata, recovery archives and historical
evidence are not force-added. The previously approved maintenance scope contains
only this document and its evidence JSON. No shutdown is scheduled.
