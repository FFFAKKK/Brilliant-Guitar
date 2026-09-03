# EOL prerequisite audit-return re-entry planning review candidate

## Status

READY FOR DEDICATED INDEPENDENT EOL PREREQUISITE RE-ENTRY PLANNING AUDIT

## Exact object

- Planning base and returned implementation candidate: 1f3f6061f093e1e169ccf4105cde444b0e49f82f.
- Branch: codex/rkp-2-stage-6-eol-audit-return-planning-repair.
- Worktree: .worktrees/rkp-2-stage-6-eol-audit-return-planning-repair.
- Planning candidate: the clean commit containing this file, resolved with git rev-parse HEAD.
- Historical fresh I0: 64bc508cd56bd0a250f890af186c097dc2b6880e.
- Audited technical commit/tree: 30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49 / 022f8b25e53ca68f33be08d0a2cedef65af2aa94.
- Returned audit task: 01a06532-e9ab-7603-bddc-f9d55b3f5bb9.
- Returned verdict: P0/P1/P2=0/2/0.
- Task status remains in_progress as historical lifecycle state.
- Planning candidate ready: true after commit.
- Implementation candidate ready: false.
- User/production implementation authorization: false / false.
- S6.2/S6.3/E3: false / false / zero.
- Default runtime: TypeScript.

## Verdict requested

Audit only whether this docs-only planning candidate closes both returned P1 findings without changing the four audited technical files, expanding the six-path future coordination contract, or advancing any lifecycle authorization.

## P1 closure claims to verify

### P1-1 — independently reconstructible expected lane

- Future implementation-evidence.md must embed complete executable bytes for project-expected.mjs, coordination-set.mjs, all capture/verifier/extraction/comparison helpers, and every non-built-in imported helper.
- The complete I0_EXPECTED_PATCH.diff payload must be embedded losslessly with decoded byte length and SHA-256.
- A reviewer extracts and hash-verifies the capsule before use, then rebuilds control, expected V1, expected V2, historical technical, and candidate lanes from pinned commits in fresh E-drive clones.
- The three missing synthetic object IDs and deleted temp roots are diagnostic only and cannot satisfy a gate.
- The capsule remains inside the already-allowed implementation-evidence.md path; no seventh coordination path is added.

### P1-2 — one current branch/state/gate

- Child task, PRD, design, implement, evidence header/footer, review candidate, operator handoff, RKP-2 parent, and Rust parent all identify this branch/worktree and the dedicated re-entry planning audit as the sole live gate.
- Historical I0/I1 and operator-ready claims are labeled historical.
- implementation_candidate_ready is false and every implementation/later-stage authorization is false.

## Exact R-P0 planning diff

Relative to 1f3f6061..., the candidate must change exactly:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/prd.md
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/design.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implement.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
5. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
6. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
7. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
8. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
9. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

## Required independent checks

1. Recheck branch, HEAD, clean/staged-empty status, and single-parent base.
2. Require the actual diff to equal the exact nine-path set.
3. Require the four technical blobs to equal 30d4acb0... and protected S6.2 paths to have zero delta.
4. Require task meta, PRD, design, and implement to expose the same exact six future coordination paths and empty future technical allowlist.
5. Verify the durable capsule contract includes every executable dependency and the complete patch payload.
6. Verify fresh-lane construction has no dependency on missing synthetic objects or deleted temp roots and cannot derive expected values from the candidate.
7. Verify one current branch/state/gate across every named authority.
8. Re-run Trellis, JSON/JSONL, Markdown fence, diff, and typecheck/build gates; require focused governance 11/7/4/0 and rerun the full classifier from a clean suitable environment. The operator's pre-commit 590/581/8/1 run contained exactly four historical governance failures, one dirty-tree guard, and three file-level missing-native-addon failures, so it is diagnostic and not claimed as full green evidence.
9. Verify task.py start and all forbidden lifecycle actions were not performed.

## Review boundary

A P0/P1/P2=0/0/0 planning verdict permits only a later request for explicit implementation authorization. It does not itself authorize activation, evidence replay, acceptance, archive, integration, S6.2/S6.3/E3, qualification, runtime cutover, RKP-3, or push.
