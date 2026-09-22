# Development Environment Acceptance

The 2026-09-22 user-authorized [audit-baseline decision](integration/2026-09-22-unified-audit-baseline.md)
allows main migration before successful native smoke acceptance. The tools,
isolation rules and checks below still apply; known failures must be reported.
This exception establishes a common audit source, not an accepted product release.

This is the Windows x64 development-baseline profile, not a cross-platform
release, signing, installer, power-loss or performance qualification.
Each task uses its own checkout, writable dependencies, outputs and runtime data.
The coordinator publishes a full approved base SHA; a branch name is not a baseline.
Do not upgrade tools or change lockfiles to bypass a failed check.

## Tools And Dependencies

- Node `v24.15.0`, npm `11.12.1`, PowerShell (`pwsh`) `7.6.5`.
- Rust/Cargo `1.97.1`, host `x86_64-pc-windows-msvc`, rustfmt and Clippy.
- Working Windows MSVC/SDK and WebView2 installations are also required.
  Actual builds and GUI startup must verify them; the preflight does not certify
  all host-level compiler, SDK or WebView2 versions.
- Root, Workbench and Desktop have separate lockfiles and `node_modules`.
  Root TypeScript `5.9.3` and Workbench TypeScript `7.0.2` remain distinct.
- A complete Git object database is required for historical contract tests.
  Shallow clones and source archives are not equivalent.

Run in the task's checkout:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm --prefix apps/workbench ci --offline --ignore-scripts --no-audit --no-fund
npm --prefix apps/desktop ci --offline --ignore-scripts --no-audit --no-fund
```

An offline cache miss is a failed prerequisite, not permission to change versions.
Download caches and installed tools may be shared; writable `node_modules`,
`target`, ports, configs and recovery files may not.

## Preflight And Builds

Commit only reviewed changes before building. Replace `<full-SHA>` with the
coordinator's actual approved base. The scripts require a clean checkout and
reject hidden index flags, linked input/output paths, unexplained build overrides
and Cargo configuration overrides in the checked build locations.

```powershell
node scripts/development-environment.mjs --check-tools --base <full-SHA>
node scripts/development-environment.mjs --prepare-addons --base <full-SHA>
node scripts/development-environment.mjs --prepare-desktop --base <full-SHA>
node scripts/development-environment.mjs --check --base <full-SHA>
```

The preflight checks installed package metadata against all three locks, not
every byte of installed dependencies. Always start with the locked installation.
Historical-object preflight verifies availability; the full suite verifies content.
These are reproducible acceptance steps, not a claim of hermetic or bit-for-bit builds.

Each addon variant gets its own `target/development-build/<variant>`.
Content-addressed outputs live in `target/development-artifacts`; manifests in
`target/development-environment` record actual commit/tree, tracked input hash,
worktree, tools, command, platform, output size and SHA-256. Builders check source
state before and after building. A local exclusive lock rejects concurrent builders.
Do not remove someone else's build lock or overwrite manifests to clear a failure.

The three existing default addon paths are published within this checkout only.
Previous addon bytes are retained before replacement. The integrated compatibility
manifest also includes provenance. The older `test:kernel-commercial` entry remains
unchanged for compatibility; running it does not replace this profile's acceptance
and may require rebuilding through the commands above.

Documentation-only descendants can reuse an artifact if all recorded build inputs
and tools match. Changing inputs, the default addon, ownership or hash fails.
An artifact from another worktree must not be relabeled as locally built.

## Validation And Isolated Startup

```powershell
npm run typecheck
npm test
npm --prefix apps/workbench run typecheck
npm --prefix apps/workbench test
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test --workspace --all-features --locked --offline --target-dir target
cargo +1.97.1 clippy --workspace --all-targets --all-features --locked --offline --target-dir target -- -D warnings
cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --offline --target-dir target/desktop-formal
node scripts/development-environment.mjs --prepare-smoke --base <full-SHA>
```

Use the smoke manifest's executable for GUI acceptance. Its separately built
Tauri config changes only the application identifier and window title, isolating
application/WebView data from the user's normal installation. Do not enable a
provider or open a real user project. Verify startup and a scratch-document flow,
then close the launched application. This is not a claim that the production
executable was run under the user's normal application identity.

Record exact SHA, commands, exit codes, counts, artifact manifests, GUI observations
and skipped/failed checks. Re-run the environment check and inspect Git status after
validation. A candidate's passing report does not certify `main`.

After approved migration, install, build, run the same gates and perform isolated
startup again in the original `main` checkout. Publish a shared development base
only after that verification; retain the old branches, byte backups and receipts.
