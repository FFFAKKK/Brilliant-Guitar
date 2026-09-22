# Stage 2 Host And Close Evidence

Production baseline: `eae40757681a3aa6810ee63ac70ea8f880687994`.
Audit starting commit: `a25acfc67c8744510c31ac3ddd056ce48f9398f1`.
Date: 2026-09-22. Windows x64, Rust 1.97.1, Node v24.15.0.

Passing these characterization tests confirms baseline behavior, not repairs.
Production source, dependencies and configuration remain unchanged.

## Run

From this audit worktree's root:

```powershell
C:/Users/ATOM/.cargo/bin/cargo.exe +1.97.1 test --manifest-path docs/audit/evidence/stage2-20260922/Cargo.toml --locked --offline --target-dir .local-evidence/coordinator-stage2/target --test host audit_ -- --nocapture --test-threads=1
node --experimental-strip-types --test docs/audit/evidence/stage2-20260922/sdk-close.test.mjs
C:/Users/ATOM/.cargo/bin/rustfmt.exe +1.97.1 --edition 2024 --config skip_children=true --check docs/audit/evidence/stage2-20260922/host.rs docs/audit/evidence/stage2-20260922/build.rs
```

Rust: **6 passed, 0 failed, 66 filtered out, exit 0**.
SDK: **4 passed, 0 failed, exit 0**.
Both reruns produced the same counts; the focused rustfmt check exited 0.
Keep the `audit_` filter: unrelated imported production tests are not included in
this stage. No external provider or system credential operation is needed.

## Rust Coverage

`host.rs` loads production modules without changing their implementation.
Five cases use Tauri MockRuntime only for managed State; AppState, commands,
Mutex, RecoveryManager and filesystem behavior remain real. The Windows-only
sixth case uses Wry AppHandle for the save command and a hidden native window.
Rust command functions are called directly, not through generated IPC handlers.

| Case | Observed result |
| --- | --- |
| Absent workspace close | Returns false, not an error |
| Create with unavailable recovery directory | Succeeds without a recovery copy; empty flush succeeds |
| Import with unavailable recovery directory | Replaces session; same silent recovery failure |
| Close recovery removal fails | Session remains; retry succeeds after removing fixture blocker |
| Another workspace has failed recovery writes | Closing an unaffected workspace fails at global flush |
| Native save and hidden-window lifecycle | File commits before cleanup error; retry succeeds; vetoed close leaves window alive; destroy produces Destroyed |

Fixtures and build outputs stay under `.local-evidence/coordinator-stage2/`.
AppState uses its existing memory credential backend. File removals affect only
test-created files or empty test directories. No recursive cleanup is performed.
The hidden window has no WebView and uses a distinct audit application identity.

## SDK Coverage

The Node test uses the installed Tauri SDK and production bridge with official
IPC mocks. It awaits the SDK's actual registered event callback so a destroy
rejection is observable; the real event transport does not provide that await.

Cases cover guard veto, guard bypass after rejected close, close completion
before separately delivered destroy failure, and backend false followed by
window close. Native IPC/ACL are injected here, not tested on an actual WebView.

## Build Differences

- The isolated harness enables Tauri `test` and `unstable`. The latter exposes
  WindowBuilder without creating a WebView.
- `build.rs` embeds only the Common Controls v6 dependency normally supplied by
  tauri-build. Without it this independent EXE failed before entering tests with
  `0xc0000139`. This does not alter system libraries or product build settings.
- The audit lock was seeded from the product Desktop lock. Package versions
  remain the same apart from the local root package replacement; dependency
  edges from `quinn-udp` and `rustls-platform-verifier` select the already
  present windows-sys 0.61.2 instead of 0.59.0. This is not an identical release
  dependency graph.
- The initial manifest mistakenly pinned dialog to its declared lower bound
  2.7.0. It was corrected to the product's actually locked 2.7.3; nothing was
  downloaded and the production lock was not modified.

## Not Covered

Full product GUI/WebView, IPC serialization and scheduling, actual ACL rejection,
native Open/Save As dialogs, save/replace races through real commands, power loss,
cross-platform acceptance, or the complete production regression suite.
