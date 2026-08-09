# CVN-4 Independent Review Record

## Verdict

- Review date: `2026-08-09`
- Review base: `00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8`
- Initial source/test commit: `788594e670a1608ee2beabddcd217a9d340a5d30`
- Final accepted source/test commit: `b0272e2eabd0d222baea12cbaae3e08f9f61bfdd`
- Branch: `codex/cvn-4-part-staff-voice-lifecycle`
- Final findings: P0/P1/P2 = `0/0/0`
- Surface: runtime exports `49`, Core catalog `25`, Registry descriptors `25`
- Persisted schema: unchanged at `brilliant-score-1`

## Voice order re-review

The initial independent review found one P2 in `core.voice.remove`: its
canonical affected-entity order placed Events and Notes before the owner Part.
The accepted order is Voice, owner Part, then Events and Notes.

The repair split Voice self-address collection from Event and Note descendant
collection. `prepareRemoveVoice` appends Voice, owner Part, then the ordered
descendant subtree. Submit, undo and redo assert the same exact order. Voice
insert and Part aggregate traversal retain their prior ordering.

## Post-acceptance local correctness re-review

A later local review confirmed two P1 correctness defects in the initial
candidate. An extra `core.voice.remove` payload field could be missed when a
local callback synchronously replaced field-processing built-ins. Separately,
an invalid `core.staff.set-definition` could return
`command.semantic-invalid` with document version zero while the live Staff
line count had changed.

Commit `b0272e2eabd0d222baea12cbaae3e08f9f61bfdd` closes both defects. The score
component decoder now retains the local field-enumeration, filtering, sorting,
membership, own-property and diagnostic-append operations it uses. Core effect
application retains its document-clone operation before processing commands.

Regression coverage proves that replacing `Object.keys` or `Array.filter`
during local input enumeration cannot hide an extra payload field. A separate
test proves that replacing `structuredClone` during the same step cannot alias
an invalid candidate to the live document. All rejection cases preserve the
document, version, undo/redo depths and event list.

## Acceptance evidence

| Acceptance group | Evidence |
|---|---|
| AC001-AC006 | accepted CVN-3 baseline, catalog/Registry/surface checks, strict-input suites |
| AC007-AC013 | `cvn-4-part-lifecycle.test.ts`, command internals |
| AC014-AC020 | `cvn-4-staff-lifecycle.test.ts`, rejection rollback regression |
| AC021-AC028 | `cvn-4-voice-lifecycle.test.ts`, exact removal-order and input-format regressions |
| AC029-AC032 | `cvn-4-transaction-integration.test.ts`, direct/gateway/history/replay tests |
| AC033-AC034 | closed report mapping and immutable CVN-1/CVN-3 hashes |
| AC035 | focused `92/92`, full `315/315`, typecheck, build, Trellis validation, diff check |

Protected hashes:

- CVN-1 expected characterization:
  `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`
- CVN-3 expected surface:
  `3AC8819BCDCB1E0D69DDDBB00DBCB53D4BB0AFD6B004B4E278E02A1FD22EACA4`

## Closeout decision

All thirty-five acceptance criteria are satisfied at final source/test commit
`b0272e2eabd0d222baea12cbaae3e08f9f61bfdd`. Final independent re-review found
P0/P1/P2 = `0/0/0`. The task remains completed and archived. Parent state is
synchronized separately to the repaired commit and reproduced local test
counts.
