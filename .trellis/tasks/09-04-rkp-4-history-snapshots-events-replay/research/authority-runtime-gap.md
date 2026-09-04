# Authority and Runtime Gap — RKP-4

## Verdict

RKP-4 is dependency-ready because RKP-3 is accepted/archived and exposes all
required reversible transaction facts. It is not implementation-active. The
current Rust runtime has none of the Stage-4 state owners, so this task must add
history/session projections rather than merely wrap the current read API.

## Evidence map

| Topic | Current authority/evidence | Planning consequence |
|---|---|---|
| Stage order | parent `implement.md:31-37`; Architecture Reset V2 `design.md:896-919` | RKP-4 may start after RKP-3 archive; RKP-5+ stays closed |
| History shape | Architecture Reset V2 `design.md:548-570` | one `Vec<HistoryEntry> + cursor`; no document/handle/function/time/random/file |
| Checkpoint trigger | Architecture Reset V2 `design.md:572-574` | 512 committed entries or 32 MiB accumulated ChangeSets; materialize post-critical-section |
| Read/event contract | `.trellis/spec/core-kernel/backend/snapshot-events.md` | atomic frozen snapshot, six selectors, identity dirty, exact event and callback laws |
| Command/history contract | `.trellis/spec/core-kernel/backend/command-transaction.md` | one history unit per effective command/batch; stored-effect undo/redo; semantic replay |
| RKP-3 source | archived RKP-3 task and `crates/brilliant-kernel-runtime/src/change_set.rs` | reuse forward/inverse/affected/segments/logical bytes; do not recreate effects |
| Current Rust state | `crates/brilliant-kernel-runtime/src/runtime.rs` | owns only store/version/metrics; read exports full document and placeholders |
| Current Session | `crates/brilliant-kernel-session/src/session.rs` | has create/read/submit Stage-3 only; semantic envelope must enter history commit metadata |
| Current Node/TS | Node `lib.rs`, `boundary.rs`, private `rust-kernel-smoke.ts` | three exports; adapter assumes history 0/0 and dirty false; needs successor-aware private Stage-4 path |
| Oracle | archived RKP-0 rows 57-61 | exact Stage-4 projection exists without changing fixture bytes |

## Concrete gaps

1. `KernelRuntime` has no history vector/cursor, next history sequence,
   per-version identity map, clean identity, snapshot cache, checkpoint state,
   event sequence, selector routes or Stage-4 metrics.
2. RKP-3's production commit returns `ChangeSetV1`, but current Session does not
   pass the original decoded semantic envelope into Runtime history metadata.
3. Stored forward/inverse application exists only as an RKP-3 test seam; undo
   and redo need a production-private preflight/adoption path.
4. Current native read exports the full document every time and emits fixed
   `undoDepth=0`, `redoDepth=0`, `dirty=false`.
5. Current TypeScript selector implementation indexes an already materialized
   snapshot. The Rust migration target must instead query the live store and
   accepted indices.
6. No native event or callback boundary exists. Callbacks must remain in JS;
   Rust can own only deterministic sequence/facts.
7. No native replay entry exists. The new seam must take semantic envelopes and
   a fresh document, never stored effects or a live handle.

## Non-gap / deferred authority

- RKP-3 already owns all 28 Core command semantics and atomic ChangeSets; RKP-4
  must consume rather than reopen them.
- RKP-5 owns complete Level A/B/C validation and support classification. RKP-4
  provides the pre-adoption insertion point but cannot honestly claim those
  outputs.
- RKP-6 owns module/plugin identity and integrated replay/session behavior.
- RKP-7 owns blocking latency/RSS and complete TS/Rust differential PASS.
- Persistence owns physical checkpoint/journal/recovery behavior.

## Dependency verdict

`READY_FOR_PLANNING`; implementation remains `NOT_AUTHORIZED` until a separate
owner approval runs `task.py start`.
