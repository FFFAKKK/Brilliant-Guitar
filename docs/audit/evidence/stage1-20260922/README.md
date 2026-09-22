# Stage 1 Production Evidence

Date: 2026-09-22. Production baseline:
`eae40757681a3aa6810ee63ac70ea8f880687994`.
Branch: `codex/audit-close-save-recovery-stage1`.

These are characterization tests. Passing confirms baseline behavior, including
defects; it does not certify a repair. No production source, configuration,
lockfile or existing business test was changed. These tests are not wired into
the production test suite.

## Rust Modules

`production.rs` imports unchanged production modules with `#[path]`. Its seven
audit cases cover snapshot/edit interleaving with physical `atomic_write`,
snapshot/replacement identity mismatch, import/save followed by recovery removal
failure, loss of failed pending writes on removal, and Kernel undo restoring a
clean history identity at a newer version.

The imported modules also run 18 existing unit tests. Both the first offline run
and the locked rerun passed: **25 passed, 0 failed, exit 0**.

From the audit worktree root, with the approved Rust 1.97.1 toolchain:

```powershell
C:/Users/ATOM/.cargo/bin/cargo.exe +1.97.1 test --manifest-path docs/audit/evidence/stage1-20260922/Cargo.toml --locked --offline --target-dir .local-evidence/coordinator-stage1/target --test production
C:/Users/ATOM/.cargo/bin/rustfmt.exe +1.97.1 --edition 2024 --config skip_children=true --check docs/audit/evidence/stage1-20260922/production.rs
```

The standalone harness has its own lockfile and target. New audit fixtures remain
under `.local-evidence/coordinator-stage1/fixtures/`; imported unit tests retain
their existing temporary-directory behavior. No real user document is used.
The only explicit directory deletion in the new tests removes a test-created
empty directory to release a synthetic failure condition.

These tests arrange interleaving directly. They do not execute Tauri commands,
AppState scheduling, native dialogs, GUI close or power-loss recovery.

## React Chain

`browser.ts` mounts the production `useDocumentFiles` with React/ReactDOM and a
real `WorkbenchClient` and `TauriWorkbenchHostBridge`. Only native IPC/window
boundaries are injected. No copy of the hook's decision logic is used.

Use this worktree's already installed, lock-matched Workbench dependencies:

```powershell
node apps/workbench/node_modules/typescript/bin/tsc --noEmit -p docs/audit/evidence/stage1-20260922/tsconfig.json
node docs/audit/evidence/stage1-20260922/serve.mjs
```

Run the server in an interactive terminal. Open
`http://127.0.0.1:5194/browser.html` in a test browser. The page runs the tests
and displays JSON. Reload to repeat; press Enter in the terminal to close the
server. Port 5194 is strict: do not terminate another process if it is occupied.
The server uses only loopback and an isolated cache, without production Vite
configuration, addon prebuilds, dependency downloads or provider requests.

Observed on Windows x64, Chromium UA `Chrome/153.0.0.0`:
**4 passed, 0 failed**, then the same result on reload. Typecheck: **exit 0**.

| Case | Observed baseline behavior |
| --- | --- |
| Save and Continue during an edit | New dialog opens while state is `unsaved`, current version 2, checkpoint 1 |
| Late receipt after replacement | Old document identity is reapplied to the hook |
| Open rejection after injected host commit | UI keeps old identity and displays the error |
| Save rejection after injected host commit | Checkpoint stays null and UI enters error state |

The first case stops at opening New; it does not actually replace a document.
The last two cases simulate host commit at the IPC boundary. Rust commit behavior
is tested separately above, not connected to this browser through real IPC.
The test page and its server were closed normally after verification.

## Remaining Gaps

- Native close request, SDK close/destroy and actual destruction ordering.
- Complete AppState/command/React failure and retry flows.
- Production full-suite rerun, native addon preparation and GUI acceptance.
- Crash/power-loss and cross-platform behavior.

The earlier self-written Node ordering models remain explanatory only and are
not included in these production-path counts. Earlier `.local-evidence` probes
are not part of this deliverable. Broader module audit and product repairs remain
separate stages.
