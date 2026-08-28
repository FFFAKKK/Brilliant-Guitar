# Archive Path and Workspace-Law Migration Map

## Roots

| Role | Literal root | Valid state |
| --- | --- | --- |
| Historical implementation source | `.trellis/tasks/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair/` | immutable base-to-B blob/range comparison only |
| Current archive authority | `.trellis/tasks/archive/2026-08/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair/` | current authority only after C2/C3 |

The roots are mutually exclusive as current authorities. C1 must preserve historical active-root blobs without requiring their paths to exist after C2. C2 requires active present/archive absent before native archive; C3 requires active absent/archive complete afterward.

## Workspace-law migration

1. C0 does not edit the law and is expected 10/6/4.
2. C1 pins accepted B and changes B-range tests from mutable `HEAD` to the existing frozen implementation base through B. It separately proves A3→B is non-merge, direct and exactly eight paths. Target: 10/7/3.
3. C2 transition output is not final evidence. It must name the archive-successor readiness failure precisely and reject any additional failure.
4. C3 validates the 13/13 inventory, archive JSONL path existence/uniqueness, active absence and archive presence. Target: 10/7/3.
5. C4 repeats the final 10/7/3 after the Stage6 fast-forward and its docs-only integration projection.

No phase may use an unbounded descendant range, wildcard, directory exemption, or an archive path as a replacement for immutable historical B evidence.
