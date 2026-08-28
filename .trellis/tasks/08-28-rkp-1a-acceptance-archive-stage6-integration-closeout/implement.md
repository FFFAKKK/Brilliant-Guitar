# Implementation Plan — RKP-1A Acceptance Archive and Stage6 Integration Closeout

## C0 — planning candidate only

1. Confirm exact base `08374273b05bc992e749a17a959b64af0f293f0b`, clean source and clean new worktree.
2. Create this planning task and parent-child link exactly once; do not run `task.py start`.
3. Record B independent implementation PASS P0/P1/P2=`0/0/0` as audit evidence, not as owner acceptance or archive/integration authorization.
4. Record RKP-1A closeout planning review as next gate. RKP-2 remains the sole active implementation child; Stage6 E2/E3 remain false and TypeScript remains default.
5. Run planning validation. The focused law is expected to return 10/6/4 because C0 is a B descendant; capture the fourth bounded closeout-planning RED without changing the test.

Commit: `docs(rkp-1a): plan acceptance archive and stage6 integration closeout`.

## C1 — accepted-B authority transition (future)

Preconditions: C0 independent planning PASS, separate user authorization, clean head.

1. Pin B `08374273...` and A3 `3063e097...`; record owner acceptance.
2. Mechanically migrate workspace-law from `HEAD`-as-B to immutable base→accepted-B checks, A3→B direct-parent/non-merge checks and historical-active/archive-root separation.
3. Re-run focused law: exact 10/7/3 only. Archive and integration remain false.

Commit: `docs(rkp-1a): transition accepted B closeout authority`.

## C2 — native archive (future)

Preconditions: C1 green, no unstaged files. Run only the frozen native command:

```powershell
python ./.trellis/scripts/task.py archive 08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair
```

Validate the 13 source/13 archive inventory and capture the named C3 self-projection transition state; do not call it final green evidence.

Commit: native Trellis archive commit only.

## C3 — archive-authority repair (future)

Preconditions: C2 inventory exact. Update only archived `task.json`, `implement.jsonl` and `check.jsonl` if active self references fail. Verify active absence, archive presence, archive JSONL and final 10/7/3 law. Sync only the permitted parent task projections.

Commit: `docs(rkp-1a): repair archived closeout authority`.

## C4 — Stage6 fast-forward integration (future)

Preconditions: Stage6 worktree is clean at `639e935...`; that head is an ancestor of C3 head. Use `git merge --ff-only` only. Then add the narrow docs-only integration projection. Verify integration ancestry, archive authority and final 10/7/3 law. E2 remains false.

Commit: `docs(rkp-2): record RKP-1A closeout integration`.

## C5 — independent closeout audit and archive (future)

Audit B→C4 first. On PASS, native archive this closeout task; its JSONL must continue to reference only stable external authorities. Any terminal parent projection is docs/task-state only. The next possible task is a separate Stage6 semantic/canonical authority-amendment plan, never E2 implementation.

## Validation discipline

Every phase runs exact ancestry/path-set checks, Trellis, JSON/JSONL/path/parent checks, fences and `git diff --check`. Production/src, Cargo/package/tsconfig/spec and all tests except the C1/C3 workspace-law path remain zero delta. Rust/native/full evidence may be reused only where technical bytes have not changed; final C4 rechecks focused law on Node current and Node 20 with a newly printed manifest/hash. All temporary/build output stays on E:.
