# Brilliant Guitar Architecture Reset V2 — Candidate Production and Promotion Plan

## 0. Scope

This plan describes how to produce, audit, accept, and later synchronize the architecture **documents**. It is not a Rust implementation plan and never authorizes `task.py start` or RKP-1.

Current candidate constraints:

- exact base: `5e1599598b1468784ae9b7410383ef63b33201b8`;
- branch: `codex/brilliant-guitar-architecture-reset-v2`;
- worktree: `.worktrees/brilliant-guitar-architecture-reset-v2`;
- task state: `planning`;
- production implementation authorization: false;
- authority status: proposed, not current.

## 1. Candidate file ownership

### 1.1 Allowed candidate changes

Only these paths may differ from the base:

```text
.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/**
.trellis/tasks/06-29-commercial-guitar-tablature-product/task.json
```

The product parent change is limited to one unique child reference. No product PRD/technical document is updated in this candidate.

### 1.2 Protected paths

The following must be byte/diff clean relative to the base:

```text
src/**
test/**
package.json
package-lock.json
tsconfig.json
tsconfig.*.json
Cargo.toml
Cargo.lock
crates/**
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/**
.trellis/tasks/08-11-post-core-official-plugin-product-roadmap/**
.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md
.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/**
```

## 2. Phase A — preflight and evidence capture

### Entry

- user explicitly approved the V2 plan;
- base commit exists;
- branch/worktree/task names are unoccupied.

### Actions

1. Create the branch/worktree from the exact base.
2. Create the Trellis task with parent `06-29-commercial-guitar-tablature-product`.
3. Do not run `task.py start`.
4. Record physical source counts, missing product paths, hot-path code evidence, full baseline, CVN-7 qualification state, RKP status, accepted oracle inventories, and authority conflicts.

### Exit

- HEAD ancestry resolves to the exact base;
- parent has one child reference;
- evidence is reproducible from committed paths;
- production diff is empty.

### Rollback

Remove only the uncommitted candidate worktree/branch/task reference after verifying their exact paths. Never reset another worktree or CVN/RKP candidate.

## 3. Phase B — self-contained candidate authoring

### Entry

Phase A evidence exists and no production path changed.

### Actions

1. Write `prd.md` with numbered requirements, exclusions, and acceptance gates.
2. Write `design.md` as the self-contained authority candidate.
3. Include:
   - current physical architecture and complexity root cause;
   - Brilliant Core Platform terminology;
   - five-crate dependency law;
   - ScoreDocument/LiveScoreStore and three-identity design;
   - indices and complexity contract;
   - transaction/history/validation/snapshot/event/thread model;
   - extension surfaces and the two Assembly owners;
   - FFI, compatibility, performance, RKP sequence and Guitar Core Loop;
   - old-design disposition and future test matrix;
   - exact protected inventory appendix.
4. Write research evidence and conflict map.
5. Write operator and independent-auditor handoff files.
6. Populate real implement/check JSONL context.

### Exit

- the main document can be read without old-doc reconstruction;
- each capability has one owner;
- every old conflict has a disposition;
- every requested decision is either frozen or explicitly delegated to one RKP stage.

### Rollback

Revert only the candidate task files; the existing authorities remain untouched.

## 4. Phase C — planning self-audit

### Checklist

1. **Terminology:** `Brilliant Core Platform` contains six named layers; Kernel Runtime alone is the narrow microkernel.
2. **Dependencies:** five crate graph is acyclic; Use Cases is not a sixth crate.
3. **Data:** ScoreDocument and LiveScoreStore share semantic truth but have explicit conversion; no second truth.
4. **Identity:** EntityId, RuntimeHandle and MusicalLocation cannot leak into each other's public/persisted roles.
5. **Time:** Event/Voice sequence remains the rhythmic truth; Note has no duplicate time/duration/string/fret.
6. **Extension:** V1 block owners remain score/Part.
7. **Transactions:** one runtime owner; overlay rejection zero-delta; history contains changes, not documents.
8. **Validation:** incremental path has a full-parity acceptance gate.
9. **Snapshots/events:** explicit full materialization and stable public identity; no handles/pointers.
10. **Assemblies:** KernelProviderAssembly and Product ApplicationAssembly each have one distinct owner.
11. **Plugins:** official Rust, public TypeScript and React visual surfaces do not cross boundaries; lifecycle stays in Product Host.
12. **Compatibility:** 28/51/8/34/9 and `brilliant-score-1` match RKP-0 oracle.
13. **Migration:** RKP-0 to RKP-9 is ordered and reversible; only RKP-8 switches default.
14. **Product:** Guitar Core Loop starts after RKP-9 and before more generic horizontal APIs.
15. **Candidate lifecycle:** proposed/pending only; no authority sync, implementation, archive or push.

