# RKP-2 Stage 6 S6.2 Fresh Evidence Consumption — E4 Candidate Freeze

## Verdict and boundary

`READY FOR FRESH READ-ONLY S6.2 IMPLEMENTATION AUDIT`.

This is diagnostic evidence for the existing private Rust `LiveScoreStore`
scale path. It is not S6.2 acceptance or completion, S6.3, product
qualification, a default-runtime cutover, archive, integration, RKP-3, or
push authority.

- `fresh_request_generated=true`
- `archived_result_reused=false`
- `partialEvidence=false`
- E3 execution count: exactly `1`.

## Frozen source and provenance

- Activation commit/tree: `b2648d9fd7c0f9b96fb87a954483174c521e79f0` /
  `ba3bb8c71fbef441465a1c89e6ef7ae54546ae23`.
- Implementation source HEAD/tree:
  `bebe0f7c7494bc47e3ff8ad3dad74599af794787` /
  `75f2fa5940fa7f6330811a9a80934fa7bdc4a30b`.
- E3 evidence source HEAD/tree: the same exact source commit and tree above.
- Source commit subject: `test(rkp-2): rebuild S6.2 evidence source`.
- The evidence file was absent and the worktree/index were clean at that
  source. No tracked technical byte changed after it.
- The stopped `c3c4d198...` attempt supplied no commit, request, output,
  sentinel, or lifecycle state to this run.

## Toolchain and host context

| Item | Exact value |
| --- | --- |
| Cargo | `cargo 1.97.1 (c980f4866 2026-06-30)` |
| Rust | `rustc 1.97.1 (8bab26f4f 2026-07-14)` |
| MSRV Cargo | `cargo 1.88.0 (873a06493 2025-05-10)` |
| MSRV Rust | `rustc 1.88.0 (6b00bc388 2025-06-23)` |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| PowerShell | `7.6.4` |
| OS | `Microsoft Windows NT 10.0.26200.0`, x64 process on x64 OS |
| Cargo executable | `C:\Users\ATOM\.cargo\bin\cargo.exe` |
| Cargo target | `E:\desktop\brilliant_ideas\brilliant_guitar\.cargo-target\rkp2-s6-2-fresh` |
| TEMP/TMP | `E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-s6-2-fresh` |

## Planning and implementation hash maps

| Path | Planning SHA-256 | Implementation SHA-256 |
| --- | --- | --- |
| `crates/brilliant-kernel-runtime/src/indices.rs` | `3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7` | `3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7` |
| `test/core-kernel/fixtures/cvn-7-qualification-score.ts` | `5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc` | `5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts` | `ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f` | `909624a8a32807d0f4103bb4f61524dc7dc538f0c2c0a4fedd5e3eaf4533cd1c` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts` | `72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2` | `222bf43058ee06a2411029531f8ca3ee55f5437c3f8c78b7e7869d8a57110fbe` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1` | `d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f` | `d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f` |

Only the worker and worker-test hashes changed. The Runtime indices, fixture,
and PowerShell owner remained byte-identical.

## E1 and E2 gates

- TypeScript typecheck/build: exit `0` / `0`.
- Focused Workspace Law: exit `1`, exactly `11 total / 8 pass / 3 fail /
  0 skipped`; the three failures are the inherited `.gitattributes`, accepted
  part-owner source, and Stage 6 historical allowlist governance titles.
- Full runner: exit `1`, exactly `611 total / 606 pass / 3 fail / 2 skipped`.
- Full-test manifest: exactly `80` files, SHA-256
  `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`.
- Rust 1.97.1 fmt/check/test/clippy: all exit `0`; workspace tests are
  `79 pass / 0 fail / 1 ignored`, where the one ignored test is the isolated
  scale journey.
- Rust 1.88.0 workspace/all-targets/locked check: exit `0`.
- RKP-1 bridge smoke: `8 pass / 0 fail / 1 skipped`.
- RKP-2 parity: `8 pass / 0 fail / 0 skipped`.
- Worker representative suite without opt-in: `18 pass / 0 fail / 1 skipped`.
- Built native DLL and ignored `.node`: `2,712,576` bytes each, SHA-256
  `a471886f1d6ca6ae53162e7cacafd1b85f989b997a9f36cae17b50d4dcae959c`
  on both sides.

## Seven-path EOL matrix

`git check-attr` returned `text: set` and `eol: lf` for all seven paths.
Fresh `core.autocrlf=true` and `core.autocrlf=false` checkout-index lanes each
passed `7/7` raw worktree-to-Git-blob equality checks with zero CR bytes.

