# Current Runner Reproduction

## Exact source

- repository line: `codex/rkp-2-indexed-live-score-store-implementation`
- planning base: `eed4871a86191783d539b7d4097be3627e98e4a0`
- RKP-2 unified implementation base: `df40aef391440ae64ad3e266419579bee5887a1f`
- current package script: `npm run build && node --test "dist/test/**/*.test.js"`

## Reproduced facts

| Invocation/environment | File discovery | Test result | Exit |
|---|---:|---:|---:|
| Node 24 literal complete file list | 77 | 557 discovered; 556 pass; 1 expected GC skip; 0 fail | 0 |
| Node 24 quoted/literal-glob path observed by package/direct runner | 29 | 261 discovered with no reported failure | 0 |
| Node 20.20.2 literal wildcard | not complete | runner rejects literal glob | 1 |

The partial Node 24 result is decisive: exit code 0 does not prove complete discovery. The runner contract must compare deterministic enumeration, the exact `run()` array and observed structured-event coverage. The first planning audit correctly prohibited `test:complete`, `details.type` and reporter text, but later Stage-2 characterization disproved its assumption that every manifest file produces exactly one nesting-zero terminal outcome.

## Post-Stage-2 event characterization

The accepted planning head was `cc82ba168ed45b8c3e0182ea8e1370b1474f1155`. A separate implementation line committed activation `9da6ba6`, Stage 1 `912a68a` and clean Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`, then paused. Discarded diagnostic Stage 3 object `610d20b` is not a current ancestor.

The same TEMP two-file fixture and real Stage-2 compiled tree were executed with Node 20.20.2 and 24.15.0 under raw drain, fast reporter sink and backpressured slow reporter sink. Structured event sets were identical across all three consumption modes and both versions:

| Fixture | Structured result per version/mode | Decisive fields |
|---|---|---|
| empty `a.test.js` | one `test:pass` | `nesting=0`; absolute manifest `file`; absolute `name === file` |
| tested `b.test.js` | one internal pass and one internal fail | `nesting=0`; absolute manifest `file`; opaque non-absolute title in `name` |
| real 78-file Stage-2 tree | 567 pass / 1 governance fail; all 78 files attributable by `data.file`; no unique file-terminal rows | every pass/fail has absolute manifest-member `data.file`; `name` is a test title |

The real-tree fail is the expected workspace-law failure because the Stage-3 candidate-range projection was deliberately not landed after implementation paused. It is not a product regression or a future total. Reporter/backpressure changed consumption timing only; it did not change the observed event set. The durable truth fields are event type and `data.file`. `data.name` and `data.nesting` remain evidence-only.

## Attribution

```powershell
git diff --name-only df40aef391440ae64ad3e266419579bee5887a1f eed4871a86191783d539b7d4097be3627e98e4a0 -- package.json package-lock.json
```

Expected output is empty. The Stage 5 range did not create or alter this method. The repair is bounded infrastructure work and does not change the evidence/behavior of any individual test.

## Evidence rule

Current counts are reproduction snapshots only. The accepted runner must enumerate dynamically, reject normalized duplicates and `(dev,ino)` physical aliases, print its file manifest and accept a growing test tree without updating constants. Evidence records exact Node version, shell entry, fileCount/hash, truth-consumed event fields and actual test totals for each run. Completeness is the non-tautological equality of enumerator manifest, actual `run()` absolute files and the set of manifest-member `test:pass.data.file` observations; any `test:fail` remains immediately fatal.
