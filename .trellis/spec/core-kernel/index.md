# Core Kernel Guidelines

> **Current staged workflow (2026-07-13):** Each task implements one approved
> mechanism block. The full V1 roadmap is not a single-task checklist.

For K1-1, read `backend/score-document-model.md` plus the current staged boundary, diagnostics, registry, and quality guides. Retired drafts live only under `.trellis/archive/`. K1-1 does not implement commands, snapshots, registry/capability, general reports, migrations, Guitar Domain, UI, playback, or physical IO.

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
- [ ] For tasks that expose editable writes, confirm semantic command/transaction boundaries; K1-1 exposes no public writes.
- [ ] For tasks that expose public reads, confirm snapshot/selector boundaries; K1-1 exposes no read API.

---

## Guidelines Index

| Guide | Purpose | Status |
|-------|---------|--------|
| [Backend Core Kernel Guidelines](./backend/index.md) | Pure kernel boundary, domain model, command system, communication, registry, errors, and quality checks | Stable |

---

## Quality Check

Before completing Core Kernel work, load `backend/index.md` and apply its full Quality Check section. Do not treat this top-level entry as a substitute for the detailed backend rules.