Self-audit may be recorded `0/0/0` only after all direct inconsistencies are repaired and automated document gates pass. It never replaces independent review.

## 5. Phase D — automated candidate validation

Run in this exact worktree.

### 5.1 Git lineage and scope

```powershell
git rev-parse HEAD
git merge-base HEAD 5e1599598b1468784ae9b7410383ef63b33201b8
git merge-base --is-ancestor 5e1599598b1468784ae9b7410383ef63b33201b8 HEAD
git diff --check
git diff --name-only 5e1599598b1468784ae9b7410383ef63b33201b8 -- src test package.json package-lock.json tsconfig.json Cargo.toml Cargo.lock crates
```

The last command must print no path.

### 5.2 Trellis hierarchy

```powershell
python .\.trellis\scripts\task.py validate 08-16-brilliant-guitar-architecture-reset-v2
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap
```

Then parse every JSON/JSONL file; prove each JSONL path exists, each context file contains no duplicate path, and the product parent references the new child exactly once.

### 5.3 Markdown structure

Verify:

- fenced-code opening/closing counts are even per Markdown file;
- Mermaid blocks close;
- required headings are present;
- no unresolved placeholder remains in normative documents;
- `design.md` contains every protected count and the two Assembly owners.

### 5.4 Baseline regression

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Required result: typecheck/build green and full suite 531/531.

## 6. Phase E — independent architecture review

### Handoff

A separate read-only architecture-auditor session receives:

- exact branch/worktree/HEAD;
- base commit;
- task path;
- this candidate and both research files;
- protected diff and automated results;
- the focused review list in `review-candidate.md`.

### Auditor constraints

- read-only;
- do not start RKP-1;
- do not modify candidate or current authorities;
- distinguish design defects from future implementation choices;
- report P0/P1/P2 and precise file/line evidence.

### Exit

- `PASS`, P0/P1/P2=`0/0/0`; or
- `RETURN FOR BOUNDED PLANNING REPAIR` with concrete findings.

On return, the planner changes only candidate docs, creates a narrow docs-only repair commit, reruns direct/automated gates, and sends a targeted rereview.

## 7. Phase F — candidate commit

After local self-audit and automated gates, create one docs-only commit:

```text
docs(architecture): propose Brilliant Guitar Architecture Reset V2
```

The commit includes only candidate task files and the parent's unique child reference. After commit:

```powershell
git status --short --branch
git show --stat --oneline HEAD
git diff-tree --no-commit-id --name-only -r HEAD
```

Required: worktree clean, staged empty, and commit scope exact. Commit does not mark independent review passed.

## 8. Phase G — future authority promotion (separate commit only)

This phase is forbidden until independent review passes and the user explicitly accepts V2.

The future docs-only authority-sync commit will:

1. mark V2 current;
2. point product PRD/current architecture index to V2;
3. point Core spec index to V2;
4. update Rust remediation parent from four to five crates and make RKP-1 consume V2;
5. update post-Core roadmap to the Core Platform/Product Host boundary;
6. mark old microkernel/software/project/modular-plugin architecture texts historical/superseded where conflicting;
7. preserve old files for decision traceability;
8. still make no production/Cargo changes.

Only after that sync is accepted may a separate RKP-1 planning task be created. RKP-1 activation remains another explicit lifecycle decision.

## 9. Operator stop conditions

Stop and return to planning if any of these occurs:

- an owner is duplicated or absent;
- a RuntimeHandle crosses a public/persisted boundary;
- a proposed local-edit path allows full scan/clone/full validation by default;
- five-crate dependency graph cycles;
- observable 28/51/8/34/9/schema compatibility changes;
- ExtensionBlock ownership changes;
- a product service/plugin lifecycle moves into Kernel Runtime;
- RKP-1 or production paths appear in the candidate diff;
- full regression differs from 531/531 for reasons caused by this docs-only candidate;
- independent reviewer returns any P0/P1/P2 finding.
