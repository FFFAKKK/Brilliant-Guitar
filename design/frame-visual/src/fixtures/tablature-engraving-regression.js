// Browser engraving samples only. These never replace a document projection.
const note = (id, base, str = 3, fret = 0, dots = 0) => ({
  id, duration: { base, dots }, content: { kind: "note", noteId: `${id}-note`,
    position: { stringNumber: str, fret } },
});
const rest = (id, base, dots = 0) => ({ id, duration: { base, dots }, content: { kind: "rest" } });
const measure = (id, events) => ({ id, voiceId: `${id}-voice`,
  meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events });
const view = measures => ({ kind: "tablature", partId: "tab-regression", staffId: "tab-regression-staff",
  stringCount: 6, fretCount: 24, capoFret: 0, tempoBpm: 96, measures });

export const TABLATURE_ENGRAVING_CASES = [
  { id: "tab-digits", title: "弦序、空弦与双位品号", snapshot: view([
    measure("digits-a", [note("digit-1", 4, 1, 0), note("digit-2", 4, 2, 1),
      note("digit-3", 4, 3, 10), note("digit-4", 4, 4, 12)]),
    measure("digits-b", [note("digit-5", 4, 5, 24), note("digit-6", 4, 6, 0),
      note("digit-7", 4, 1, 1), note("digit-8", 4, 6, 10)]),
  ]) },
  { id: "tab-durations", title: "全、二分、四分、八分与十六分", snapshot: view(
    [1, 2, 4, 8, 16].map(base => measure(`duration-${base}`,
      Array.from({ length: base }, (_, index) => note(`duration-${base}-${index}`, base, index % 6 + 1, index % 2 ? 12 : 0))))) },
  { id: "tab-dotted", title: "附点与节奏连梁", snapshot: view([
    measure("dotted-half", [note("dotted-half-note", 2, 1, 10, 1), note("dotted-quarter-note", 4, 6, 1)]),
    measure("dotted-quarter", [note("dotted-quarter-dotted", 4, 6, 24, 1), note("dotted-eighth", 8, 1, 0),
      note("dotted-half-plain", 2, 3, 12)]),
    measure("dotted-eighths", Array.from({ length: 4 }, (_, i) =>
      [note(`dotted-eighth-${i}`, 8, 2, 1, 1), note(`short-sixteenth-${i}`, 16, 5, 10)]).flat()),
  ]) },
  { id: "tab-rests", title: "谱内休止：全至三十二分", snapshot: view(
    [1, 2, 4, 8, 16, 32].map(base => measure(`rest-${base}`,
      Array.from({ length: base }, (_, index) => rest(`rest-${base}-${index}`, base))))) },
  { id: "tab-rest-mixed", title: "谱内附点休止与音符混排", snapshot: view([
    { ...measure("mixed-rest-whole-measure", [rest("rest-dotted-whole", 1, 1)]),
      meter: { numerator: 6, denominator: 4 } },
    measure("mixed-rest-half-measure", [rest("rest-dotted-half", 2, 1), note("rest-mixed-quarter", 4, 6, 12)]),
    measure("mixed-rest-quarter-measure", [note("rest-mixed-eighth", 8, 2, 3), rest("rest-dotted-quarter", 4, 1),
      note("rest-mixed-half", 2, 4, 10)]),
    measure("mixed-rest-short-measure", [note("rest-mixed-short-note", 8, 3, 3), rest("rest-dotted-eighth", 8, 1),
      note("rest-mixed-sixteenth", 16, 2, 3), rest("rest-dotted-sixteenth", 16, 1),
      rest("rest-plain-thirtysecond", 32), note("rest-mixed-last-sixteenth", 16, 5, 0),
      note("rest-mixed-last-eighth", 8, 6, 0, 1),
      rest("rest-mixed-last-quarter", 4)]),
  ]) },
  { id: "tab-seven-string-rests", title: "七弦谱休止定位", snapshot: {
    ...view([measure("seven-string-rests", [rest("seven-quarter", 4), rest("seven-eighth", 8),
      rest("seven-sixteenth", 16), rest("seven-thirtysecond", 32),
      note("seven-string-note", 4, 7, 0)])]), stringCount: 7,
  } },
  { id: "tab-pages", title: "换行、分页与下方节奏留白", snapshot: view(
    Array.from({ length: 60 }, (_, index) => measure(`page-${index}`,
      [note(`page-${index}-note`, 2, index % 6 + 1, 12, 1), rest(`page-${index}-rest`, 4)]))) },
];
