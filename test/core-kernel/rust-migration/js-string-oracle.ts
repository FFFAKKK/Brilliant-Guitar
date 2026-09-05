const codeUnits = (text: string): number[] => Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));

/** Independent ECMAScript code-unit and JSON.stringify reference data. */
export function createJsStringOracle() {
  const inputs: Array<{ label: string; text: string }> = [
    { label: "empty", text: "" },
    { label: "ascii", text: "score/part:name" },
    { label: "escapes", text: '\"\\/\b\f\n\r\t' },
    { label: "all-controls", text: String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index)) },
    { label: "high-first", text: "\ud800" },
    { label: "high-last", text: "\udbff" },
    { label: "low-first", text: "\udc00" },
    { label: "low-last", text: "\udfff" },
    { label: "pair-first", text: "\ud800\udc00" },
    { label: "pair-last", text: "\udbff\udfff" },
    { label: "pair-guitar", text: "🎸" },
    { label: "replacement", text: "\ufffd" },
    { label: "private-marker", text: "\ue000" },
    { label: "literal-escape", text: "\\ud800" },
    { label: "mixed", text: "a\ud800b\udc00c\ud800\ud800\udc00\udc00z" },
    { label: "reversed-pair", text: "\udc00\ud800" },
    { label: "unicode", text: "线路/🎸/e\u0301/\u2028\u2029/\ufeff/\uffff" },
    { label: "all-surrogates-isolated", text: Array.from({ length: 2048 }, (_, index) => String.fromCharCode(0xd800 + index)).join("|") },
  ];
  let seed = 0x71c051a9;
  for (let sample = 0; sample < 64; sample++) {
    const units: number[] = [];
    for (let index = 0; index < sample % 48 + 1; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      units.push(index % 3 === 0 ? 0xd800 + seed % 2048 : seed % 65536);
    }
    inputs.push({ label: `seeded-${sample}`, text: String.fromCharCode(...units) });
  }
  return {
    oracleVersion: 1,
    samples: inputs.map(({ label, text }) => {
      const units = codeUnits(text);
      return {
        label, units, token: JSON.stringify(text),
        escapedToken: `"${units.map(unit => `\\u${unit.toString(16).padStart(4, "0")}`).join("")}"`,
      };
    }),
    sortedIndices: inputs.map((_, index) => index).sort((left, right) => inputs[left]!.text < inputs[right]!.text ? -1 : inputs[left]!.text > inputs[right]!.text ? 1 : 0),
    invalidTokens: ["", "null", "0", "[]", "{}", '"', '"abc', '"a"x', '"a""b"', '"\\x00"', '"\\v"', '"\\u"', '"\\u123"', '"\\uZZZZ"', '"\\u-001"', '"\\U0000"', '"\\u{d800}"', '"\\ud800\\uXYZW"', '"a\nb"', '"\0"'],
  };
}