| Path | Bytes | CR bytes | Git blob | SHA-256 |
| --- | ---: | ---: | --- | --- |
| `crates/brilliant-kernel-runtime/src/runtime.rs` | 4,978 | 0 | `ded7d256e074971a33ce4258a77a33dc5933bd66` | `87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3` |
| `crates/brilliant-kernel-runtime/src/store.rs` | 70,084 | 0 | `936bf38610c3037b3d1cade61296cfdae3369fb4` | `d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6` |
| `crates/brilliant-kernel-runtime/src/indices.rs` | 79,741 | 0 | `774c3b61a89dc4eddeccbe787d2d0afb1b654eee` | `3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7` |
| `test/core-kernel/fixtures/cvn-7-qualification-score.ts` | 10,726 | 0 | `541f110e385f6eba2a3a46e5be0a7300dc3cf0b4` | `5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts` | 38,950 | 0 | `a3f3e55dfd20c5d968e795c07c03c8139706fc14` | `909624a8a32807d0f4103bb4f61524dc7dc538f0c2c0a4fedd5e3eaf4533cd1c` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts` | 32,891 | 0 | `bc45d08bfb8bac412c62f91aae7f04914dbb9aef` | `222bf43058ee06a2411029531f8ca3ee55f5437c3f8c78b7e7869d8a57110fbe` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1` | 15,344 | 0 | `344d91e10ec5ee2c494f40eee45b40586f779800` | `d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f` |

## Complete E3 consumption record

The opt-in suite ran once and passed `19/19`. This is the sole emitted
consumption record:

```text
BRILLIANT_RKP2_SCALE_CONSUMPTION_V1:{"schemaVersion":1,"processSentinelBase64":"QlJJTExJQU5UX1JLUDJfU0NBTEVfUFJPQ0VTU19WMTp7InNjaGVtYVZlcnNpb24iOjEsInN0YXR1cyI6Im9rIiwiZXZpZGVuY2UiOnsic2NoZW1hVmVyc2lvbiI6MSwic3RhdHVzIjoib2siLCJmaXh0dXJlSWQiOiJjdm43LXN0cmVzcy12MSIsImNvdW50cyI6eyJtZWFzdXJlcyI6NDAwLCJwYXJ0cyI6MTYsInN0YXZlcyI6MTYsIm1lYXN1cmVDb250ZW50cyI6NjQwMCwidm9pY2VzIjoxMjgwMCwiZXZlbnRzIjoxMDI0MDAsIm5vdGVzIjo1MTIwMCwiZXh0ZW5zaW9ucyI6MTgsInBhcnRPd25lZEV4dGVuc2lvbnMiOjE2LCJ1bmtub3duRXh0ZW5zaW9ucyI6MX0sImJ5dGVzIjp7ImNhbm9uaWNhbFNjb3JlQnl0ZXMiOjE1MDEzOTA0LCJjcmVhdGVSZXF1ZXN0Qnl0ZXMiOjE1MDEzOTMyfSwibWV0cmljcyI6eyJlbnRpdGllc1Zpc2l0ZWQiOjE2NjgzMywicmVjb3JkcyI6eyJtZWFzdXJlcyI6NDAwLCJwYXJ0cyI6MTYsInN0YXZlcyI6MTYsInZvaWNlcyI6MTI4MDAsImV2ZW50cyI6MTAyNDAwLCJub3RlcyI6NTEyMDAsImV4dGVuc2lvbnMiOjE4fSwidG9wb2xvZ3lFZGdlc1Zpc2l0ZWQiOjE3MzI1MCwicmVmZXJlbmNlRWRnZXNCdWlsdCI6MTkyMTYsInRpbWVFbnRyaWVzQnVpbHQiOjEwMjQwMCwiZW50aXR5SW5kZXhMb29rdXBzIjowLCJvd25lckluZGV4TG9va3VwcyI6MCwidGltZUluZGV4Q29tcGFyaXNvbnMiOjAsImluZGV4RW50cmllc0J1aWx0Ijo0NzQ1MTcsImluZGV4UmVidWlsZEVudHJpZXMiOjQ3NDUxNywiZnVsbERvY3VtZW50TWF0ZXJpYWxpemF0aW9ucyI6MSwiY2Fub25pY2FsRW5jb2RlQnl0ZXMiOjE1MDEzOTA0fSwiZW50aXR5UHJvYmUiOnsic3RhYmxlSWQiOiJjdm43LWUtMDAtMDAwMC0wLTAiLCJlbnRpdHlLaW5kIjoiZXZlbnQiLCJlbnRpdHlJbmRleExvb2t1cHNEZWx0YSI6MSwib3RoZXJDb3VudGVyRGVsdGEiOjB9LCJvd25lclByb2JlIjp7ImVudGl0eUtpbmQiOiJldmVudCIsIm93bmVyS2luZCI6InZvaWNlIiwib3duZXJTdGFibGVJZCI6ImN2bjctdi0wMC0wMDAwLTAiLCJvd25lckluZGV4TG9va3Vwc0RlbHRhIjoxLCJvdGhlckNvdW50ZXJEZWx0YSI6MH0sInBhcml0eSI6eyJub3JtYWxpemVkUHJvamVjdGlvbkVxdWFsIjp0cnVlLCJpbmRleEVudHJ5Q291bnRFcXVhbCI6dHJ1ZX0sInJvdW5kVHJpcCI6eyJzZW1hbnRpY0VxdWFsIjp0cnVlLCJjYW5vbmljYWxCeXRlc0VxdWFsIjp0cnVlfSwib3JkZXJpbmciOnsidG9wb2xvZ3lDYW5vbmljYWwiOnRydWUsImV4dGVuc2lvbnNQcmVzZXJ2ZWQiOnRydWV9LCJ3b3JrbG9hZEVsYXBzZWRNaWNyb3MiOjI0MTIyNzkyfSwicHJvY2VzcyI6eyJleGl0Q29kZSI6MCwidGltZWRPdXQiOmZhbHNlLCJwZWFrV29ya2luZ1NldEJ5dGVzIjo4MjE3MjMxMzYsInN0ZG91dEJ5dGVzIjoxNDM4LCJzdGRlcnJCeXRlcyI6MCwidGVybWluYXRpb25TdGF0dXMiOiJub3QtcmVxdWlyZWQiLCJyZWFwU3RhdHVzIjoic3VjY2VlZGVkIiwiY2xlYW51cFN0YXR1cyI6InN1Y2NlZWRlZCJ9LCJwYXJ0aWFsRXZpZGVuY2UiOmZhbHNlfQ0K","processSentinelBytes":1527,"processSentinelSha256":"4cbcbf8705d9abcb1b1f51c7fa188573ac5879bd7c6617d13c59961ea191bb0c","wallElapsedMicros":25316965}
```

