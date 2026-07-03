# Long-Term Maintenance Guide

> Long-term maintenance is a project principle. It must be enforced from the first MVP through future open-source, graduation, and commercial phases.

---

## Core Rule

Graduation delivery is the first maintainable product milestone, not a disposable demo.

Do not bypass domain boundaries, file compatibility, validation, migrations, tests, or release discipline because a feature is "just MVP", "just graduation work", or "just a demo".

---

## When This Guide Applies

Read this guide before changing:

- `.bgp` package structure
- `manifest.json` or `score.json`
- schema version or migrations
- score domain model
- command system or command replay
- file open/save/autosave/recovery behavior
- import/export behavior
- plugin manifest or public extension API
- release versioning, changelog, known issues, or compatibility notes

---

## Mandatory Practices

- Every stable `.bgp` schema version must have at least one fixture.
- Stable 1.x releases must open all `.bgp` files saved by stable 1.x releases.
- Future schema versions must fail safely with a readable error.
- Schema field removal, rename, or semantic change requires a migration plan.
- File open/save changes require round-trip tests.
- `Guitar Core Loop` must remain a regression scenario for every release.
- Important architecture decisions must be written in design docs or ADRs.
- Releases must include version number, changelog, known issues, compatibility notes, and migration notes when relevant.

---

## Forbidden Shortcuts

- Do not store score truth only in React component state.
- Do not write `.bgp` JSON directly from UI code.
- Do not bypass the command system for editable score mutations.
- Do not silently discard unknown fields, plugin-private data, or recoverable future data.
- Do not break old fixtures, old command replays, or file round-trip tests without a migration and release note.
- Do not treat open-source, graduation, MVP, or demo scope as permission to weaken maintainability.

---

## Review Checklist

Before merging a change, answer:

- Does this affect old user files?
- Does this affect schema version or migration behavior?
- Does this affect command replay, undo/redo, or fixtures?
- Does this affect PDF/PNG export compatibility or visual output?
- Does this need a changelog, known issue, or compatibility note?
- Can `Guitar Core Loop` still run end to end?

If any answer is yes, add tests or documentation before finishing.
