# CVN-7 Qualification Owner Routing

## Contract set

The parent matrix contains 44 actual FC headings. CVN-7 primary ownership is the nine-row set `130..134/140..143`. IDs `135..139` are unallocated and create no implicit contract.

## Failure routing

| FC group | Existing primary owner | CVN-7 responsibility | Failure destination |
|---|---|---|---|
| `001/002/041` | Core VNext parent | final recount/version/finite-scope evidence | parent contract repair |
| `010` | CVN-0 | public hostile-input regression | CVN-0 bounded repair task |
| `011/040` | CVN-1 | state/result/V1 trace equality | CVN-1 bounded repair task |
| `020/021/030/031` | parent + command owners | cross-command exact input/output/anchor matrix | earliest affected command owner |
| `050..053` | CVN-3 | factory/Measure qualification | CVN-3 bounded repair task |
| `060..063/070` | CVN-4 | hierarchy/cascade qualification | CVN-4 bounded repair task |
| `080..082/090..093/100..102` | CVN-5 | range/batch/failure qualification | CVN-5 bounded repair task |
| `110/111` | CVN-2 | SDK/catalog/assembly freeze | CVN-2 bounded repair task |
| `112/120..122` | CVN-6 | runtime/availability/migration qualification | CVN-6 bounded repair task |
| `130..134` | CVN-7 | scale/method/budget evidence | CVN-7 harness repair or owner-specific performance repair |
| `140..143` | CVN-7 consumer gate | complete matrix proof | underlying owner if behavior fails; CVN-7 if trace/harness fails |

## Routing rules

1. Record the earliest deterministic failing stage and exact FC row.
2. Separate harness defects from product behavior defects by reproducing through the existing public API outside the runner.
3. Create one repair task per primary owner; shared root cause may share a task only when the parent approves one owner.
4. Production repairs receive independent review, acceptance and archive before CVN-7 rebaselines.
5. Any production repair invalidates old functional/performance evidence after the changed stage.
6. Budget changes are parent-contract changes, not CVN-7 repair shortcuts.
7. Qualification failures never activate Guitar/product/public-plugin tasks.

## Performance routing

- A/B regression with identical production build hashes indicates harness/environment variance first; mark evidence invalid and reproduce.
- A/B regression with different independently accepted production builds requires profiling evidence and an owner-specific performance repair.
- Absolute reference failure with portable ratios passing still blocks reference qualification; the numerical budget remains fixed.
- Stress RSS failure routes to the subsystem retaining memory, proven by effect/history/build evidence rather than file proximity.
