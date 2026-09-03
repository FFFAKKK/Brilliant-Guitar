# RKP-2 Stage 6 S6.2 Fresh Evidence Consumption — Design

## 1. Decision

S6.2 is a bounded evidence-consumption stage, not another Runtime
implementation stage. It adds lossless private observation of the already
validated process sentinel and binds that observation to current repository
authority. The accepted Rust mechanism, fixture and PowerShell owner remain
unchanged.

The stopped S6.2 branch is not a base, patch source or lifecycle predecessor.
It is used only to enumerate mistakes that the fresh design must prevent.

## 2. Flow and gates

    integrated base 9da9d036
      -> fresh docs-only planning candidate
      -> fresh read-only planning audit PASS
      -> explicit user activation and task.py start
      -> E1 reconstructed three-file source commit, no evidence
      -> E1 source gates plus dual-autocrlf verification
      -> E2 representative hostile/resource proof, no edit
      -> E3 one fresh large run at the same source
      -> E4 evidence/lifecycle-only candidate freeze
      -> fresh read-only implementation audit
      -> separate owner acceptance/archive/integration decision
      -> parent S6.2 complete, S6.3 still false

## 3. Authority chain

| Authority | Exact object | Role |
| --- | --- | --- |
| Fresh planning base | 9da9d036... / tree 179e08f0... | only current source |
| Accepted technical prerequisite | ff847a5d... / tree dd223ba4... | audited EOL projection |
| Acceptance sync | e4d6216d... | owner lifecycle decision |
| Native archive/integration | 9da9d036... | immutable predecessor archive |
| Predecessor archive | archive/2026-09/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite | EOL and replay authority |
| New task | 09-03-rkp-2-stage-6-s6-2-fresh-evidence-consumption | sole S6.2 owner |
| Stopped branch | c3c4d198... | diagnostic only, never consumed |

The parent and Rust parent keep the archived prerequisite as completed history
and point their sole live gate at this new planning task.

## 4. Ownership

Existing immutable owners:

- createStressCvn7Score owns the fixed workload.
- indices::tests::rkp2_stage_6_private_scale_evidence_v1 owns private
  Store/index/materialization/encode evidence.
- rkp-2-scale-evidence-worker.ts owns request construction, artifact discovery,
  process invocation and final envelope decode.
- rkp-2-scale-evidence-process.ps1 owns the handed-off process, liveness,
  stream caps, RSS, termination, reap and cleanup.
- Existing Rust and Node suites own hostile and representative behavior.

The new task owns only:

- the current-authority Workspace Law projection;
- detached Base64/length/SHA observation of already validated stdout bytes;
- exactly one final private consumption record after all assertions;
- the fresh execution record and lifecycle state.

It owns no public API, Store behavior, persisted schema or product budget.

## 5. File boundaries

Planning candidate: exactly eleven new task files plus four parent projections.
No directory wildcard is an authority.

Future technical allowlist:

1. test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
2. test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
3. test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts

Future lifecycle allowlist:

1. new child task.json
2. new child operator-handoff.md
3. new child review-candidate.md
4. new child research/implementation-evidence.md
5. parent RKP-2 task.json
6. parent RKP-2 operator-handoff.md
7. parent RKP-2 review-candidate.md
8. Rust-parent task.json

All other paths are protected.

## 6. Fresh source construction

E1 is rebuilt against current LF bytes. The two small worker/test observations
may follow the stopped diff's intent, but are authored anew. Workspace Law is
rebased conceptually onto 9da9d036..., includes the archived EOL authority and
new task paths, and must not import stale commit IDs, path counts, hash maps or
lifecycle assertions.

E1 produces one source commit. The evidence file is absent at that commit.
After source validation, no technical edit is legal. This prevents an evidence
document from silently describing different executable bytes.

## 7. EOL and raw-byte boundary

The EOL predecessor pins .gitattributes and seven tracked inputs to LF. At the
E1 source:

- git check-attr must report text set and eol lf for all seven paths;
- fresh autocrlf=true and autocrlf=false checkouts must be clean;
- each checkout file must equal its Git blob byte-for-byte and contain no CR;
- E1 worker/test hashes are recomputed from raw bytes, not normalized text.

The Workspace Law source itself is reviewed by Git diff and TypeScript build;
it is not added to the five-file workload hash map.

## 8. Provenance and non-reuse

The old private mechanism run remains valid historical evidence only. Its
sentinel SHA-256 is 64e09779.... The new E3 must:

1. execute at the exact E1 source head after E2;
2. begin with clean scale environment variables;
3. let the worker create a new random leaf and request with exclusive creation;
4. run the opt-in test once;
5. emit one consumption record;
6. decode it independently and verify the embedded process envelope;
7. record a sentinel hash different from 64e09779....

No archived output file, prose value or transient path is an input.

## 9. Test state model

| Phase | Focused Workspace Law | Full suite | Meaning |
| --- | --- | --- | --- |
| dirty planning worktree | 11/7/4/0 | 611/604/5/2 | extra full failure is clean-tree guard |
| clean fresh planning candidate, native absent | 11/7/4/0 | 590/582/7/1 | three missing-addon file REDs plus four governance REDs |
| clean planning candidate, validated native present | 11/7/4/0 | 611/605/4/2 | four known governance REDs |
| E1/E2/E4 | 11/8/3/0 | 611/606/3/2 | S6.2-owned law green; three inherited REDs |

All nonzero exits are accepted only when a lane-aware classifier proves the
exact counts, exact unique title/file set and exit 1. The 611 planning lane is
legal only after building `brilliant-kernel-node`, copying the real DLL to the
ignored `.node` load target, and proving source/target SHA-256 equality. Any
other result blocks. The full manifest must remain 80 files / 1a50fd28....

## 10. Validity and evidence publication

The worker clones the exact process stdout only after successful decode,
process settlement and ownership cleanup. It returns detached Base64, byte
length and SHA-256. The opt-in test reconstructs and revalidates those bytes,
then emits one ordered consumption record.

The operator independently decodes the record. Only then may E4 create
implementation-evidence.md. On any failure, no PASS evidence file is written.

## 11. Rollback

- Planning rollback removes only the new task and four parent projections.
- Activation rollback requires a reviewed lifecycle repair; no code is touched.
- E1 rollback reverts its one three-file technical/source projection commit.
- E2/E3 failure creates no tracked pass evidence.
- E4 rollback removes only evidence and lifecycle projections.
- Archived predecessors are never rewritten or deleted.

## 12. Compatibility boundary

The 28 Core commands, 51 application Runtime exports, Module SDK 8 runtime / 34
type exports, nine-field contribution ABI, two Node exports, stable failure
union, brilliant-score-1 schema and TypeScript default remain unchanged.
