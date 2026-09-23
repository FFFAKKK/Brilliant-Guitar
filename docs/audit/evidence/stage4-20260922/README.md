# Stage 4 Cross-Host Evidence

Date: 2026-09-22. Production baseline:
`eae40757681a3aa6810ee63ac70ea8f880687994`.
Branch: `codex/audit-close-save-recovery-stage1`.

These are characterization tests: passing confirms existing defects, not repairs.
No production implementation, capability configuration or business test is changed.
The tests do not use real documents, credentials, providers, network services or GUI.

## Run

From this audit worktree, using its installed dependencies and Rust 1.97.1:

```powershell
$env:Path = 'C:\Users\ATOM\.cargo\bin;' + $env:Path
node docs/audit/evidence/stage4-20260922/run.mjs
```

The PATH change is process-local. Cargo must be installed; the runner does not
download dependencies. Cargo is invoked with `--locked --offline`. The existing
stage-1 audit crate gains one test target and reuses its unchanged lock and cache.
No second audit crate or dependency lock is introduced.

Each run creates a fresh directory below `.local-evidence/coordinator-stage4/`.
It records the source HEAD, production baseline, evidence file SHA-256 values,
command status, stdout/stderr, shared request results and actual Rust projection.
The source HEAD can predate uncommitted audit files; their recorded hashes identify
the tested evidence inputs. Generated results are local, ignored files, not staged.
The runner requires the audit branch and unchanged tracked production directories.

Expected baseline results: Rust **2 passed, 18 filtered out**; Node **17 passed**.

## Coverage

- `edit-cases.json` supplies ten requests: two supported controls and eight actions
  absent from the Desktop enum. The real Rust DTO deserializes every request. Node
  validates and sends the same request through the production ScoreEditClient and
  TauriWorkbenchHostBridge, then compares it with the Rust input and result.
- `contracts.rs` imports unchanged Rust modules. It creates a synthetic document,
  inserts an author in the exported fixture, imports it through ScoreSessionService,
  reads both projections and exports again. The author survives in metadata and
  the document, but is absent from the serialized session. Node validates that
  actual session using the production frontend guard.
- Four cases call the production workspace-ID resolver with injected memory stores,
  including healthy storage and failures in repeated writes or legacy reads.
- Two cases bundle the real plugin composition root into memory with installed
  rolldown. A fresh VM instance shares only the synthetic storage map, allowing a
  startup/enable/next-startup comparison in Desktop and Browser modes. The CJS
  function scope keeps bundled function names separate from the isTauri global.
  React is loaded from the existing installation; no component is rendered. The
  IPC boundary is an in-memory recorder that rejects any invocation, and the tests
  also assert that no IPC was invoked.

## Limits

There is no actual WebView, native IPC dispatch, file picker, application restart,
ACL validation or provider call. The fresh VM represents module reinitialization,
not an OS process restart. Frontend edit responses are injected; these tests do
not claim successful edits or successful command execution for the controls.
The imported 18 Rust tests compile but are not run by the `audit_` filter.

The UI's empty-author fallback is inspected in production source, not rendered
in this harness. No real user file is modified or asserted lost.

During implementation, the harness needed a missing document_io module import,
Windows file-URL conversion for dynamic imports, and manifest.id when looking up
plugin records. These harness corrections are not additional product defects.

When production behavior is repaired, migrate the relevant expectations into
normal cross-host regression tests and invert the defect assertions. Do not keep
duplicated test assembly or compatibility layers solely to satisfy this baseline.
