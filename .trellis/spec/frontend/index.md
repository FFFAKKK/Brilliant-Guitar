# Reserved Frontend Guidelines

> This layer is reserved for future React/Tauri workbench implementation.

---

## Status

Reserved. Do not use this layer for `Pure Core Kernel V1`.

Current implementation must first complete the pure TypeScript Core Kernel using:

- `../core-kernel/index.md`
- `../core-kernel/backend/index.md`

---

## When This Layer Becomes Active

Fill this layer after Pure Core Kernel V1 passes and the user explicitly approves the next stage for desktop shell, React workbench, editor session service, layout, rendering, playback, persistence, or export UI.

Until then, this layer intentionally contains no active frontend coding rules.

## Narrow Contracts for Authorized UI Tasks

The user has separately authorized work on the backup UI. The following contracts apply only to that work, without changing Pure Core Kernel scope:

- [Shared notation rendering contract](notation-rendering-contract.md) — complete SVG adoption, font inheritance, same-render geometry, and browser verification.
- [Backup UI plugin runtime contract](ui-plugin-runtime-contract.md) — one platform registration path, application-level required view slots, and host-owned zoom.
- [Backup plugin startup storage contract](plugin-startup-storage-contract.md) — synchronous/async draft lifecycle, existing Tauri settings IPC, namespaced merge, and disposed-result isolation.
- [Backup desktop bootstrap contract](backup-desktop-bootstrap-contract.md) — accepted static shell packaging, isolated Tauri flavor, explicit plugin protocol boundary, and native verification limits.
- [Backup frame icon contract](frame-icon-contract.md) — one SVG envelope, explicit style ownership, and browser alignment verification.
- [Backup frame style validation contract](frame-style-validation-contract.md) — shell preservation after component stylesheet extraction, current entry loading, and immutable historical evidence.
- [Backup layout motion definition contract](frame-motion-definition-contract.md) — review-only author-owned definitions, bounded execution, static optional fallback and immutable visual regression evidence.
- [Agent Plugin decision contract](agent-plugin-contract.md) — one Controller execution chain for first-party and external Agent plugins.
- [External Agent Protocol v1](external-agent-protocol-contract.md) — isolated JSON decision adapter, bounded schema, negotiated limits and host-owned cancellation.
- [Standalone Agent contract](../backend/standalone-agent-contract.md) — independent UI, authoritative Session snapshots, model configuration and process-memory credentials.