Independent Base64 decoding reproduced `1,527` bytes and SHA-256
`4cbcbf8705d9abcb1b1f51c7fa188573ac5879bd7c6617d13c59961ea191bb0c`.
The process sentinel contains its prefix exactly once and differs from the
historical mechanism sentinel
`64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862`.

## Decoded process result

- Fixed score: `400` measures, `16` parts, `16` staves, `6,400` measure
  contents, `12,800` voices, `102,400` events, `51,200` notes, and `18`
  extensions (`16` part-owned, `1` unknown).
- Canonical score/create-request bytes: `15,013,904 / 15,013,932`.
- Entities/topology/reference/time entries: `166,833 / 173,250 / 19,216 /
  102,400`.
- Built/rebuilt index entries: `474,517 / 474,517`.
- Full-document materializations: `1`; canonical encoded bytes: `15,013,904`.
- Entity probe: event `cvn7-e-00-0000-0-0`, lookup delta `1`, other delta `0`.
- Owner probe: Voice `cvn7-v-00-0000-0`, lookup delta `1`, other delta `0`.
- Projection parity, entry-count parity, semantic equality, canonical-byte
  equality, topology order, and extension preservation: all `true`.
- Rust workload elapsed: `24,122,792 us`; end-to-end worker elapsed:
  `25,316,965 us`.
- Process: exit `0`, no timeout, peak working set `821,723,136` bytes,
  stdout/stderr `1,438 / 0` bytes, termination `not-required`, reap
  `succeeded`, cleanup `succeeded`, `partialEvidence=false`.

## Cleanup, delta, and next gate

- The three scale environment variables were absent before E3 and removed in
  the execution `finally` block.
- The worker-owned `rkp2-scale-e2-*` leaf set is empty after execution.
- Source-to-candidate changes are restricted to the eight declared lifecycle
  paths, with zero technical delta after the source commit.
- The child alone is candidate-ready. Both parents remain candidate-ready
  false; S6.2 is started but incomplete, S6.3 is false, and TypeScript remains
  the default runtime.
- Next gate: fresh read-only S6.2 implementation audit of the exact committed
  E4 candidate. No later lifecycle gate is implied.
