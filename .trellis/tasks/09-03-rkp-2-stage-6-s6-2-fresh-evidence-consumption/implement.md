# RKP-2 Stage 6 S6.2 Fresh Evidence Consumption — Implementation Plan

## 0. Planning stop gate

The task is planning-only. Do not run task.py start, edit technical files, run
the large opt-in workload, create implementation evidence, accept, archive,
integrate, start S6.3, qualify, cut over, create RKP-3 or push until:

1. the exact docs-only candidate is committed;
2. a fresh read-only planning audit returns P0/P1/P2=0/0/0; and
3. the user explicitly authorizes activation of this reviewed task.

## 1. Planning candidate

1. Require HEAD 9da9d036... and tree 179e08f0....
2. Verify the predecessor archive exists, its active root is absent, and
   9da9d036... contains e4d6216d... and ff847a5d... in order.
3. Verify the stopped branch remains separate and has no ancestry role.
4. Recompute the five planning hashes and eight EOL/raw hashes.
5. Complete the eleven-file task tree and four parent projections.
6. Require the exact fifteen-path planning allowlist and zero protected delta.
7. Run Trellis/JSON/JSONL/fence/typecheck/build/diff checks.
8. Commit as:

       docs(rkp-2): plan fresh S6.2 evidence consumption

9. On the clean commit, classify focused 11/7/4/0. A fresh checkout without the
   ignored native addon must be 590/582/7/1 with exactly three missing-addon
   file failures plus four governance failures. To claim the built lane, build
   `brilliant-kernel-node`, copy the real DLL to the ignored `.node` target with
   SHA-256 equality, and require 611/605/4/2. Verify the 80-file manifest, then
   perform a fresh read-only planning audit.

## 2. Transcript classifier

Every planning/E1/E2/E4 run captures stdout/stderr and exit code. The classifier
must find exactly one tests, pass, fail and skipped summary, require exit 1 when
fail is nonzero, and compare the unique top-level failure-title set.

Planning titles:

- implementation changes stay inside the literal RKP-2 allowlists
- part owner repair stays anchored to its accepted six-path wire contract
- Stage 6 hostile and resource evidence consumes the existing private Rust seams
- Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts

The fresh no-native planning lane additionally owns exactly three file-level
failures: rkp-1-node-bridge-smoke.test.js,
rkp-1a-property-cap-compatibility.test.js and
rkp-2-live-score-store-parity.test.js. It is 590/582/7/1. The built-native lane
is 611/605/4/2 and contains only the four governance titles.

Post-E1 titles are the first three only. Full-run output must include exactly
one full-test-manifest-v1 record with fileCount 80 and SHA-256 1a50fd28....
A bare nonzero node or npm result is never accepted.

## 3. A0 activation

After planning PASS and user confirmation:

1. recheck exact candidate HEAD/tree and clean state;
2. recheck workload hashes and parent live gate;
3. run task.py start for this new task under the current Trellis session;
4. set child status in_progress and task_start_run=true;
5. move parent/Rust projections from current planning child to current
   implementation child;
6. set S6.2 started=true/completed=false; keep S6.3=false and all later gates
   false;
7. commit only the seven activation lifecycle paths.

## 4. Before technical editing

Run trellis-before-dev. Read the new PRD/design/implement artifacts, run
get_context.py --mode packages, and read:

- .trellis/spec/core-kernel/index.md
- .trellis/spec/core-kernel/backend/index.md
- .trellis/spec/core-kernel/backend/rust-runtime-transition.md
- .trellis/spec/core-kernel/backend/quality-guidelines.md
- .trellis/spec/guides/code-reuse-thinking-guide.md
- .trellis/spec/guides/long-term-maintenance-guide.md

## 5. E1 — reconstruct and freeze the source

Edit exactly the three technical paths.

Worker:

- add private prefix BRILLIANT_RKP2_SCALE_CONSUMPTION_V1:;
- add processSentinelBase64, processSentinelBytes and
  processSentinelSha256 to the private WorkerResult;
- after successful envelope/process/cleanup validation, clone the exact stdout
  Buffer and derive the three fields from that clone;
- do not alter ScaleProcessEnvelope, decodeProcessEnvelope, failure codes,
  timeouts, caps or public exports.

Worker test:

- reconstruct the sentinel from Base64;
- assert length, SHA-256 and exact decode equality;
- require exactly one process prefix;
- only after all workload assertions, write exactly one ordered consumption
  record with schemaVersion, Base64, bytes, SHA-256 and wallElapsedMicros;
- emit nothing on rejection.

Workspace Law:

- bind the new task/base/archive/branch and literal path sets;
- bind planning and implementation hash maps;
- bind source-before-evidence ordering and evidence absence at source;
- bind dual-autocrlf seven-path equality;
- bind fresh request, one execution, archived-hash inequality and exact
  source-to-evidence lifecycle diff;
- preserve the existing top-level test count by extending the current Stage 6
  semantic/canonical law rather than adding another top-level test;
- include negative fixtures for extra paths, drifted hashes, stale objects,
  premature evidence/completion, duplicate records, partial evidence and later
  lifecycle drift.

Recompute the five implementation hashes. Only worker and worker-test may
differ from planning. Stage exactly the three technical files plus the child
task hash projection and commit:

    test(rkp-2): rebuild S6.2 evidence source

