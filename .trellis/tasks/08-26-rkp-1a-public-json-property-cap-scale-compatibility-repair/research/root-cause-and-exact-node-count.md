# Root Cause and Exact Node Count

## Classification

Independent root-cause audit returned P0/P1/P2=`0/1/0`: RKP-2 E2 must remain paused until a versioned public JSON property-cap successor is accepted. This is not a fixture, E1 seam, qualification-method or disk-space defect.

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

Frozen size facts are `102,400` Events, `51,200` Notes, `15,013,904` canonical score bytes and `15,013,932` create-request bytes.

## Successor value

`1,572,864 = 3 × 524,288`. Against the exact request it retains `373,629` values of headroom:

`1,572,864 - 1,199,235 = 373,629`, which is `31.156%` of the observed request count.

The limit remains static and public; the fixture does not compute it.

## Excluded routes

- Envelope exclusion saves only two values: document `1,199,233` still exceeds the old cap.
- A test/internal bypass would create a second admission path and fail to prove the public decoder.
- Reducing the fixture would invalidate the already frozen RKP-2 scale contract.

The narrow repair is therefore a compatibility widening at the existing shared Core Types authority.
