import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("../", import.meta.url));
const result = await build({ absWorkingDir: directory, stdin: { contents: 'export { animate } from "motion"; export { animate as animateDom } from "motion/mini";', resolveDir: directory, sourcefile: "motion-review-entry.js" }, bundle: true,
  format: "esm", target: "es2022", minify: true, write: false, legalComments: "inline", banner: { js: "// Motion 14.0.0 · MIT · review-only local bundle. See motion-review.LICENSE.txt." } });
const output = new URL("../vendor/motion-review.js", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== result.outputFiles[0].text) throw new Error("Motion bundle is stale; run npm run motion:build");
} else {
  await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
  await writeFile(output, result.outputFiles[0].text);
  const licenses = await Promise.all(["motion", "framer-motion", "motion-dom", "motion-utils", "tslib"].map(async name => `${name}\n${await readFile(new URL(`../node_modules/${name}/${name === "tslib" ? "LICENSE.txt" : "LICENSE.md"}`, import.meta.url), "utf8")}`));
  await writeFile(new URL("../vendor/motion-review.LICENSE.txt", import.meta.url), licenses.join("\n\n"));
}
console.log(`Motion review bundle ${process.argv.includes("--check") ? "verified" : "built"}: ${result.outputFiles[0].contents.length} bytes`);
