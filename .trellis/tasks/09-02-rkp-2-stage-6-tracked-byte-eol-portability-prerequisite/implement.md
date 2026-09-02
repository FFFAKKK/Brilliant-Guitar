# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Implementation Plan

## Current state

- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`.
- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`.
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`.
- Task status: `planning`.
- Production implementation authorization: `false`.
- Dedicated planning review: pending.
- S6.2 E3 run count: `0`.
- Default runtime: TypeScript.

Do not execute I0 until an exact docs-only planning commit receives a dedicated independent P0/P1/P2=`0/0/0` verdict and the user separately authorizes this prerequisite.

## Fixed stage sequence

```text
P0 planning freeze
  -> independent planning audit
  -> explicit prerequisite authorization
  -> I0 activation and baseline capture
  -> I1 EOL policy + Rust test-only repair
  -> I2 dual-checkout byte matrix
  -> I3 full regression and evidence freeze
  -> dedicated implementation audit
  -> explicit acceptance/archive/integration decision
  -> NEW S6.2 planning task
```

No stage may be skipped. A failing gate stops the task at that stage.

## P0 — Planning candidate freeze

### Inputs

- Base `55cb575c606646e8449359b0c46d5c905b3bb3c6`.
- Dedicated blocker audit `01a060d4-9bdb-7b71-b8be-868ff5685d9e`.
- Diagnostic S6.2 line `02ef4af... -> 5c709b8... -> c3c4d19...`.

### Planning-only files

- this task directory;
- RKP-2 parent `task.json`;
- Rust remediation parent `task.json`.

### Planning gates

1. verify base HEAD and both S6.2/audit commits exist but are not ancestors accidentally included after `55cb575c`;
2. verify new task is referenced exactly once by the RKP-2 parent;
3. verify no `src/**`, `test/**`, `crates/**`, `.gitattributes`, Cargo, package, tsconfig or toolchain delta;
4. validate child, RKP-2 parent and Rust parent Trellis manifests;
5. parse all JSON and JSONL; require every JSONL path to exist and appear at most once per manifest;
6. check Markdown fence parity and `git diff --check`;
7. run TypeScript typecheck, build and the current full baseline only as planning regression evidence;
8. commit docs only with:

```text
docs(rkp-2): plan tracked-byte EOL portability prerequisite
```

9. require clean/staged-empty status;
10. send the exact planning HEAD to a dedicated planning auditor.

## I0 — Activation and immutable baseline

### Entry gate

- exact planning HEAD has independent verdict `PASS FOR BOUNDED EOL PREREQUISITE IMPLEMENTATION`, P0/P1/P2=`0/0/0`;
- user authorization names this prerequisite or explicitly accepts its exact audited scope;
- branch HEAD and tree match the reviewed candidate;
- worktree clean and staged empty;
- RKP-2 parent has no different current planning or implementation child;
- old S6.2 branch remains untouched.

### Actions

1. write planning audit task ID, verdict, exact HEAD and authorization scope into this task and both parent projections;
2. run native `task.py start` for this task;
3. set this prerequisite as the sole implementation child of the RKP-2 parent; clear its planning pointer;
4. keep Rust remediation's direct implementation child as the RKP-2 parent, and set its blocking descendant to this task;
5. keep `stage_6_s6_2_started=false`, `stage_6_s6_3_started=false`, TypeScript default and every later authorization false;
6. record the exact activation Node baseline tuple:
   - focused command and exit;
   - total/pass/fail/skip;
   - sorted failure titles;
   - full command and exit;
   - total/pass/fail/skip;
   - sorted failure titles;
   - 80-file count and SHA-256;
7. record current seven-path `git ls-files --eol`, byte lengths and SHA-256 as diagnostic pre-fix values;
8. commit lifecycle/baseline evidence only.

### Exit gate

- task status `in_progress`;
- exact one implementation child pointer;
- no technical file change;
- E3 count zero;
- clean/staged-empty.

## I1 — EOL policy and Rust test-only repair

### RED capture

Use only E-drive output:

```powershell
$env:CARGO_TARGET_DIR='E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-eol-portability\cargo-target-1971'
$env:TEMP='E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-eol-portability\temp'
$env:TMP=$env:TEMP
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 test --workspace --all-targets --locked
```

The RED transcript must contain exactly the four known non-ignored source-shape failures. Any additional failure stops the task and returns to planning.

### Technical edits

1. Add exactly seven path-specific `text eol=lf` rules to `.gitattributes`.
2. Update only the five source-inspection expressions listed in `design.md` to inspect an in-memory LF-normalized string.
3. Add or extend a small test-only parity assertion proving identical structural results from representative LF and CRLF source text. Do not run or unignore the large scale test.
4. Do not modify S6.2 worker, worker-test, wrapper, fixture or Workspace Law semantics.
5. Mechanically verify production prefixes of the three Rust files equal the activation base using the file-specific unique terminal markers and raw Git-blob algorithm fixed in `design.md` section 5.3.

### Focused GREEN

Run the exact four previously failing tests by full test name, then run the small LF/CRLF parity test. All must pass. Verify the large scale test run count remains zero.

### I1 commit

Commit only the four technical allowlist files:

```text
test(rkp-2): make tracked-byte source checks EOL portable
```

The commit must be a single-parent child of I0 and leave the worktree clean.

## I2 — Dual-checkout byte matrix

### Candidate setup

- Pin `I1_SOURCE_HEAD` and its tree.
- Remove any prior verification directories under the exact E-drive task root only after validating their resolved paths remain under `.tmp\rkp2-eol-portability`.
- Create two new `--no-local --no-checkout` clones.
- Checkout `I1_SOURCE_HEAD` once with `core.autocrlf=true` and once with `core.autocrlf=false`.

### Mechanical verifier

For each of the seven paths:

1. use a task-local Node verifier and read checkout files with `fs.readFileSync()` as `Buffer`;
2. record byte length and lowercase SHA-256;
3. invoke `git cat-file blob <candidate-head>:<path>` with Node `spawnSync(..., {encoding:null})`, require exit `0`, and retain stdout as `Buffer`;
4. require true-checkout bytes == false-checkout bytes == blob bytes;
5. require `git ls-files --eol` to report `i/lf`, `w/lf`, `attr/text eol=lf`;
6. require no CRLF byte pair remains;
7. require clean status in both clones.

The verifier must reject:

- a missing, duplicate or extra path;
- hash-only equality with unequal byte length;
- normalized text comparison instead of raw bytes;
- a pre-existing checkout directory;
- a dirty checkout;
- any path whose attribute is absent or wildcard-derived outside the seven exact rules.

PowerShell pipeline capture, `Get-Content`, decoded strings, `git show` captured as text, and newline-normalized comparisons are invalid verifier implementations.

### Native gate

From one clean verification checkout, with E-drive Cargo/TEMP roots:

```powershell
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 fmt --all -- --check
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 check --workspace --all-targets --locked
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 test --workspace --all-targets --locked
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.88.0 check --workspace --all-targets --locked
```

Every command must exit 0. The existing large ignored test remains ignored.

### Exit gate

- fourteen checkout records and seven blob records complete;
- all raw bytes and hashes equal;
- Cargo gates green;
- both clones clean;
- implementation worktree clean;
- E3 count zero.

No commit is required if I2 only generates ignored transcripts.

## I3 — Repository regression and candidate freeze

### Regression gates

1. `python .\.trellis\scripts\task.py validate 09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
2. `python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity`
3. `python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation`
4. parse every changed JSON and every JSONL row;
5. require unique/existing JSONL paths;
6. require balanced Markdown fences;
7. `git diff --check`;
8. `npm run typecheck`;
9. `npm run build`;
10. rerun the exact focused and full Node commands captured in I0;
11. mechanically compare exit/count/title tuples to I0;
12. recompute the 80-file manifest independently and require exact equality with I0;
13. verify the technical diff is exactly four files and the Rust production regions are unchanged;
14. verify no `src/**`, Cargo manifests/lock, package manifests/lock, tsconfig, toolchain, public export, fixture content, worker semantics, wrapper semantics or old S6.2 branch change;
15. verify E3 execution count zero and no S6.2 evidence artifact exists on this branch.

### Evidence and lifecycle files

After all gates pass, update only:

- this task's `task.json`;
- this task's `implementation-evidence.md`;
- this task's `review-candidate.md`;
- this task's `operator-handoff.md`;
- RKP-2 parent `task.json` and bounded handoff/review projections when required;
- Rust parent `task.json`;
- `.trellis/spec/core-kernel/backend/rust-runtime-transition.md` with the accepted candidate's checkout-byte rule, only if the Phase 3.3 spec review confirms the rule is absent.

The evidence commit must contain no technical file. Suggested subject:

```text
docs(rkp-2): freeze EOL portability prerequisite evidence
```

### Candidate state

- `implementation_candidate_ready=true`;
- `current_phase=ready_for_dedicated_independent_implementation_review`;
- task remains `in_progress`;
- parent S6.2 remains not started/not completed on the authority line;
- no acceptance/archive/integration flag changes;
- worktree clean and staged empty.

## Independent implementation review

Use a new dedicated read-only task. The auditor must verify:

1. planning/A0/I1/evidence ancestry and single-parent boundaries;
2. exact four-file technical allowlist;
3. exact seven attribute rules and no wildcard;
4. five source checks retain their original negative assertions;
5. three Rust production regions are byte-identical to base;
6. dual fresh-checkout construction and cleanup;
7. fourteen checkout plus seven blob records and raw-byte equality;
8. Cargo 1.97.1/MSRV gates;
9. Node baseline tuple and manifest equality;
10. E3 zero and S6.2 provenance P1 still owned by the successor plan;
11. lifecycle authorization boundaries and clean state.

Only P0/P1/P2=`0/0/0` permits an owner acceptance decision. The audit does not itself authorize acceptance, archive or integration.

## Post-pass lifecycle

If the user explicitly authorizes closeout after a clean implementation audit:

1. record acceptance in this task and both parent projections;
2. archive this task natively;
3. create an integration candidate against `codex/rkp-2-indexed-live-score-store-implementation`;
4. independently audit the exact integration commit;
5. integrate only after that audit passes;
6. create a new S6.2 planning task from the exact integration HEAD;
7. keep TypeScript default and all later gates false.

## Stop conditions

Stop immediately and return to planning if:

- a file outside the technical allowlist is required to fix EOL behavior;
- a product Rust line must change;
- `.gitattributes` needs a wildcard or repository-wide normalization;
- either fresh checkout is dirty or hash-inconsistent;
- any Cargo gate other than the four known pre-fix failures appears;
- Node baseline gains a new failure/title/count drift;
- the large test or S6.2 E3 runs;
- C: receives Cargo/test output;
- acceptance, archive, integration, S6.2, S6.3, qualification, cutover, RKP-3 or push would be required.

## Rollback points

- **R0**: planning base `55cb575c...`.
- **R1**: audited planning HEAD before activation.
- **R2**: I0 activation commit before technical changes.
- **R3**: I1 technical commit before evidence/lifecycle changes.

Rollback uses a new revert commit at the appropriate boundary; no `reset --hard`, force push or mutation of the diagnostic S6.2 worktree is part of this task.
