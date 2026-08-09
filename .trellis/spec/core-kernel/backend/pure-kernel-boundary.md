# Pure Core Kernel Boundary

> **Authoritative staged boundary (2026-07-29):** K1-1 through K1-6 are independently accepted, the Core V1 qualification gate is archived, and Pure Core Kernel V1 is closed.
> **GD-0 lifecycle:** ACCEPTED DOCUMENTATION / ARCHITECTURE CONTRACT; RUNTIME SEPARATELY GATED.
> **Core VNext accepted prerequisites (2026-08-10):** CVN-0, CVN-1, CVN-3, CVN-4 and the extensibility reservation gate are accepted and archived; current normalized-HEAD verification is 312/312.

## Closed Pure Core Kernel V1 Baseline

Pure Core Kernel V1 consists only of the accepted K1-1 through K1-6 contracts:

- K1-1: `ScoreDocument`, exact musical time and written pitch, strict decode, semantic validation, feature support, and lossless `ExtensionBlock` preservation.
- K1-2: the closed six-command write boundary, atomic transactions, document version, history, undo/redo, and deterministic replay.
- K1-3: stable addresses and ranges, immutable snapshots and selectors, checkpoint/dirty state, and deterministic committed/session events.
- K1-4: the startup-frozen Registry, immutable compiled contribution tables, capabilities, and module gateway.
- K1-5: data-only issue/report adapters, validation and current-schema migration reports, privacy boundaries, and detached current-schema migration compatibility.
- K1-6: cross-contract integration evidence. Its accepted flow passed 8/8 focused and 169/169 full tests without changing the K1-1 through K1-5 production contracts.

The archived Core V1 qualification gate recorded 25 covered contract groups, zero coverage gaps, and zero reproducible bugs. Its sole nonblocking P3 disposition required public `unknown` guards to be descriptor-first, no-getter, and no-throw. Accepted and archived CVN-0 satisfies that prerequisite while retaining the Core V1 public compatibility surface.

## Frozen Core-Only Contract

Core-only construction, exports, persisted `brilliant-score-1` meaning, command/result unions, history and replay behavior, snapshots/selectors/checkpoints, event ordering, Registry/capability behavior, Issue/Report contracts, and migration compatibility are frozen at the accepted Core V1 baseline. An additive integration may consume these contracts but does not rename, widen, or reinterpret them.

Pure Core remains a platform-neutral TypeScript library with no Guitar imports, UI, DOM, rendering, audio, physical package/file IO, dynamic plugin lifecycle, or generic external document-mutation capability. `ScoreDocument` remains the only score truth, `ExtensionBlock` remains an opaque persistence envelope at the Core boundary, and `CommandBus` remains the sole document/version/history owner.

## CVN-0 Public Unknown-Guard Contract

The accepted implementation preserves the public names and type-predicate signatures of `isJsonValue`, `isWrittenPitch`, and `isTransposition` while tightening hostile runtime shapes to one consistent contract:

- exact plain or null-prototype records and Realm-independent exact dense arrays with a descriptor-verified ordinary Realm Array prototype are inspected through own data descriptors;
- accessors, symbol/custom fields, sparse arrays, invalid prototypes, revoked Proxies, and failing reflection traps return `false` without leaking an exception;
- ordinary Proxy `get` traps and input getters execute zero times;
- each public predicate contains its complete execution path in a total exception boundary, captures every later-used reflection/Array/Set/Number primitive, and rejects throwing or forged-return replacement after reflection;
- `isJsonValue` uses call-local tri-color traversal: `activePath` rejects cycles and `completed` makes shared acyclic graphs linear in their unique containers, while adding no V1 depth/property cap or cross-call cache;
- Array-branded instances installed as custom prototypes, real Realm Array/Object prototypes with an own `toJSON`, replaced Object-prototype parents, and structurally linked user-constructor/prototype pairs are rejected through the native constructor back-reference, null-rooted parent-chain, and JSON-serialization checks; unrelated Array method descriptors such as `values` are outside the JsonValue contract and are not fingerprinted;
- `src/core-kernel/domain/strict-data.ts` remains a domain-private helper and is absent from the Core root export surface.

The accepted CVN-0 implementation changes no command, history, replay, event, Registry, report, migration, persisted schema, package, or dependency contract. Its archived baseline is the fixed hostile-input prerequisite for every later Core VNext gate.

## GD-0 Accepted Additive Documentation Contract

GD-0 is an accepted additive documentation/architecture contract, not an implemented runtime baseline. It defines the minimum behavior required for official domain contributions to join the existing transaction owner while leaving every Core-only path unchanged. Its authority is `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/` together with `domain-transaction-integration.md` and its recorded acceptance review.

The candidate requires exact `ExtensionBlock.schemaVersion` compatibility negotiation, explicit complete/incomplete domain-validation availability, lossless read-only degradation for missing or incompatible required contributions, and stable integrated public signatures/discriminants. Legacy ownership is mapped once: CK1.1-0 → accepted CVN-0; CK1.1-1 → CVN-2; generic GD-2 → accepted CVN-1 plus CVN-6/CVN-5; Guitar-owned GD-1/GD-3/GD-4 → post-CVN-7. Pending gates remain inactive and require separate plans and acceptance.

Every active Core-only type must map to an accepted K1-1 through K1-6 contract. Every additive integrated type must map to the GD-0 review candidate and still requires separately accepted production implementation. Retired boundary drafts live only under `.trellis/archive/core-kernel/`.