At this commit, implementation-evidence.md must not exist. Require clean index
and worktree, then run:

- npm typecheck and build;
- focused Workspace Law 11/8/3/0;
- full runner 611/606/3/2 plus exact manifest;
- Cargo 1.97.1 fmt/check/test/clippy;
- Cargo 1.88.0 workspace/all-targets check;
- dual-autocrlf raw-byte matrix for all seven EOL paths;
- exact technical/lifecycle allowlists and protected-path zero delta.

Only then record this commit as S6_2_EVIDENCE_SOURCE_HEAD. No tracked technical
edit is permitted afterward.

## 6. E2 — representative proof

Use absolute C:\Users\ATOM\.cargo\bin\cargo.exe only as the executable. Put
CARGO_TARGET_DIR, TEMP and TMP under:

- E:\desktop\brilliant_ideas\brilliant_guitar\.cargo-target\rkp2-s6-2-fresh
- E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-s6-2-fresh

Build the Node addon at the source head. Require a real DLL, delete any stale
target .node, copy with terminating errors and require source/target SHA-256
equality. Then run:

1. both Cargo toolchain probes;
2. full Rust fmt/check/test/clippy/MSRV gates;
3. typecheck and build;
4. RKP-1 Node bridge smoke;
5. RKP-2 parity suite;
6. scale-worker representative suite without the opt-in environment;
7. focused Workspace Law classifier;
8. complete full-run classifier and manifest.

All ordinary commands require exit 0. Only the two explicitly classified
governance suites may exit 1. Stop at first mismatch. E2 changes no tracked
file and cannot start E3 on focused-only evidence.

## 7. E3 — one fresh large run

Preconditions:

- HEAD equals S6_2_EVIDENCE_SOURCE_HEAD and is clean;
- all five implementation hashes and seven EOL blobs match;
- E2 passed at this exact HEAD;
- BRILLIANT_RKP2_RUN_SCALE_E2, BRILLIANT_RKP2_SCALE_REQUEST_V1 and
  BRILLIANT_RKP2_CARGO are absent;
- no historical request/output path is selected.

Set the E:-resident roots and pass the validated absolute Cargo executable
through BRILLIANT_RKP2_CARGO. Set BRILLIANT_RKP2_RUN_SCALE_E2=1 and invoke the
compiled opt-in Node test exactly once. Always remove all three variables in a
finally block.

Capture exactly one consumption record. Independently:

1. verify its exact keys and positive wall elapsed;
2. Base64-decode the sentinel;
3. recompute byte length and SHA-256;
4. require exactly one process prefix;
5. parse the exact process-envelope shape;
6. prove exit 0, no timeout, positive RSS, not-required termination, successful
   reap/cleanup and partialEvidence=false;
7. prove fixed counts/counters, parity, semantic/canonical equality, ordering
   and extension preservation;
8. require the new sentinel SHA differs from 64e09779....

On failure, publish no PASS evidence and keep e3_execution_count at the
truthful attempted value. Do not rerun without a reviewed decision.

## 8. E4 — evidence-only candidate freeze

After one valid E3:

1. create child research/implementation-evidence.md;
2. record exact source/evidence commits and trees, both hash maps, tool/OS
   context, focused/full/Rust results, complete consumption record, decoded
   process result, RSS/elapsed, cleanup, EOL matrix and protected-path result;
3. set child implementation_candidate_ready=true only;
4. keep parent candidate-ready false, S6.2 incomplete and S6.3 false;
5. prove source-to-candidate diff equals the eight lifecycle paths and has zero
   technical delta;
6. repeat E2 classifications and full candidate validation;
7. commit:

       docs(rkp-2): freeze fresh S6.2 evidence candidate

Stop at READY FOR FRESH READ-ONLY S6.2 IMPLEMENTATION AUDIT.

## 9. Review and lifecycle

The implementation audit reviews the exact E4 commit in a clean fresh checkout
and must return P0/P1/P2=0/0/0. That PASS permits only a later owner decision.
Acceptance, native archive and fast-forward integration require separate
authorization. S6.3 remains a later explicit gate. Never push.

## 10. Planning validation commands

Run:

    python .\.trellis\scripts\task.py validate 09-03-rkp-2-stage-6-s6-2-fresh-evidence-consumption
    python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
    python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
    npm.cmd run typecheck
    npm.cmd run build
    node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
    npm.cmd test
    git diff --check
    git status --short --branch

In a fresh checkout, classify `npm.cmd test` as the exact no-native lane unless
the reviewer first runs the accepted debug build:

    cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked

Then copy
`target/x86_64-pc-windows-msvc/debug/brilliant_kernel_node.dll` to
`target/rkp-1-node/brilliant_kernel_node.node` and prove the two SHA-256 values
equal. Only then require the built-native lane. Also parse every changed
JSON/JSONL file, verify manifest path uniqueness and existence, Markdown fence
parity, exact fifteen-path planning delta, zero protected delta and the five
raw hashes.

## 11. Hard stop

Do not treat S6.2 diagnostic evidence as product qualification. Do not start
S6.3, mark RKP-2 complete, switch the default runtime, create RKP-3, archive,
integrate or push without the corresponding later gate.
