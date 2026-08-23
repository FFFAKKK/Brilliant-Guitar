# RKP-1 Authority, Baseline and Toolchain Audit

## Repository and ancestry

- Worktree: `C:/Users/ATOM/.codex/worktrees/0589/brilliant_guitar`.
- Repair branch: `codex/rkp-1-seven-crate-workspace-contracts-bridge-smoke-planning-r1`.
- Exact branch root: `463c8514a61a61a39c8a5d2736261ae9e82b0fba`; status-sync `7174c5ac50655ae0cb8807e21c7045a0c1b6d15e` is its direct child and changes only the two lifecycle headers; amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`.
- Original branch and reviewed candidate `b619f2409c1624900de352e5c28dde0f8c49767e` remain untouched as a sibling of `7174c5a...`. Review returns were `b619f240...`=`0/3/1`, `922da5e...`=`0/2/0`, and `9741abfee76d009dbea985192e5dfb162e16902a`=`0/1/0`. This amend repairs only the final authorized status-dependent remove-wrap ownership finding/direct tests and remains targeted-rereview pending.
- `git merge-base HEAD 463c851...` must return exactly `463c851...`; no production commit may sit between the required base and this planning candidate.
- The main checkout and all other worktrees were inspected read-only only; none is an RKP-1 write target.

## Authority chain

| Authority | Evidence | RKP-1 consequence |
|---|---|---|
| Architecture Reset V2 | content `e81c739...`; accepted audit record `ea574ec...`; PASS `0/0/0`, `34/34` | exact seven crates, unique Runtime/Session/Product owners, Node boundary, TypeScript default through RKP-7 |
| Authority sync | accepted `d722789...`; PASS `0/0/0` | RKP-1 planning creation gate satisfied; production implementation still false |
| Rust remediation parent | status planning, task-start false, one-child-at-a-time policy | RKP-1 is the sole current planning child; no implementation child |
| Archived RKP-0 | accepted `9bc5390...`; implementation audit PASS `0/0/0` | current TypeScript oracle/data remain immutable inputs |

## Frozen compatibility input

The RKP-0 manifest and V2 both freeze:

- persisted schema `brilliant-score-1`;
- 28 exact Core command IDs;
- 51 application runtime exports;
- Module SDK 8 runtime and 34 type exports;
- nine contribution ABI fields;
- 64 oracle rows and Qualification V2 data owned by RKP-0, not regenerated or qualified by RKP-1;
- current clean TypeScript regression count `531/531`.

## Local build environment observed on 2026-08-20

- Node `v24.15.0` and npm `11.12.1`.
- No `rustc`, `cargo` or `rustup` executable is installed in this worktree environment.
- `core.autocrlf=true`.
- Phase A therefore performs no Cargo command and does not download/install dependencies; those operations remain behind planning PASS and later implementation authorization.

## Toolchain and dependency evidence

The plan intentionally pins versions instead of allowing future “latest” resolution:

- Rust's official release index lists `1.97.1` as the current stable patch at planning time: <https://blog.rust-lang.org/releases/>.
- Rust 1.85 introduced Edition 2024 and its rust-version-aware resolver behavior; RKP-1 uses Edition 2024/Resolver 3 while choosing a higher dependency-driven MSRV: <https://blog.rust-lang.org/2025/02/20/Rust-1.85.0.html>.
- napi-rs' support contract states v3 MSRV `1.88.0` and current Node 24 coverage: <https://napi.rs/docs/more/support-compatibility>.
- The pinned napi crate `3.12.0` publishes `rust-version=1.88` and Node-API feature levels: <https://docs.rs/crate/napi/3.12.0>.
- Pinned napi's `wrap_and_tag` contract wraps with no finalizer and removes the wrap if tagging fails, so RKP-1 instead freezes direct `napi_wrap` + `tag_object` with one finalizer: <https://docs.rs/napi/3.12.0/napi/bindgen_prelude/fn.wrap_and_tag.html>.
- The pinned type-tag functions are unsafe and require a valid environment/object/type-tag contract: <https://docs.rs/napi/3.12.0/napi/bindgen_prelude/fn.tag_object.html> and <https://docs.rs/napi/3.12.0/napi/bindgen_prelude/fn.validate_type_tag.html>.
- Node-API defines that every call returns `napi_status` and places the API result in an out parameter; `napi_remove_wrap` guarantees removal/finalizer cancellation only when it succeeds. Therefore RKP-1 transfers ownership based on `napi_status`, never an error-status out pointer: <https://nodejs.org/api/n-api.html#napi_remove_wrap> and <https://nodejs.org/api/n-api.html#return-values>.
- Direct codec pins observed in official crate documentation are serde `1.0.229`, serde_json `1.0.151`, napi-derive `3.6.2`, and this plan's napi source dependency records napi-build `2.4.0`.

Decision: toolchain `1.97.1`, MSRV `1.88.0`, Edition 2024, Resolver 3, exact direct versions plus committed `Cargo.lock`, Node-API v8 type tags, Node `cdylib`, and Windows `x86_64-pc-windows-msvc` debug native qualification only. Lock creation is exactly `cargo +1.97.1 generate-lockfile --manifest-path Cargo.toml`. The development toolchain and MSRV are both tested. An update or non-Windows artifact policy is a reviewed planning change, not an operator choice.

## Entry verdict

RKP-1 planning creation is authorized and predecessor-complete. RKP-1 start/implementation is not authorized. All prior repairs are preserved; only the third targeted review's status-dependent remove-wrap ownership P1 has this bounded planning repair. The original P2 remains outside scope and is not claimed closed. The next gate is targeted independent rereview of this two-commit docs-only chain.
