// Input must already be a data-only capture or a private host record. JSON's
// ordinary number spelling loses -0; this versioned transport retains it.
const stringify = JSON.stringify;
const is = Object.is;
const keys = Object.keys;
const isArray = Array.isArray;
const from = Buffer.from;
const apply = Reflect.apply;
const join = Array.prototype.join;

export function encodeIntegratedValueV2(input: unknown): Buffer {
  function encode(value: unknown, depth: number): string {
    if (depth > 72) throw new TypeError("Integrated transport depth exceeded");
    if (value === null) return "null";
    if (typeof value === "number") return is(value, -0) ? "-0" : stringify(value);
    if (typeof value === "string" || typeof value === "boolean") return stringify(value);
    if (typeof value !== "object") throw new TypeError("Expected captured transport data");
    const parts: string[] = [];
    if (isArray(value)) {
      for (let index = 0; index < value.length; index += 1) parts[index] = encode(value[index], depth + 1);
      return `[${apply(join, parts, [","]) as string}]`;
    }
    for (const key of keys(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) parts[parts.length] = `${stringify(key)}:${encode(child, depth + 1)}`;
    }
    return `{${apply(join, parts, [","]) as string}}`;
  }
  return apply(from, Buffer, [encode(input, 0), "utf8"]) as Buffer;
}
