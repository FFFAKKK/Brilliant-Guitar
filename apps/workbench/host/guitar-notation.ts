import { GUITAR_DOMAIN_NAMESPACE, SET_GUITAR_POSITION_COMMAND, readPartGuitarDomainV1 } from "../.kernel/src/first-party-modules/guitar-domain.js";
import type { FrettedNotationDomain } from "./fretted-notation.ts";
import { supportsPlainFrettedNotation } from "./fretted-notation.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";

/** Concrete first-party assembly; shared notation knows neither this ID nor Guitar's payload. */
export const guitarNotationDomain: FrettedNotationDomain = Object.freeze({
  namespace: GUITAR_DOMAIN_NAMESPACE,
  setPositionCommandId: SET_GUITAR_POSITION_COMMAND,
  readPart: readPartGuitarDomainV1,
});

export const supportsPlainGuitarNotation = (document: ScoreDocument): boolean =>
  supportsPlainFrettedNotation(document, guitarNotationDomain);
