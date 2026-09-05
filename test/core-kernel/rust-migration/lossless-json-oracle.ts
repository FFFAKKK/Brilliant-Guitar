import { createJsStringOracle } from "./js-string-oracle";

/** Canonical object order is UTF-16 lexical, including integer-looking keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createLosslessJsonOracle() {
  const strings = createJsStringOracle().samples;
  const values: Array<{ label: string; value: unknown }> = [
    { label: "null", value: null }, { label: "booleans", value: [true, false] },
    { label: "empty-containers", value: [[], {}] },
    { label: "numbers", value: [0, -0, 0.125, 120.5, Number.MIN_VALUE, Number.MAX_VALUE, 1e100, -1e100] },
    { label: "numeric-keys", value: { "2": "two", "10": "ten", "00": "zero", a: "last" } },
  ];
  for (const sample of strings) {
    const text = String.fromCharCode(...sample.units);
    values.push({ label: sample.label, value: { title: text, payload: { [text]: [text, { nested: text }, null, true, 0.125] } } });
  }
  return {
    oracleVersion: 1,
    samples: values.map(({ label, value }) => ({ label, input: JSON.stringify(value), canonical: canonical(value) })),
    alternateInputs: [
      { input: " \r\n\t{\"\\u0061\": [1e0, -0.0, 1.25e+2, \"\\/\\uD800\"]}\t", canonical: '{"a":[1,0,125,"/\\ud800"]}' },
      { input: '{"\\uD800\\uDC00":true,"\\uDC00":false,"\\uE000":null}', canonical: '{"𐀀":true,"\\udc00":false,"":null}' },
    ],
    duplicates: ['{"a":1,"\\u0061":2}', '{"\\uD800":0,"\\ud800":1}', '{"a":{"z":0,"z":1}}', '{"🎸":0,"\\ud83c\\udfb8":1}'],
    invalidSyntax: ["", " ", "null true", "truefalse", "[1,]", "{\"a\":1,}", "[", "{", "[}", "{]", "{\"a\" 1}", "{1:2}", "[1 2]", "[1:2]", "{\"a\":}", "01", "-", "1.", ".1", "+1", "1e", "1e+", "1e400", "NaN", "Infinity", "undefined", '"\\x00"', '"\\ud800\\u123"', '"a\nb"', '"a"x', "\u00a0null"],
  };
}
