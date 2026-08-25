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

The partial Node 24 result is decisive: exit code 0 does not prove complete discovery. The runner contract must compare a deterministic manifest with exact top-level file outcomes.

## Attribution

```powershell
git diff --name-only df40aef391440ae64ad3e266419579bee5887a1f eed4871a86191783d539b7d4097be3627e98e4a0 -- package.json package-lock.json
```

Expected output is empty. The Stage 5 range did not create or alter this method. The repair is bounded infrastructure work and does not change the evidence/behavior of any individual test.

## Evidence rule

Current counts are a reproduction snapshot only. The accepted runner must enumerate dynamically, print its file manifest and accept a growing test tree without updating constants. Evidence records exact Node version, shell entry, fileCount/hash and actual test totals for each run.
