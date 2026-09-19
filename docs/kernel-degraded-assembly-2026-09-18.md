# Kernel degraded dependency assembly — 2026-09-18

## Decision

An installed consumer may declare a read dependency on a provider that is known
to the authenticated host inventory but is temporarily not installed. The kernel
can now assemble that document in a safe read-only mode instead of rejecting the
catalog or executing the consumer with incomplete data.

This is a microkernel recovery contract. It does not discover packages, infer a
provider from an extension namespace, install plugins or choose product UI.

## Product behavior

| Provider state | Open/read | Consumer callbacks | Write | Detached migration |
| --- | --- | --- | --- | --- |
| Installed and schema-compatible | Complete | Normal validation, classification, preparation and transformation | Normal | Normal |
| Known in explicit inventory, not installed | Read-only; opaque extension data is retained | Skipped | `command.required-contribution-unavailable` before command decoding | `migration.contribution-contract-violation` before consumer execution |
| Unknown to installed catalog and explicit inventory | No catalog publication | None | None | None |
| Installed with an incompatible schema in the requested scope | Read-only/incomplete | Skipped | Existing compatibility rejection | Contract violation |

Restoring the provider returns to the ordinary complete validation path. The
degraded session does not invent a second document format or mutate the stored
extension blocks.

## Contract and implementation

`compileContributionReadCatalogV1` keeps its two-argument form and adds a
three-argument overload whose final value is an exact `inventoryVersion: 1`
inventory. The compiler authenticates the absent provider's module identity,
contribution identity, namespace and complete schema-version set. Installed
owners must still match that inventory exactly.

The TypeScript integrated runtime and the Rust integrated assessment engine both
exclude a consumer when any declared provider is unavailable. Availability is
still computed from the real assembly, so the session publishes the existing
required-contribution facts and remains read-only. TS and Native migration paths
check the same condition before decode/prepare callbacks.

The design deliberately keeps the dependency declaration as host authorization.
A guest cannot add a read grant, use a namespace string as authority, gain the
provider's commands/effects or change callback scheduling.

## Verification

- Full Node/Native suite: 905 tests, 903 passed, 2 designed skips, 0 failed.
- Full Rust workspace with all features: 642 passed, 1 ignored, 0 failed.
- Focused cross-plugin TS/Native suite: 9 passed, including degraded reopen and
  migration rejection in both execution modes.
- Focused Rust declaration decoder: 1 passed, proving a known absent provider is
  accepted while an unknown namespace remains rejected.
- `npx tsc -p tsconfig.json --noEmit`, `cargo fmt --all -- --check`, strict
  workspace Clippy and `git diff --check` passed.

The two Node skips are intentional environment gates: the FinalizationRegistry
journey needs Node to start with exposed GC, and the Stage 6 E2 scale journey
needs explicit stress authorization.

The verified Native artifact is
`target/integrated-degraded-next/brilliant_kernel_node.node` (5,020,672 bytes,
SHA-256 `35583f2763d6629a6d847ed8cc84232167807301309aa7e5f25a4146405054db`).
Machine-readable evidence is in
`docs/evidence/kernel-degraded-assembly-2026-09-18.json`.

## Remaining commercial gates

This closes the identified missing-provider functional gap. It does not prove
commercial release readiness. Remaining gates are precise dependency closure and
incremental-equivalence evidence, whole-transaction CPU/memory qualification,
long-running soak/fuzz and recovery tests, p95/p99 product latency gates,
multi-platform CI/signing/packaging/upgrade compatibility, and the controlled
Rust-default cutover with retirement of the obsolete TS transaction engine.
