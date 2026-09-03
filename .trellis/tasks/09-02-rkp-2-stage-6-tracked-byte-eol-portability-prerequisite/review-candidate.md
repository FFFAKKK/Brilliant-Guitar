# EOL prerequisite R-I2 implementation re-audit candidate

## Status

READY FOR DEDICATED INDEPENDENT IMPLEMENTATION RE-AUDIT

## Exact object

- R-A0 source HEAD/tree: c3e90c6fcc3a624b8a7157bedea59d44f84c6c78 / 40d786f4717e27251ae76b2ae7f49e286337839a.
- Branch: codex/rkp-2-stage-6-eol-audit-return-planning-repair.
- Worktree: .worktrees/rkp-2-stage-6-eol-audit-return-planning-repair.
- R-I0 durable-capsule candidate: 6933367a3e58bb6efd93057458b7f764b4450d51 / 520ae62063346dc8c3bc1704797f4fcf5a26f88b.
- R-I2 evidence-freeze candidate: the clean commit containing this file, resolved with git rev-parse HEAD.
- Historical patch source: 64bc508cd56bd0a250f890af186c097dc2b6880e.
- Audited technical commit/tree: 30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49 / 022f8b25e53ca68f33be08d0a2cedef65af2aa94.
- R-P0 narrow planning audit: 957332a127c381847eb85e246e7f1e922dcbc7fd / 54273dd6cb7fc9a2615db16c3afec86bf033c55b, P0/P1/P2=0/0/0.
- Task status remains in_progress as historical lifecycle state.
- Planning candidate ready: true after commit.
- Implementation candidate ready: true, meaning ready only for this independent re-audit.
- User authorization: R-A0/R-I0/R-I1/R-I2 evidence re-entry only; production implementation authorization: false.
- S6.2/S6.3/E3: false / false / zero.
- Default runtime: TypeScript.

## Verdict requested

Audit whether the R-I0 capsule and R-I1/R-I2 records are independently reproducible from the exact clean evidence-freeze candidate, with an exact six-path coordination delta, zero technical/S6.2 delta, and no lifecycle authorization drift. Return verdict first with P0/P1/P2.

## R-I0 through R-I2 claims to verify

### Durable reconstruction capsule

- implementation-evidence.md embeds nine complete Node tools plus the complete I0_EXPECTED_PATCH.diff as ten base64 entries.
- The manifest records each entry exactly once with encoding, byte length, SHA-256, import ownership, and command role.
- The complete patch decodes to 4,892 bytes with SHA-256 fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05.
- A first extraction and an extraction performed by the extracted helper both verified 10/10 entries; all nine extracted .mjs files passed node --check, the Rust verifier self-test passed 5/5, and the comparator reproduced the predeclared relation.
- No old synthetic object ID or deleted temporary directory is accepted as evidence.

### Fresh predeclared lanes and raw-byte record

- Control is c3e90c6... / 40d786f...; expected V1 is ec26e042... / b8c5b825...; expected V2 is 3da64254... / 2b17d741....
- V1 and V2 change exactly the six coordination paths with byte-distinct markers and no technical path.
- Focused Node is 11/7/4/0 on control/V1/V2. V1 equals V2; all four signatures also equal control at this source, which is recorded as an observation rather than presumed candidate behavior.
- autocrlf=true and autocrlf=false fresh checkouts are clean; all seven tracked paths are LF-only and byte-equal to their Git blobs.
- The corrected full control run is 590/582/7/1: three file-level missing ignored-native-addon failures plus the four known governance failures. Two earlier wrong-cwd captures are explicitly discarded.
- Historical technical reconstruction proves exact equality for the four protected blobs; full-tree equality is not claimed because historical coordination deltas are outside that projection.

### R-I1 independent reconstruction

- A new candidate checkout extracted the committed capsule twice at 10/10 and all nine scripts passed node --check.
- Rebuilt V1/V2 trees exactly equal the predeclared R-I0 trees b8c5b825... / 2b17d741....
- The rebuilt patch is byte-equal to the embedded payload and reconstructs all four 30d4acb0... technical blobs; verifier self-test is 5/5.
- Candidate, V1, V2, and control each produced focused 11/7/4/0; all four candidate title-level signatures equal the predeclared signatures.
- Candidate EOL matrix is clean and identical under autocrlf=true/false for all seven paths.

### R-I2 regression

- Cargo 1.97.1 fmt/check/test/clippy passed; workspace tests are 79 pass / 0 fail / 1 ignored. Cargo 1.88.0 workspace/all-targets check passed.
- npm typecheck and build passed.
- Full control and candidate each produced 590/582/7/1 with the same seven failure classes: three absent ignored-native-addon file wrappers plus four frozen governance assertions.
- Trellis 7/7, 25/20, 18/19 passed; 3 JSON files and 6 JSONL files / 96 rows parsed with unique existing paths; changed Markdown fences and diff-check passed.
- E3 remains zero, TypeScript remains default, and all later lifecycle authorizations remain false.

## Exact evidence-freeze coordination diff

Relative to c3e90c6..., the final candidate must change exactly:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
5. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
6. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

## Required independent checks

1. Resolve the clean evidence-freeze HEAD/tree and require its ancestry through 6933367... to c3e90c6....
2. Require the complete c3e90c6... range to equal the exact six-path set; require the four technical blobs to equal 30d4acb0... and S6.2 protected paths to have zero delta.
3. Extract the capsule into new roots and verify every byte/hash before use.
4. Independently rebuild control, byte-distinct V1/V2, historical technical, and candidate lanes; require expected tree and signature equality without reusing operator roots.
5. Reproduce Cargo, TypeScript, focused/full Node, EOL matrix, Trellis, JSON/JSONL, fence, and diff checks; reject any failure outside the recorded classes.
6. Verify the worktree is clean/staged-empty after removal of only the named reproducible temp roots.
7. Verify task.py start was not rerun and all forbidden lifecycle actions remain false.

## Review boundary

A P0/P1/P2=0/0/0 implementation re-audit permits only a later owner decision. It does not itself authorize acceptance, archive, integration, S6.2/S6.3/E3, qualification, runtime cutover, RKP-3, or push.
