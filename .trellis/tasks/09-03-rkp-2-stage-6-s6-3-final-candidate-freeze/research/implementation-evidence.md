# S6.3 final candidate evidence

## Outcome

S6.3 repaired the post-archive executable governance and completed the RKP-2 Stage 6 implementation boundary. The final RKP-2 implementation candidate is ready for one direct read-only check; this record does not accept/archive RKP-2, qualify it, switch the default runtime, create RKP-3, or authorize push.

## Provenance and scope

- Planning base/tree: `51dbabd1e48dabb1333b011ee5446ed3f56b714f` / `e88cb454eef3486bc7f0e8155ab0d44d1c8ae21a`.
- Planning candidate/tree: `ca718569553ea4efeea05e4ee37a0e77171d1169` / `6ba7853d54911e7f87c186fdd5fcab385b327d68`.
- Activation: `e88e52ace1d41c097d1ddd8143814dfb69922dfc`.
- Technical repair HEAD/tree: `fb4febfd7e8c9f267b4fe91a2542e2bc0884e8f3` / `0f2a0101a6db58aa708870c91844a3e1dce4856f`.
- Technical change: only `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`; parent `design.md` received the matching `.gitattributes` allowlist declaration.
- Production Rust, production TypeScript, worker, scale fixture, process wrapper, package manifests, tsconfig, active specs, and public inventories: zero S6.3 delta.

## Consumed S6.2 evidence

- Reviewed candidate/tree: `c920f057bd19d3636e82de6b9c80dcde358488de` / `b6e07c4b127fb941d4eeac5e03ec1d2526996976`.
- Owner-acceptance commit: `e3518896d8ea184d79284d31111220bcaf7ebdae`.
- Native archive commit: `51dbabd1e48dabb1333b011ee5446ed3f56b714f`.
- Archive: exactly 12 regular non-symlink artifacts; active S6.2 root absent.
- Fresh sentinel SHA-256: `4cbcbf8705d9abcb1b1f51c7fa188573ac5879bd7c6617d13c59961ea191bb0c`.
- The strict decoder still proves the fixed 102,400-event counts, exact linear counters, entity/owner probes, parity, semantic and canonical round trip, topology ordering, extension preservation, exit 0, no timeout, positive RSS, successful reap/cleanup, and `partialEvidence=false`.
- S6.3 E3 execution count: `0`; the opt-in E3 variables were explicitly absent before the full Node run.

## Focused verification

- Workspace Law after repair: `11 total / 11 pass / 0 fail / 0 skipped`.
- The formerly failing global allowlist, accepted part-owner ancestry, and Stage 6 descendant-ownership tests all pass.
- Negative fixtures still reject active/archive dual authority, extra archive artifacts, malformed/duplicate/reused sentinels, partial evidence, wrong lifecycle gates, and undeclared S6.3 paths.

## Final complete gate

- Three Trellis context manifests: child `3/2`, RKP-2 `25/20`, Rust parent `18/19`; all valid and path-resolved.
- TypeScript `npm.cmd run typecheck`: exit `0`.
- Rust 1.97.1 `fmt --check`, workspace/all-targets/locked `check`, `test`, and `clippy -D warnings`: all exit `0`.
- Rust tests: `79 pass / 0 fail / 1 ignored`; the ignored test is the isolated opt-in scale journey.
- Rust 1.88.0 workspace/all-targets/locked `check`: exit `0`.
- `npm.cmd test`: exit `0`, exactly `611 total / 609 pass / 0 fail / 2 skipped`.
- Full-test manifest: exactly 80 files, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`.
- Built native addon used by the full run: 2,712,576 bytes, SHA-256 `bbdd1a199e68eb5926afc50af5b615640584274f5da3fa4d4b2b48066dcf4b91`.

## Remaining gate

The one direct read-only review checked exact candidate/tree `33af840e11a4235c36c8f936c3a1b20da76ce5d0` / `43e9fa04736529c519515232c239b5511881d217` and passed P0/P1/P2=`0/0/0`. The range from `51dbabd1` contains exactly 13 declared paths and zero production paths; its commit chain, S6.2 archive topology, sentinel, lifecycle projection, and later-gate exclusions are coherent. The review consumed the already recorded complete-gate evidence and did not rerun the full suite or E3.

There is no remaining technical implementation blocker. The next gate is an explicit owner decision on RKP-2 implementation acceptance and native archive. Qualification, default cutover, RKP-3, and push remain separate later decisions and are not authorized by this PASS.
