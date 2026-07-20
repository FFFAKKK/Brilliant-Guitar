# Core Kernel Guidelines

> **Current staged workflow (2026-07-20):** K1-1 through K1-4 are accepted and archived.
> K1-5 implementation candidate `51fa2177cbd25dea53f1ebaf23bd8b8426471589` is complete with 161/161 tests passing and awaits independent acceptance. K1-6 remains blocked.

For changes that consume the accepted kernel, read `backend/score-document-model.md`, `backend/command-transaction.md`, `backend/snapshot-events.md`, `backend/registry-capability.md`, `backend/errors-reports.md`, and all staged boundary/diagnostic/quality guides. K1-1 through K1-4 contracts are frozen. The K1-5 candidate adds internal error families, public issue/report data, validation reports, and in-memory current-schema migration compatibility. Physical `.bgp` packaging, manifest, file IO, real legacy migration steps, Guitar Domain, UI, playback, and layout remain later work.

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
