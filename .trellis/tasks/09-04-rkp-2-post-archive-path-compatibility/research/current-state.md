# Current State — 2026-09-04

## RED reproduction

- Command: `node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js`.
- Result: `11 total / 4 pass / 7 fail / 0 skip`.
- Seven failures are limited to removed active task paths or change-set expectations after native archive.
- The four kernel/runtime behavior assertions remain green, so this is not a LiveScoreStore or codec regression.

## Trellis validation reproduction

- Archived task: `.trellis/tasks/archive/2026-09/08-24-rkp-2-indexed-live-score-store-load-encode-parity`.
- `implement.jsonl`: four missing references at rows 22–25.
- `check.jsonl`: eight missing references at rows 13–20.
- All 12 references point beneath the same task's former active root; their exact suffixes exist beneath the current archive root.

## Authority state

- Active RKP-2 root absent; 13-file September archive present.
- Active S6.3 root absent; 7-file September archive present.
- RKP-2 is accepted/archived. This task does not reopen implementation acceptance or qualification.
