# CVN-4 Independent Review Record

## Verdict

- Review date: `2026-08-09`
- Review base: `00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8`
- Accepted source/test commit: `788594e670a1608ee2beabddcd217a9d340a5d30`
- Branch: `codex/cvn-4-part-staff-voice-lifecycle`
- Final findings: P0/P1/P2 = `0/0/0`
- Surface: runtime exports `49`, Core catalog `25`, Registry descriptors `25`
- Persisted schema: unchanged at `brilliant-score-1`

## Narrow re-review

The initial independent review found one P2 in `core.voice.remove`: its
canonical `affectedEntities` order was `Voice → Events/Notes → owner Part`,
while the accepted design requires `Voice → owner Part → Events/Notes`.

The repair split Voice self-address collection from Event/Note descendant
collection. `prepareRemoveVoice` now appends Voice, owner Part, then the ordered
Event/Note subtree. The regression test asserts the exact array for submit,
undo, and redo. Voice insert and Part aggregate traversal continue using the
existing Voice-first descendant helper, so the change is confined to removal.

## Acceptance evidence

| Acceptance group | Evidence |
|---|---|
| AC001-AC006 | accepted CVN-3 baseline, catalog/Registry/surface checks, strict-input suites |
| AC007-AC013 | `cvn-4-part-lifecycle.test.ts`, command internals |
| AC014-AC020 | `cvn-4-staff-lifecycle.test.ts`, failure adapters |
| AC021-AC028 | `cvn-4-voice-lifecycle.test.ts`, exact removal-order regression, strict input |
| AC029-AC032 | `cvn-4-transaction-integration.test.ts`, direct/gateway/history/replay tests |
| AC033-AC034 | closed report mapping and immutable CVN-1/CVN-3 hashes |
| AC035 | focused `4/4`, full `312/312`, typecheck, build, Trellis validation, diff check |

Protected hashes:

- CVN-1 expected characterization:
  `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`
- CVN-3 expected surface:
  `3AC8819BCDCB1E0D69DDDBB00DBCB53D4BB0AFD6B004B4E278E02A1FD22EACA4`

## Closeout decision

All thirty-five acceptance criteria are satisfied at the accepted source/test
commit. The existing design already specifies the canonical affected order, so
no Core spec expansion is needed. The task is ready for acceptance commit,
archive, parent dependency synchronization, and session recording.
