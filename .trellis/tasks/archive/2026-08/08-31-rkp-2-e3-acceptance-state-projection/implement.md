# Implementation Plan: RKP-2 E3 Acceptance-State Projection

## 0. Planning gate

1. Verify branch `codex/rkp-2-e3-acceptance-state-projection` and planning base `0c561d14193374436361eec09b361cab0170278a`.
2. Verify the base is clean and is the exact independently audited candidate.
3. Freeze all eight immutable planning files with LF-normalized UTF-8 SHA-256 hashes.
4. Run a dedicated independent planning audit. Required verdict: P0/P1/P2=`0/0/0`.
5. Record the accepted planning head in mutable `task.json` only.
6. Wait for a separate user implementation authorization before `task.py start`.

## 1. Activation

Allowed files:

- transition child `task.json`, `operator-handoff.md`, `review-candidate.md`;
- E3 law parent `task.json`.

Actions:

1. run `task.py start 08-31-rkp-2-e3-acceptance-state-projection`;
2. set task start and bounded implementation authorization true;
3. retain `implementation_candidate_ready=false` and implementation review pending;
4. preserve E3 law and Stage 6 review fields as pending;
5. record exact accepted planning head and immutable hashes;
6. commit a docs-only activation checkpoint.

Expected focused classification remains the planning `11/7/4`: three historical fail-closed gates plus exactly one acceptance-projection gap.

## 2. Historical candidate and audit-record law

Modify only:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Actions:

1. freeze E3 historical range endpoint at `0c561d14`;
2. read historical lifecycle from `git show 0c561d14:<path>`;
3. add the separate current acceptance-projection collector from `0c561d14`;
4. add exact V1 audit record canonicalization and digest validation;
5. add exact 8/1/9 ownership arrays and disjointness checks;
6. accept only the exact implementation-transition state while review remains pending;
7. add all negative fixtures from the design matrix;
8. commit the one-file technical checkpoint.

Gate:

- focused Node 20 and supported Node classification becomes `11/8/3`;
- no historical failure name changes;
- diff from accepted planning head has exactly one technical path plus the already-active lifecycle subset.

## 3. Acceptance-preparation lifecycle projection

Modify only the nine lifecycle paths in E3ASP-R004.

Actions:

1. revalidate the canonical V1 audit record already owned by the E3 law parent `task.json`;
2. bind the E3 law review field to that record and set acceptance-preparation ready;
3. set Stage 6 review to passed with only authority path and digest references;
4. update both parent handoff/review documents without claiming acceptance;
5. set this child candidate ready and its independent implementation review pending;
6. keep all later lifecycle flags false;
7. commit the lifecycle checkpoint.

Gate:

- `0c561d14..HEAD` exact path set is `8 + 1 + 9 = 18`;
- focused remains `11/8/3`;
- no audit record duplicate exists.

## 4. Candidate verification

Run:

```powershell
python .\.trellis\scripts\task.py validate 08-31-rkp-2-e3-acceptance-state-projection
python .\.trellis\scripts\task.py validate 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
python .\.trellis\scripts\task.py validate 08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation

npm run typecheck
npm run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
node .\scripts\run-node-tests.mjs
git diff --check
```

Native validation artifacts, if required, must be built under the E: worktree `target/`; nothing is written to the C: Cargo target.

Also verify:

- JSON and JSONL parse;
- every JSONL path exists and is unique per file;
- parent child reference count is one;
- canonical audit record is 323 bytes and exact SHA-256;
- eight immutable planning hashes exact;
- historical 21 paths exact;
- transition 18 paths exact and owner sets disjoint;
- protected-path delta zero;
- candidate clean, staged empty, untracked empty;
- original `e3-law` worktree stays at `0c561d14` and clean;
- original E3 source stays at `4ad23773` with exact eight entries.

## 5. Independent implementation review handoff

Terminal text:

```text
READY FOR DEDICATED INDEPENDENT ACCEPTANCE-PROJECTION IMPLEMENTATION REVIEW
```

The auditor must pin the exact candidate HEAD and independently verify the audit record, historical 21-path range, transition 18-path range, negative fixtures, `11/8/3`, full classification and all later false gates.

Stop after handoff. Acceptance, archive, integration, S6.2/S6.3, qualification, cutover, push and RKP-3 require later explicit gates.
