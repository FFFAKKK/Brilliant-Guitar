# Core Kernel Guidelines

> **Current staged workflow (2026-07-21):** K1-1 through K1-5 are accepted and archived.
> K1-6 implementation candidate `3dffa71c44d0eacb81d391714b855799f9e5cae9` passes 8/8 focused and 169/169 full tests. Independent acceptance is pending; Pure Core Kernel V1 is not formally closed, and Guitar Domain/product implementation remain unauthorized.

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
