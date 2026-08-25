# RKP-2 Part Owner Wire Contract Repair — Implementation Evidence

## Candidate identity

- Accepted planning head: `ee1af9409b4140d322c88389a4c1df1368655a31`
- R0 activation: `dd6f92759e0254742fd4bf2761fe0d020ec4d3aa`
- R1 Foundation fix: `4510fd95f406acc109cad8f120a0050a0e678c2e`
- R2 Contracts/native/governance and exact technical head: `738f746085a2b3f9e3e5520523cf5356b6f6f576`
- R3 evidence/candidate freeze: this docs-only HEAD; report its exact hash after commit.
- Review state: `implementation_candidate_ready=true`, `implementation_review=pending`.

No independent implementation PASS, acceptance, archive, integration, RKP-2 S6.1 resume, push, default cutover, qualification or RKP-3 is claimed.

## Implemented contract

`ExtensionOwnerV1::Part` retains the private Rust identifier `part_id` and adds only `#[serde(rename = "partId")]`. The enum retains its internally tagged kebab-case representation and `deny_unknown_fields`; there is no alias, custom deserializer or Score variant change.

Foundation directly proves exact Score normal encode/decode, exact Part `partId` encode/decode, and rejection of Part `part_id`, dual spelling and other Part extras. Contracts and TypeScript remain the public exact-shape owners for Score extras. Contracts preserves the existing `codec.invalid-shape` code/path/violation bytes. Native create/read preserves ordered unknown score/Part blocks, nested payloads, repeated detached reads and emits only `partId`; malformed owners publish payload only and zero handle.

## Exact changed-path proof

The accepted planning head through technical head changes exactly thirteen paths: the six frozen technical paths plus seven activation/parent lifecycle projections. R3 adds only the already-authorized implementation-evidence and lifecycle projection paths. RKP-2 `implement.jsonl` and `check.jsonl`, Runtime/Session/Node production, `src/**`, Cargo/toolchain/rustfmt, package/tsconfig, active specs and unrelated tests remain unchanged.

## Verification

All heavy gates ran at exact technical head `738f746...` in an independent `core.autocrlf=false` clean clone.

- Rust 1.97.1: `fmt --check`, workspace all-target `check`, workspace all-target `test` and workspace all-target `clippy -- -D warnings` pass. Tests: `73/73` (`Foundation 18/18`, `Contracts 16/16`).
- Rust 1.88.0: workspace all-target locked check passes.
- TypeScript: `typecheck` and clean-clone `build` pass.
- Windows native: pinned Node crate builds; deterministic `brilliant_kernel_node.dll` to `target/rkp-1-node/brilliant_kernel_node.node` copy loads through the existing suite. Exact Node exports remain two.
- Node 24.15.0 and 20.20.2 focused `--expose-gc`: RKP-1 bridge `9/9`, RKP-2 parity `6/6`, workspace-law `8/8`; combined `23/23` on each version.
- Dynamic full runner on both Node versions: `78` files, manifest SHA-256 `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, `579` discovered, `578` pass, `1` expected GC skip, `0` fail.
- Public invariants: Node exports `2`, StableFailureV1 `22`, TypeScript `28/51/8/34/9`, schema `brilliant-score-1`, TypeScript default — unchanged.
- Trellis: child `14/14`, RKP-2 `25/20`, Rust parent `18/19` validate.
- JSON/JSONL parse, path existence/uniqueness, exact parent reference, Markdown fences, `git diff --check`, literal allowlist and protected-delta checks pass.

The original RKP-2 implementation worktree remains at S6.0 commit `ce673a2ad62348fa73458d493a45f9c005bf0288`, clean and unmodified. Stage 6 remains operationally paused before S6.1.

## Independent audit focus

1. Confirm the serde rename is bidirectional and no `part_id` alias or custom deserializer exists.
2. Confirm Foundation does not claim Score-extra closure and Contracts/TypeScript remain the public strict-shape owners.
3. Reproduce exact failure paths/bytes and zero-handle publication for snake, dual, Part-extra and Score-extra owners.
4. Reproduce ordered unknown score+Part extension round-trip, canonical repeated reads and zero snake_case output through the real addon.
5. Verify accepted planning head anchoring, exact six technical paths, lifecycle-only R3 delta and all protected/public zero-drift claims.
