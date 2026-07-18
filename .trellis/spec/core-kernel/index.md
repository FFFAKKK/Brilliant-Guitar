# Core Kernel Guidelines

> **Current staged workflow (2026-07-18):** K1-1, K1-2, and K1-3 are accepted; the K1-4 implementation candidate is complete and awaits independent acceptance.
> K1-3 address/read/checkpoint/event contracts are fixed at code baseline `7369eeac60fecea66c2c9164c04439625c2d78b0` with 102/102 tests passing.

For changes that consume K1-3, read `backend/score-document-model.md`, `backend/command-transaction.md`, `backend/snapshot-events.md`, and all staged boundary/diagnostic/quality guides. K1-1 through K1-3 contracts are frozen. The K1-4 startup-only Registry implementation candidate completes all six approved tasks with 123/123 tests passing and awaits independent acceptance. General reports, migrations, Guitar Domain, UI, playback, layout, and physical IO remain later work.

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
