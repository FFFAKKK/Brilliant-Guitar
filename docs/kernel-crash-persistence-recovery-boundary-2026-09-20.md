# Rust microkernel crash and persistence recovery boundary

Date: 2026-09-20; source-fact correction and integration: 2026-09-21.

This is a reviewed adaptation of the corrected documentation at
`3a7d87074d0a833576bd7e908ce26a249682c38c`, not the original `9640b6c` draft
and not approval for a new persistence architecture. Facts were rechecked
against combined candidate `7bdcadf07e4661261dfbba4a866fbf88b4d34fe8`.
This slice adds no runtime behavior, filesystem access, durable format, session
registry reconstruction, plugin lifecycle or Agent execution.

## Existing mechanisms

| Mechanism | Meaning | Survives process loss |
| --- | --- | --- |
| Operational checkpoint | One in-memory `Arc<ScoreDocumentV1>` with version, history cursor and content identity | No |
| `mark_persisted` | Acknowledge an external save of an exact document version and update live clean identity | No; this operation performs no I/O |
| Stage 4 replay | Recreate a fresh session from an initial document and captured Core submit commands | Only if an external owner persists the replay inputs |
| Desktop project save/recovery | Lossless document export, file replacement and validated import | A completed write can provide a document recovery point; platform crash guarantees require qualification |

Checkpoint canonical byte counting is a resource metric, not a save receipt
or a stable durable checkpoint format. Stage 4 replay is regression/migration
infrastructure, not a complete session journal: it omits arbitrary history
cursor movement, integrated plugin execution, runtime roster identity and the
complete internal history payload.

Kernel preserves in-process publication atomicity across Store, version,
history, dirty identity, checkpoint schedule and event sequence. Failed
pre-publication mutations preserve those semantic values. A failed post-commit
checkpoint materialization keeps the mutation committed and maintenance due.
None of these facts means every acknowledged command survives process loss.

Opening a saved document creates a new revision-zero, clean session with empty
undo/redo history. Musical data recovery already exists; exact session
continuity does not.

## Existing Desktop save and recovery

The path already existed in common baseline
`269112b2d85e01827e8cb81bdcc5b671afde4303`. It is not a missing Kernel feature.

1. `workbench_save_file_v1` selects a path and obtains JSON plus document
   version from `ScoreSessionService::export_snapshot` while holding the
   service mutex.
2. `export_document` encodes the complete DTO using `write_lossless`. The
   Desktop convention is `.bgp.json`; explicit `.json` names are also accepted.
3. `document_io::atomic_write` creates a new sibling temporary file, writes
   and flushes it, calls `sync_all`, replaces the target, then calls `sync_parent`.
4. Only after that write returns success does the command reacquire the mutex
   and call `mark_saved(workspace_id, path, saved_version)`, which delegates to
   Kernel `mark-persisted`.
5. Within the same session, Kernel maps the saved version to its retained
   content identity. An older completion cannot mark a different current
   identity clean. Recovery removal after save is conditional on the returned
   current version equaling the saved version.
6. Open/recovery decodes with `decode_lossless_json` and
   `decode_lossless_score_document_value`, validates through
   `KernelSession::create`, and only then installs the new session.

The snapshot receipt contains JSON and version, not a separately captured
session identity. `mark_saved` obtains document identity from the live workspace
session. Kernel's same-session delayed-version tests do not establish safety
across interleaved open/import/close and replacement of that session. This is a
documented qualification gap, not a new guarantee or authorization to refactor.

The canonical writer serves the frozen canonical snapshot contract and
streaming checkpoint byte counting. Its lexical ordering of opaque payload
properties differs from lossless DTO insertion ordering. It must not replace
the Desktop file codec as part of this integration.

### Background recovery

`AppState` owns `RecoveryManager` and per-workspace `.bgp.json` paths beneath
the app-data recovery directory. Existing create/edit/import command paths
schedule lossless exports. The worker coalesces pending documents by path and
flushes after a 250 ms receive timeout or an explicit flush.

Queue submission is not a per-command durable receipt. The timeout is not a
guaranteed maximum loss window. `schedule_current_recovery` can ignore export,
directory preparation or scheduling failures; failed worker writes remain
pending for retry. Unsaved or unwritten edits can still be lost.

`read_or_recover` imports a recovery file only when no live session exists;
invalid input is quarantined instead of silently loaded or deleted. Close
flushes and removes recovery before closing; open and successful current-version
save also remove the old recovery file. Recovery restores the document, not
undo/redo, event sequence, transient snapshots, checkpoint counters or caches.

### File guarantees

`document_io.rs` uses `MoveFileExW` with replace/write-through flags on Windows
and `fs::rename` elsewhere. A returned error triggers cleanup of that attempt's
temporary file. `sync_parent` is a no-op on Windows and best-effort elsewhere:
parent open/sync errors are not returned.

These source facts are not proof against every filesystem or power-loss
failure. Crash-abandoned temporary-file scanning, multi-generation integrity
metadata and selection of a latest valid generation are not implemented by
this helper. Stronger guarantees need separate policy and platform validation.

