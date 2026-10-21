# Score presentation restored without replacing the editor

Date: 2026-10-21. Candidate: `b9a78e51` plus the exact, uncommitted repair scope.

The preserved `7b1c` visual source supplied the staff/Tab presentation switch.
The current main editor remains the document, input, selection, history, save
and recovery authority. No whole-tree rollback or new shell design was used.

## What changed

- Restored the two 32px notation buttons in the existing top slot.
- Bound both drawings to the same accepted, version-guarded document read.
  Their pair validator is shared with the existing typed acceptance boundary.
- Kept the original staff editing tools and transactions. Tab is labelled
  read-only; staff input, property, clipboard and measure writes are disabled
  there. Returning to staff restores the same tools and selection.
- Kept paper geometry while replacing drawings, discarded stale hits and
  late results, and preserved the accepted drawing on read failure.
- Reused existing engraving, spacing, shell and viewport behavior. Width-fit
  and zoom are not reset by changing notation.

Legacy documents and hosts without usable Tab remain usable in staff mode.
The Tab button explains why it is unavailable; production documents never
receive demonstration fingerings.

## Evidence and its scope

The final affected presentation/input files passed all 92 tests. The preceding
1,020-test backup run had one incorrect test-fixture assertion: it expected a
caret where the original fixture selected an event. The assertion was corrected
to check preservation of the actual original target; both affected test files
then passed. No final 1,020/1,020 run is claimed.

Workbench type checks, six typed dual-notation read tests, generated asset checks
and the existing foundation boundary checks passed. The scoped UI detector
reported no findings.

Actual browser checks covered staff and Tab engraving, button states, narrow
and desktop layouts, and keeping 128.5% zoom across the switch. An independently
identified native build opened the saved A4 test score, retained its staff
tools, and passed title editing, undo/redo, cancel-close and discard/reopen.
After discarding only the synthetic in-memory title, the saved file remained
exactly 947 bytes with identical content, and reopening showed the original
saved title and A4 note.

The earlier native close/picker receipt retains its original five-of-six
observation. The follow-up records the missing discard check and its current
candidate separately; combined coverage does not invent a single tested commit.
The two test-only profiles were archived to E:, all 296 files were byte-compared,
and their C: copies were removed after the test process exited.

Local source, screenshots, logs, per-check candidate evidence and recovery:
`E:/desktop/brilliant_ideas/brilliant_guitar/.repo-archive/2026-10-19/worktree-main-consolidation/integration-evidence/ui-presentation-20261021/`.

## Remaining decisions

The repair awaits the user's appearance review and exact commit confirmation.
Tab editing, IME/device qualification and release acceptance remain with their
original tasks. The worktree cleanup still retains three purposeful E: checkouts;
the future global worktree-root setting remains unverified through a supported
settings interface.
