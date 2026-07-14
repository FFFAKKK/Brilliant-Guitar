# Command and Transaction

> **Later-stage replanning boundary:** K1-1 exposes no mutation API. K1-2 is
> blocked until K1-1 review and a separate executable command specification.

The future command system must preserve these boundaries:

- semantic commands are the only public write path;
- public patch, JSON path, field replacement, array splice, script, and mutable whole-document replacement are forbidden;
- targets derive from current measure/part/staff/voice/event/note IDs, not retired slot/tick addresses;
- failure and rollback leave document, extensions, version, history, dirty state, and events unchanged;
- unknown ExtensionBlocks survive command, undo, redo, and replay paths;
- Core commands own general score facts while Guitar Domain owns tuning/string/fret/technique semantics;
- concrete envelopes, target/range types, deltas, history entries, errors, and command IDs require K1-2 review.

The product-level replanning gate is `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-003-command-system.md`. No implementation may start from the archived draft.