## Ownership

| Owner | Existing responsibility | Not granted by this note |
| --- | --- | --- |
| Rust Kernel Session | Validation, transaction/history, coherent snapshot/version, dirty identity, exact-version acknowledgment | Paths, file I/O, autosave policy or exposing private history/checkpoint as a file format |
| Rust Desktop commands, service and AppState | File dialogs, save ordering, session registry, export/import, acknowledgment and recovery scheduling | A new service extraction, automatic registry reconstruction or stronger public save contract |
| `document_io.rs` and recovery worker | Temporary writes, flush/sync, replacement, coalescing, removal and quarantine | Inferring Kernel history/dirty state or executing Kernel commands |
| UI, transport, plugins and Agent | Consume authorized typed requests/results and display relevant status | Raw filesystem access, recovery capsules or taking ownership of Kernel persistence |

The existing Rust command handlers orchestrate save/recovery; they are not all
thin forwarding adapters. These logical ownership labels do not move code or
create new services.

## Verification boundaries

Existing tests cover the following, without establishing all crash guarantees:

| Test | Covered behavior |
| --- | --- |
| `physical_save_close_and_reopen_preserves_the_business_document` | Physical save/read, acknowledgment, document/notation preservation and cleared history |
| `export_import_round_trip_resets_history_and_invalid_import_is_atomic` | Lossless round trip and rejection before replacing a live session |
| `atomic_write_replaces_existing_file_without_leaving_temp_files` | Normal replacement and temporary-file cleanup |
| `recovery_writer_coalesces_latest_document_and_cancels_pending_writes` | Queue coalescing, flush and cancellation |
| `corrupt_recovery_is_quarantined_without_deleting_its_bytes` | Quarantine preserves corrupt bytes |
| `a_fresh_app_state_recovers_the_previous_process_document` | Explicit flush followed by a second AppState in the same test process |
| `history_undo_redo_branch_and_delayed_persisted_identity_are_exact` | Kernel same-session delayed acknowledgment and dirty identity |

The AppState test does not kill a process or simulate power loss. Normal
replacement tests are not a write/flush/replace fault-injection matrix. Test
names identify coverage, not fresh passing results; B8 execution evidence is
recorded in `docs/integration/2026-09-21-B8-baseline-gates.md`.

Stronger product qualification still includes save/session-replacement races,
failure at write/flush/replace, abandoned temporary files, recovery generation
selection, platform sync/error reporting, exact opaque payload preservation,
invalid-input rejection and independence from checkpoint retention. In
particular, the replace-to-directory-sync crash window belongs to the file
layer, not Kernel.

For this integration, a shared development baseline requires reproducible
environment setup, applicable regression checks and real application startup
smoke evidence. That acceptance does not claim release-level crash durability,
formal performance, multi-platform qualification, packaging or signing.
Those separate qualifications must not be silently treated as completed, or
expanded into an unbounded prerequisite for resuming ordinary development.

## Decisions before new persistence contracts

Exact session continuity would require a versioned durable contract for
document version, undo/redo payloads, cursor, clean identity and event sequence.
Snapshot-plus-tail, stable-delta WAL or a Kernel recovery capsule are possible
future designs, not accepted implementations.

Acknowledged-command durability would require a durability point before
releasing success, with changed latency, retry/idempotency and error semantics.
It is a separate product and cross-layer decision.

Before either extension, obtain explicit decisions about:

1. Document-only recovery versus full undo/redo continuity.
2. In-memory commit acknowledgment versus durability across process loss.
3. Durable representation, compatibility, migration, integrity and resource limits.
4. Frozen plugin roster, module versions and Wasm artifact identity for replay.
5. Revision/event continuity versus a fresh revision-zero recovered session.

Until then, reuse the existing document-only path. Do not serialize private
checkpoint/history structures as a new public format or implement a second
persistence stack.

## Source evidence

Reviewed source paths:

- `crates/brilliant-kernel-runtime/src/checkpoint.rs`
- `crates/brilliant-kernel-runtime/src/runtime.rs`
- `crates/brilliant-kernel-runtime/src/session_projection.rs`
- `crates/brilliant-kernel-contracts/src/session.rs`
- `crates/brilliant-kernel-session/src/session.rs`
- `crates/brilliant-score-foundation/src/codec.rs`
- `apps/desktop/src-tauri/src/application/mod.rs`
- `apps/desktop/src-tauri/src/application/tests.rs`
- `apps/desktop/src-tauri/src/commands.rs`
- `apps/desktop/src-tauri/src/document_io.rs`
- `apps/desktop/src-tauri/src/state.rs`
- `apps/desktop/src-tauri/src/lib.rs`

Original correction and historical inventory remain at source commit
`3a7d87074d0a833576bd7e908ce26a249682c38c` under
`docs/integration/2026-09-21-kernel-boundary-correction.md` and
`docs/integration/2026-09-21-kernel-boundary-evidence.json`.
Those historical inventory files are not copied into the current candidate as
fresh status. B8 records this selective integration and its actual checks.
