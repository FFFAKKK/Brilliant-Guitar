# Operator Handoff

## Current state

- Planning base: `639e93555c15b46c54c8e9bb7ec610d4a77c7478`.
- Task status `in_progress`; native `task.py start` has run. P3A and P3B are completed, separately audited history. Independently accepted replacement A3 `3063e0972072e246d43add8640ba1fe1ad02d787` and separate user authority permitted the completed P4-B candidate freeze. B `08374273b05bc992e749a17a959b64af0f293f0b` independently passed implementation review at P0/P1/P2=`0/0/0` and is now owner-accepted implementation authority through C1; archive and integration remain unauthorized.
- First independent planning review returned P0/P1/P2=`0/3/1`; the four findings have been bounded-repaired in planning authority.
- Targeted independent planning rereview accepted exact head `1cd0caadff218c1471f67cdf1a1ab78f5653a605` at P0/P1/P2=`0/0/0`; P0 committed at `39e91e86bf696a30cc77b42bd1ec5e2ae6cc4fbe`. Exact P1 `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` and P2 `0f65272951fd23080b6f536b2e58f50afe249b02` each passed independent implementation audit at `0/0/0`.
- A P3 attempt produced no commit and was fully reverted. Root-cause audit returned `0/2/0`: the product needs a native-specific capture profile at both create and read, and consumer evidence must distinguish semantic/canonical equality from raw input bytes. The first docs amendment at `978160e69b69d643c3d61ca946bde10bfe4aefb0` returned `0/1/1`; its repair `14023029878be7c785ac0de7828628c5e3f4f8b1` returned `0/2/0` for CommonJS direct-entry and Windows settlement gaps. P3A and P3B are completed, historically authorized and independently audited; P3B's exact reviewed head is `e4103b779574fcdc728d024c1b8f30244cb332c3`. Replacement A3 `3063e0972072e246d43add8640ba1fe1ad02d787` then passed independent P4-entry planning review at `0/0/0`; completed B `08374273b05bc992e749a17a959b64af0f293f0b` independently passed implementation audit at `0/0/0`. Do not reopen P3A/P3B or change technical contracts.
- RKP-2 Stage 6 seam repair has E1/E1R green; E2/E3 not started; external blocker `public-json-property-cap-contract-conflict`.
- TypeScript remains default.

## Exact decision

Widen the one Core Types `JSON_PROPERTY_LIMIT` from `1,048,576` to `1,572,864`; Contracts imports it. Keep depth 64, request/response 64 MiB, 22 StableFailure variants and depth→property→shape→number precedence.

The old boundary and `oldCap+1` become compatible; `newCap+1` rejects with exact `1572864/1572865`. `captureStrictInput` remains the only TypeScript capture implementation/profile owner. Default stays `1,048,576`; implemented `native-wire-v1` is exactly `1,572,864`. Both native create-document and native response capture already select that profile without hard-coded call-site limits; this is completed, independently audited P3A history, not future work.

P1 changed only Core Types and intentionally stopped in the exact two-item bounded RED state recorded in `design.md`/`implement.md`; its independent audit passed. P2 changes only Contracts, the native TypeScript validator, the dedicated compatibility test and allowed lifecycle evidence. It closes both REDs without adding a second cap authority, then stops for independent audit before P3. P2 rollback returns to audited P1 RED; rolling back P1 restores old-wire green.

The count bridge is exact: document `1,199,233` Rust values / `1,199,232` TS members; create request `1,199,235` / `1,199,234`; read response `1,199,245` / `1,199,244` and `15,014,112` raw bytes. Direct DAG capture sees `1,045,635`; JSON-cloned tree sees `1,199,232`.

P3A owns the capture profile and five exact TypeScript/test paths, then stops for audit. P3B owns the real decoder/raw+public consumer proof and its only source/direct worker is the existing RKP-1A compatibility test, then stops for audit. Under unchanged CommonJS, direct entry is exactly `path.resolve(process.argv[1] ?? "") === path.resolve(__filename)` and additionally requires exact argv `--rkp1a-p3b-self-worker-v1`, env `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1=1` and absent `NODE_TEST_CONTEXT`. The prefix/schema and 1 MiB caps remain exact. Settlement uses `primary ??= failure`, exact taskkill argv with 5000 ms launch and reap guards, and handle-close plus two 5000 ms cleanup attempts separated by 100 ms; recovered cleanup is success, two failures reject. It adds no path and publishes no partial success. Input SHA is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical export SHA is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. They are semantically equal and each `15,013,904` bytes, not raw-byte equal.

## Do not do

Do not reopen or modify P3A/P3B or this completed B projection. Do not edit any technical path, stress fixtures, Runtime/Node addon production or other protected paths, accept/archive/integrate, resume E2, push, qualify, cut over the runtime or create RKP-3. `indices.rs` remains Stage6-only. Archived RKP-1 and active specs remain immutable.

## Next gate

Stop for the dedicated independent C1 accepted-B authority-transition audit in closeout task `08-28-rkp-1a-acceptance-archive-stage6-integration-closeout`. B is one non-merge direct child of accepted A3 and has exactly the original seven lifecycle owners plus the one workspace-law projection path; it freezes `bd8946e → f06c57b → 673a2b9 → e4103b7 → A1 aacb057 → A2 9e1770b → accepted A3 3063e097 → B 08374273`. C2 native archive, C3 repair and C4 integration remain unstarted. Do not archive, integrate or start E2 yet.
