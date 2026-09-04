# Bug Analysis — RKP-2 Post-Archive Path Compatibility

## Classification

- Primary: C — change-propagation failure.
- Secondary: E — implicit lifecycle assumption.

## Bayesian diagnosis

| Hypothesis | Prior | Evidence | Posterior |
|---|---:|---|---:|
| H1: current reads are conflated with historical active paths | 70% | seven ENOENT/path-set failures, complete archives, four runtime tests green | >95% |
| H2: native archive lost or corrupted task files | 15% | exact 13/13 and 7/7 manifests exist | <3% |
| H3: RKP-2 runtime behavior regressed | 15% | all four kernel/runtime assertions pass | <2% |

## Five dimensions

1. Code logic: one set of constants served both Git-at-old-commit reads and current filesystem reads.
2. Data flow: native archive changed current authority location, but the new location was not propagated to all RKP-2 consumers.
3. State management: accepted history was still compared to moving `HEAD`, so legal archive and successor-task deltas appeared unreviewed.
4. Interface contract: `task.py validate` assumed every JSONL path remains literal forever, although task archive is a supported lifecycle operation.
5. Dependency and architecture: prior repairs made individual descendant tasks archive-aware but did not establish a reusable same-task rule at the RKP-2 root or Trellis validator boundary.

## Why earlier fixes did not prevent recurrence

RKP-1 and several RKP-2 descendants received local archive mappings. Those surface fixes protected their own tests but left the parent RKP-2 constants and the generic JSONL validator unchanged. The trigger therefore moved to the next task that completed native archive.

## Prevention contract

- Historical evidence uses paths valid at the pinned commit.
- Current lifecycle evidence resolves exactly one active/archive root with an exact manifest.
- Archived JSONL fallback is restricted to the JSONL owner's same task and same suffix.
- Accepted history is closed at a pinned activation commit; future repair paths are literal.
- The core-kernel Rust-transition specification records these rules.

## Template synchronization

Repository search found no template counterpart for `.trellis/spec/core-kernel/backend/rust-runtime-transition.md` or `.trellis/scripts/common/task_context.py`; template synchronization is therefore not applicable. `.trellis/.template-hashes.json` is provenance metadata, not a source template, and is not rewritten by this repair.

## Final evidence

Pending implementation and GREEN verification.
