# Root Cause and Exact Node Count

## Classification

The original independent root-cause audit returned P0/P1/P2=`0/1/0`: RKP-2 E2 must remain paused until a versioned public JSON property-cap successor is accepted. P0-P2 closed that Rust/wire boundary and passed independent audits.

A later P3 attempt was not committed and was fully reverted. Its independent root-cause audit returned P0/P1/P2=`0/2/0`: the remaining blockers are (1) the native TypeScript capture profile still uses the default `1,048,576` member/element cap and (2) the attempted evidence equated raw input bytes with Foundation-canonical exported bytes. Neither finding is a fixture, E1 seam, qualification-method or disk-space defect.

The first docs amendment candidate `978160e69b69d643c3d61ca946bde10bfe4aefb0` then returned P0/P1/P2=`0/1/1`: the scale facts below were correct, but the P3B isolated journey lacked an executable one-file self-worker protocol and `design.md` described the already-audited P2 successor-wire edit as future work. This repair changes planning authority only; it does not change any count, fixture, SHA or technical path.

The live threshold is `JSON_PROPERTY_LIMIT=1,048,576`. `StrictState` stops retaining at the first value beyond it and therefore reports `actual=1,048,577`; that value is the first overflow observation, not total input size.

## Exact count semantics

Every object, array and primitive counts as one JSON value. Object keys do not count.

| Projection | Objects | Arrays | Primitives | Total |
| --- | ---: | ---: | ---: | ---: |
| complete create request | 455,339 | 70,437 | 673,459 | 1,199,235 |
| document only | 455,338 | 70,437 | 673,458 | 1,199,233 |
| envelope only | 1 | 0 | 1 | 2 |

Document decomposition:

| Region | Count |
| --- | ---: |
| document root | 1 |
| schema | 1 |
| id | 1 |
| metadata | 6 |
| measure definitions | 2,001 |
| parts | 1,197,057 |
| extensions | 166 |
| total | 1,199,233 |

Frozen size facts are `102,400` Events, `51,200` Notes, `15,013,904` input score bytes and `15,013,932` create-request bytes. Rust canonical export is also `15,013,904` bytes but has a distinct SHA and payload-object key order.

## TypeScript capture counts

TypeScript capture counts members/elements rather than Rust JSON values. Rust counts the root value, so each projection has exactly one more value than TypeScript members:

| Projection | Rust values | TypeScript members | Bytes |
| --- | ---: | ---: | ---: |
| document | `1,199,233` | `1,199,232` | `15,013,904` input |
| create request | `1,199,235` | `1,199,234` | `15,013,932` |
| read response | `1,199,245` | `1,199,244` | `15,014,112` raw payload |

The response wrapper adds twelve edges. The direct fixture is a shared-reference DAG; WeakMap capture sees only `1,045,635` members and therefore accidentally fits the default cap. A JSON-cloned equivalent tree has `1,199,232` members and fails before native code under the predecessor profile. Both forms are required evidence.

## Canonical byte roles

The input and Rust export are both `15,013,904` bytes and semantically equal. Their first difference is zero-based `15,011,087` / one-based `15,011,088` at `$.extensions[0].payload`: input order is `marker` then `generatorVersion`; Foundation `BTreeMap` canonical order is `generatorVersion` then `marker`.

- input SHA-256: `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`;
- Rust canonical export SHA-256: `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`.

The input hash is not a Foundation canonical hash. The correct proof is semantic equality plus Rust encode/decode/re-encode canonical equality.

## Successor value

`1,572,864 = 3 × 524,288`. Against the exact request it retains `373,629` values of headroom:

`1,572,864 - 1,199,235 = 373,629`, which is `31.156%` of the observed request count.

The limit remains static and public; the fixture does not compute it.

## Excluded routes

- Envelope exclusion saves only two values: document `1,199,233` still exceeds the old cap.
- A test/internal bypass would create a second admission path and fail to prove the public decoder.
- Reducing the fixture would invalidate the already frozen RKP-2 scale contract.

The narrow repair is therefore a compatibility widening at the existing shared Core Types authority.
