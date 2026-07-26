# Core Kernel Guidelines

> **Current staged workflow (2026-07-21):** K1-1 through K1-5 are accepted and archived.
> K1-6 test baseline `355512aba4a8057d2d75aa665d74df49cdd2e23c` passed 8/8 focused and 169/169 full tests and was independently accepted at review baseline `989c1f7a4056b14d3d59918c9b96874ad71591a8` on 2026-07-26. Pure Core Kernel V1 is formally closed; Guitar Domain and product implementation require separate planning and approval.

For changes that consume the accepted kernel, read `backend/score-document-model.md`, `backend/command-transaction.md`, `backend/snapshot-events.md`, `backend/registry-capability.md`, `backend/errors-reports.md`, `backend/integration-gate.md`, and all staged boundary/diagnostic/quality guides. K1-1 through K1-5 contracts are frozen. K1-6 adds integration evidence only and does not alter them. Physical `.bgp` packaging, manifest, file IO, real legacy migration steps, Guitar Domain, UI, playback, and layout remain later work.

The K1-1 data path is `unknown -> decode -> semantic validation -> ScoreFeatureProfile`. Unknown extension data must survive semantic round-trip.

> Entry point for Pure Core Kernel V1 development in this single-repo Trellis workspace.

---

## Scope

Use this layer when implementing or reviewing the pure TypeScript Core Kernel.

The detailed rules live under `backend/` because the kernel is a non-UI, non-desktop-shell, domain/backend layer even though the eventual product is a desktop app.

---

## Pre-Development Checklist

- [ ] Confirm the task is still scoped to `Pure Core Kernel V1 only`.
- [ ] Read [Backend Core Kernel Guidelines](./backend/index.md).
- [ ] Read the shared [Long-Term Maintenance Guide](../guides/long-term-maintenance-guide.md).
- [ ] Confirm the change does not introduce UI, Tauri, VexFlow, Web Audio, PDF/PNG, Guitar Pro, physical file IO, or third-party plugin runtime behavior.
- [ ] For tasks that expose editable writes, confirm the active K1-2 semantic command/transaction/history boundary.
- [ ] For tasks that expose public reads or committed notifications, confirm the approved K1-3 snapshot/selector/checkpoint/event boundary.

---

## Guidelines Index

| Guide | Purpose | Status |
|-------|---------|--------|
| [Backend Core Kernel Guidelines](./backend/index.md) | Pure kernel boundary, domain model, command system, communication, registry, errors, and quality checks | Stable |

---

## Quality Check

Before completing Core Kernel work, load `backend/index.md` and apply its full Quality Check section. Do not treat this top-level entry as a substitute for the detailed backend rules.
