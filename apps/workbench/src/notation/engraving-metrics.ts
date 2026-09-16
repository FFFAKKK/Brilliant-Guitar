/** Paper units are independent of pixels; staff size is an engraving choice.
 * LilyPond's standard-part reference is 20 pt / 7.03 mm, not a universal mandate.
 * SMuFL registers glyphs at one em = four staff spaces.
 */
export const ENGRAVING = {
  paperUnitsPerMm: 10 / 3,
  staffHeightMm: 7.03,
} as const;

export const STAFF_SPACE = ENGRAVING.staffHeightMm * ENGRAVING.paperUnitsPerMm / 4;
export const staffSpaces = (count: number) => count * STAFF_SPACE;
