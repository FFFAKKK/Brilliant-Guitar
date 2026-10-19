import { readFile } from "node:fs/promises";

/** Shared resolver for classic local-file entries; the original loader stays authoritative. */
export function classicNotationAssetPlugin() {
  return { name: "classic-notation-asset", setup(build) {
    build.onLoad({ filter: /[\\/]score[\\/]vexflow-runtime\.js$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const before = 'new URL("../vendor/vexflow-bravura.js", import.meta.url).href';
      if (!source.includes(before)) throw new Error("Notation asset resolver changed; review classic preview adapter");
      return { contents: source.replace(before, 'new URL("src/vendor/vexflow-bravura.js", document.baseURI).href'), loader: "js" };
    });
  } };
}
