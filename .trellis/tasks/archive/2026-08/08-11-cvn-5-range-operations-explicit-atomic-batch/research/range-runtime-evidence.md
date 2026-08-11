# Current Range and Primitive-Effect Evidence

## Existing accepted public data

The current domain/read layers already contain:

- stable score addresses for Measure, Part measure content, Voice event and Note ownership;
- the three-kind `ScoreRange` union;
- strict address/range decoding;
- a read-side `selectScoreRange` behavior;
- accepted `Transposition` and `transposeWrittenPitch` behavior.

CVN-5 uses these shapes exactly. It does not add a persisted range or pitch representation.

## Existing accepted primitive effects

The command/transaction spine already owns primitive effect categories sufficient for CVN-5:

- `remove-measure-bundle`;
- `remove-event`;
- `replace-written-pitch`.

The future range adapter expands a semantic range command into ordered instances of those effects. The accepted effect engine remains responsible for candidate application and inverse derivation.

## Current catalog state

The planning baseline has `25` accepted Core commands. CVN-5 adds exactly three, producing the parent-promised `28`-command catalog. CVN-2 and CVN-6 infrastructure add official-module contributions but no fixed Core command IDs.

## Parity requirement

The write-side private range resolver must be tested against the accepted read selector for:

- all three range kinds;
- forward and reversed endpoints;
- multiple Measures/Parts/Voices/Events/Notes;
- missing endpoints and owner mismatch;
- stable result ordering and detached values.

The implementation must repair its private resolver if parity fails; `domain/**` and `read/**` remain protected.
