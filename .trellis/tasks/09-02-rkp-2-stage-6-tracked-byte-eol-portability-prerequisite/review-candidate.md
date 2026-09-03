# EOL prerequisite implementation review candidate

## Status

`READY FOR DEDICATED INDEPENDENT EOL PREREQUISITE IMPLEMENTATION REVIEW`

## Exact object

- Branch: `codex/rkp-2-stage-6-eol-evidence-repair`
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`
- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Fresh I0 source/tree: `64bc508cd56bd0a250f890af186c097dc2b6880e` / `b767ce3b7016b8529326f94891ebd4aaa2373515`
- I0 evidence projection: `547447cc9b4cd0124afb5dc1b22d96a773c5b4dc`
- I1 technical commit/tree: `30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49` / `022f8b25e53ca68f33be08d0a2cedef65af2aa94`
- Provisional clean I3 commit/tree: `ef67f4a5e5ea0c96d8a7b46001458c12bc135413` / `585afe41620fb3146c7461a11159044c6a193ae1`
- Final candidate: the clean commit containing this file, resolved by `git rev-parse HEAD`
- Task: `in_progress`; implementation authorization consumed
- S6.2/S6.3/E3: false / false / zero
- Default runtime: TypeScript

## Verdict requested

Audit whether this is the smallest sufficient EOL/raw-byte portability prerequisite and whether its fresh evidence closes the previous `65fef628...` return (P0/P1/P2=`0/2/1`) without changing Rust product behavior.

## Decisive evidence

1. `implementation-evidence.md` is absent at I0; the four technical paths have zero I0 delta.
2. Three independent generators agree on full-index patch `4,892` bytes / `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`.
3. I1 changes exactly `.gitattributes` plus three Rust `#[cfg(test)]` regions; lexical reconstruction equals the I0 blobs.
4. Five focused Rust tests pass; no large ignored evidence test runs.
5. I2 contains every one of 14 checkout and 7 blob records, with raw byte-length/SHA/blob equality under both `core.autocrlf` values.
6. Rust 1.97.1 fmt/check/test/clippy and Rust 1.88.0 check pass with E-drive outputs.
7. Fresh I3 control equals I0, fresh rebuilt expected equals the pre-I1 record, and candidate equals only that predeclared record; Part Owner remains I0-equal.
8. Full Node remains the classified `611/605/4/2` and manifest `80 / 1a50fd28...`; there is no new product failure.
9. Candidate diff is exactly four technical plus six literal coordination paths.
10. Nineteen temporary clone/build/TEMP paths were removed; the remaining ignored evidence root is deleted after final post-commit replay.

## Required independent checks

- Verify exact ancestry and clean/staged-empty state.
- Independently compute the full-index patch length/SHA and four technical paths.
- Re-run the Rust reconstruction verifier and inspect its complete committed source.
- Independently sample all 14 checkout records and 7 blob records from the committed evidence.
- Rebuild control/expected lanes rather than trusting the candidate as its own oracle.
- Confirm matrix V1 failure and V2 bounded parser correction did not normalize compared bytes.
- Confirm task meta, PRD, design, implement and actual coordination diff all equal the same six literal paths.
- Confirm no acceptance/archive/integration/push or later-stage authorization was activated.

A technical pass does not itself authorize lifecycle closeout.