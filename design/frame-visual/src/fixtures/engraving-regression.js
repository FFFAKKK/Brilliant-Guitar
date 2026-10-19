const note = (id, base = 4, step = "C", octave = 5, alter = 0, dots = 0) => ({
  id, duration: { base, dots }, content: { kind: "note", pitch: { step, octave, alter } },
});
const rest = (id, base) => ({ id, duration: { base, dots: 0 }, content: { kind: "rest" } });
const measure = (id, events, numerator = 4, denominator = 4) => ({
  id, voiceId: `voice-${id}`, meter: { numerator, denominator }, ruleWarnings: [], events,
});
const snapshot = (measures, keySignatureChanges = []) => ({
  kind: "staff", partId: "regression-part", staffId: "regression-staff", clef: "treble",
  tempoBpm: 96, measures, keySignatureChanges,
});
const sequence = (prefix, count, base) => Array.from({ length: count }, (_, index) => note(`${prefix}-${index}`, base));

export const ENGRAVING_CASES = [
  { id: "pitch", title: "音高：C4 加线 · E4 底线 · F5 顶线 · A5 加线", snapshot: snapshot([
    measure("pitch-m", [note("pitch-c4", 4, "C", 4), note("pitch-e4", 4, "E", 4), note("pitch-f5", 4, "F", 5), note("pitch-a5", 4, "A", 5)]),
  ]) },
  { id: "rests", title: "真实休止符：全休止第四线下悬，二分休止第三线上托", snapshot: snapshot([
    measure("whole-rest", [rest("whole-r", 1)]), measure("half-rest", [rest("half-r1", 2), rest("half-r2", 2)]),
  ]) },
  { id: "durations", title: "时值：全、二分、四分、八分、十六分", snapshot: snapshot([
    measure("whole", sequence("whole-e", 1, 1)), measure("half", sequence("half-e", 2, 2)),
    measure("quarter", sequence("quarter-e", 4, 4)), measure("eighth", sequence("eighth-e", 8, 8)),
    measure("sixteenth", sequence("sixteenth-e", 16, 16)),
  ]) },
  { id: "dotted", title: "附点四分 + 八分 + 二分 = 4/4", snapshot: snapshot([
    measure("dotted-m", [note("dotted-e", 4, "D", 4, 0, 1), note("dotted-8", 8), note("dotted-2", 2)]),
  ]) },
  { id: "sharp-key", title: "G 调：F♯、F♯、F♮、F♯；下一小节重新继承调号", snapshot: snapshot([
    measure("sharp-m1", [note("sharp-1", 4, "F", 4, 1), note("sharp-2", 4, "F", 4, 1), note("natural-1", 4, "F", 4), note("sharp-3", 4, "F", 4, 1)]),
    measure("sharp-m2", [note("sharp-reset", 1, "F", 4, 1)]),
  ], [{ measureId: "sharp-m1", measureIndex: 0, fifths: 1 }]) },
  { id: "flat", title: "无调号：B♭、B♭、B♮、B♭（变音上下文）", snapshot: snapshot([
    measure("flat-m", [note("flat-1", 4, "B", 4, -1), note("flat-2", 4, "B", 4, -1), note("flat-natural", 4, "B", 4), note("flat-3", 4, "B", 4, -1)]),
  ]) },
  { id: "simple", title: "4/4：八个八分音符，按四分拍形成四组连梁", snapshot: snapshot([
    measure("simple-m", sequence("simple-e", 8, 8)),
  ]) },
  { id: "compound", title: "6/8：六个八分音符，按附点四分拍形成两组连梁", snapshot: snapshot([
    measure("compound-m", sequence("compound-e", 6, 8), 6, 8),
  ]) },
  { id: "empty", title: "空小节：没有伪造休止符，仍保留四个拍点锚点", snapshot: snapshot([
    measure("empty-m", []),
  ]) },
  { id: "overflow", title: "超量小节：第五个四分事件保留并标记超量", snapshot: snapshot([
    { ...measure("overflow-m", sequence("overflow-e", 5, 4)), ruleWarnings: [{ code: "rule.sequence-exceeds-measure",
      nominalDuration: { numerator: 1, denominator: 1 }, actualDuration: { numerator: 5, denominator: 4 }, overflow: { numerator: 1, denominator: 4 } }] },
  ]) },
  { id: "pages", title: "长谱分页：80 小节，每页保持 A4，几何使用相同页偏移", snapshot: snapshot(
    Array.from({ length: 80 }, (_, index) => measure(`page-m${index}`, sequence(`page-e${index}`, 4, 4))),
  ) },
];
