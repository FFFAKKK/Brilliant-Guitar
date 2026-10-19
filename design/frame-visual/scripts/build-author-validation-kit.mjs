import { mkdir, lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAuthorKitFiles, frameRoot } from "./author-validation-kit.mjs";

const check = process.argv.includes("--check");
const files = await createAuthorKitFiles();
const parent = join(frameRoot, "dist"), output = join(parent, "author-validation");
if (!check) await mkdir(parent, { recursive: true });
if (await realpath(parent) !== parent) throw new Error("Author output parent must stay in the frame workspace");
try {
  if ((await lstat(output)).isSymbolicLink() || await realpath(output) !== output) throw new Error("Author output must not be a reparse point");
  const actual = await readdir(output);
  if (actual.some(name => !files.has(name)) || check && actual.length !== files.size) {
    throw new Error("Unexpected author output files; keep submissions in a separate directory");
  }
} catch (error) { if (check || error.code !== "ENOENT") throw error; }
if (!check) await mkdir(output, { recursive: true });
for (const [name, bytes] of files) {
  if (check) {
    if (!(await readFile(join(output, name))).equals(bytes)) throw new Error(`Author output is stale: ${name}`);
  } else {
    try { if (!(await lstat(join(output, name))).isFile()) throw new Error("Author output files must be regular files"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeFile(join(output, name), bytes);
  }
}
console.log(`Author validation kit ${check ? "verified" : "built"}: ${files.size} files; public SDK only → ${output}`);
