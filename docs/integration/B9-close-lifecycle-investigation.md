# B9 Desktop Close Investigation

Status: confirmed unresolved product-acceptance blocker.
On 2026-09-21 (Asia/Shanghai), the user explicitly authorized merging the
preserved integration result into main first, then starting an independent
audit on that common baseline. This supersedes the earlier main-promotion
hold, not the defect or its acceptance requirements. See
`2026-09-21-unified-audit-baseline.md`.
No close-lifecycle fix or permission change has been implemented.

## Exact Reproduction

- Candidate branch: `codex/integration-candidate-20260921`.
- Running source: `bf1d0da26b52709a803f67a60b3ea2c0fcced7a0`.
- Smoke executable: `target/development-artifacts/desktop-smoke-58cb40a05aa8d034924e81d27efcd5ea84db48fb526f727447c789699cb8efc1.exe`.
- Executable bytes: `20896256`.
- Executable SHA-256: `58cb40a05aa8d034924e81d27efcd5ea84db48fb526f727447c789699cb8efc1`.
- Isolated application identifier: `com.brilliantguitar.baseline.394f248dd4a84a58aa44b25c01ef097e`.
- Window title: `Brilliant Guitar Baseline Verification`.
- Only a default, unnamed, one-measure scratch score was used.
- No provider was enabled and no real user document was opened.

Observed through the real native window:

1. Startup and File > New became available after the tempo DTO fix.
2. Creating a default score dismissed the dialog, but all component slots stayed
   empty. This is a separate bootstrap snapshot problem, described below.
3. Clicking the native window close button left the application open and showed
   the generic safe-close failure message from `use-document-files.ts`.
4. File > New > Create then produced the document-identity conflict message
   from `ScoreSessionService::create`; the old frontend identity was no longer
   accepted by the backend. The test window remains open as evidence.

## Cause And Safety Consequences

`TauriWorkbenchHostBridge.closeNativeWindow` first invokes `workbench_close_v1`.
That Rust command flushes recovery, removes the recovery file, and removes the
session. Only afterwards does the bridge set `forceClosing = true` and invoke
the SDK's `Window.close()`.

The actual generated capabilities grant only `core:default` to window `main`.
The generated ACL's `core:window:default` includes neither `allow-close` nor
`allow-destroy`. The installed SDK sends `plugin:window|close`, and its
`onCloseRequested` listener invokes `destroy()` when the event is not prevented.
Thus both native-window commands used by this route lack permission. This is
the application's Tauri ACL, not the coding sandbox's Git approval problem.

The close rejection also leaves `forceClosing` true. A focused injected-rejection
run of the real bridge confirmed:

- Order: `workbench_close_v1`, then `window.close`.
- `closeNativeWindow` rejected.
- A subsequent close event bypassed the handler: `preventDefault` count was zero.

This was fault injection, not a captured native IPC error string. The native
observation, generated ACL, installed SDK, and source control flow agree.
No native IPC rejection payload was extracted from the running release WebView.

The result is a live window with stale frontend document state after backend
session/recovery disposal. No real-user data loss was observed in this scratch
test. However, the implementation does not preserve session/recovery state if
the final window operation fails, so a permissions-only patch is insufficient.

The existing close unit test stubs the window close call as always successful.
It does not exercise real ACL enforcement, SDK destroy, or final-close failure.

## Separate Pending Change

Two files move component capture from module evaluation to first composition mount:
`apps/workbench/src/workbench-app.tsx` and
`apps/workbench/test/plugin-platform-bootstrap.test.ts`.
Workbench tests passed 617/617 and type checks passed for those changes, but they
have not been packaged or GUI-verified at the time of this investigation.
The bootstrap tests were rerun (6/6), and both Workbench TypeScript configurations
passed during the 2026-09-21 handoff. The tests exercise registry/layout ordering,
not the mounted React component. These changes are not present in the running
`bf1d0da` executable and must not be described as GUI-accepted.

## Required Next Gate

Own this in Desktop/Workbench lifecycle integration, with the Score owner
reviewing session and recovery effects; do not change Kernel history or the
plugin activation architecture as part of this repair.

The repair must cover minimum scoped permissions, retaining usable session and
recovery state on close failure, restoring the close guard, and serializing
repeated requests. Verify cancel, failed save, successful save/close, rejected
window close, and repeated close in both focused tests and a rebuilt native app.
Report the repair separately after the unified-baseline audit. Do not force-kill
the test app as proof of success.

## Completed Checks Before The Redirect

- Committed tempo fix: `bf1d0da`; Desktop Rust 66/66 on that commit.
- Rust workspace tests, workspace fmt, and workspace Clippy: exit 0.
- Root suite on `bf1d0da`: 139 files, 932 passed, 2 skipped, 0 failed.
- Desktop release and isolated smoke builds on `bf1d0da`: exit 0.
- Environment `--check` on `bf1d0da`: passed; addon inputs remained unchanged,
  so their original `9cdea1a` provenance was retained rather than relabeled.
- Legacy preservation: 85 files, 1,006,766 bytes; sources, backups and restore
  copies matched; the four audited indexes were empty.
- Main remained `269112b2d85e01827e8cb81bdcc5b671afde4303`, with its original
  uncommitted work retained. No main merge or migration was performed.
