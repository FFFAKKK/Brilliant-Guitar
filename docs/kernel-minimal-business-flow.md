# Minimal guitar business flow

The owner requested a bounded business-flow test on 2026-09-12 before starting
UI and production plugin integration. This resumes testing only; the broader
commercial-completion roadmap remains paused. No Core source, Rust source,
default backend selection, public SDK contract, or UI worktree was changed.

## What this proves

`test/core-kernel/rust-migration/minimal-guitar-business-flow.test.ts` executes
the real Native V2 addon through the existing opt-in adapter. A wrapper delegates
all requests to the actual native session and records native operations. Two
separately created Rust sessions and freshly compiled SDK catalogs exercise:

1. Create a valid one-measure score with four quarter rests using the public factory.
2. Replace the first rest with a note and assign string 2, fret 1 in one Batch.
   Standard guitar B3 + one semitone is sounding C4, written C5.
3. Change to string 2, fret 3: sounding D4, written D5. Read back both Core pitch
   and plugin position, then undo the shared edit.
4. Reject five invalid string/fret inputs, a conflicting Core pitch edit, a Batch
   with a valid name-change prefix followed by invalid input, and deletion leaving
   a dangling plugin reference. Document, history, dirty state and events remain
   unchanged, including redo availability. Rejections must not be internal errors
   or callback contract failures; semantic conflicts must be plugin validation failures.
5. Redo, delete the note and its position together while restoring a rest, then
   undo/redo that deletion. Core and extension data share stored history.
6. Encode the restored note's score using the existing score JSON codec, write
   a real UTF-8 file, and mark that exact snapshot version persisted.
7. Read and parse the file, build a fresh catalog and Rust session, verify exact
   document equality and empty session history, then edit and undo again.
8. Preserve an unknown extension including Chinese text and a lone UTF-16 surrogate.
   Reject truncated JSON and a structurally unsupported document before opening.

The new consumer is in `test/core-kernel/fixtures/minimal-guitar-module.ts`.
It uses authentic SDK contribution/command/effect definitions, owns only its
extension namespace, and requests the existing Core pitch effect. Its validator
independently checks pitch against position and detects dangling references.
Guitar semantics remain outside the microkernel.

## Deliberate limits

- This is a **test-only business consumer**, not the finished official Guitar
  Domain plugin. It supports fixed standard six-string tuning, frets 0..24, and
  octave-transposing notation. Custom tuning, capo, techniques, chord fingering
  constraints, fretboard UI, plugin packaging and lifecycle are not covered.
- The test's host script drives the workflow. No selection/gesture UI, rendering,
  playback, desktop transport or user-facing error presentation is implemented.
- Persistence is a real physical `score.json` round-trip. It is not `.bgp`
  packaging, atomic file replacement, autosave, crash recovery, persisted undo
  history, or proof of cross-version compatibility. Reopening creates a fresh
  session in the same Node process; it is not a process-restart/crash test.
- This route explicitly chooses Rust. The legacy TS engine remains frozen and
  existing default factory selection is unchanged. The active TS SDK, codec and
  native adapter remain necessary host code.
- This is small-workload functional evidence, not performance, portability,
  resource-exhaustion, plugin-ecosystem or commercial qualification.

## Reproduce

From the repository root, first build the Native V2 addon using
`docs/kernel-native-integrated-v2.md`. Then, with Node/npm on PATH:

```powershell
npm run build
node --test dist/test/core-kernel/rust-migration/minimal-guitar-business-flow.test.js
```

Build and tests must run sequentially. Do not replace the addon while tests run.
Each run retains its tiny `score.json` and `result.json` under an isolated
`.local-evidence/minimal-guitar-flow/run-*` directory. The test output gives the
exact path. This directory is ignored by Git.

Verified on Windows / Node 24 at source baseline `c49827d` plus this test-only
change: strict TypeScript build passed; the focused journey passed 1/1. The
complete compiled Node suite passed **831**, skipped **2**, failed **0** out of
**833** tests (86,492.8376 ms). Full log:
`.local-evidence/minimal-guitar-flow/full-node-tests.log`.
No Rust source changed, and Rust unit tests were not rerun for this consumer test.

## Product decision

The UI is not required to verify this underlying business loop. A usable product
does require a UI, a maintained real domain plugin, and host persistence services.
The next bounded integration should connect a minimal editor to this same Rust
command path and develop the official guitar consumer against explicit business
contracts. The test consumer is evidence and a regression example, not a shortcut
to declaring that production integration finished.
