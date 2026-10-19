import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createNotationCapacityFiles } from "./notation-capacity-assets.mjs";
import { frameRoot, isWithin } from "./author-validation-kit.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && args[0] !== "--check") throw new Error("Usage: build-notation-capacity.mjs [--check]");
const check = args[0] === "--check", root = await realpath(frameRoot), { files } = await createNotationCapacityFiles();
for (const [path, bytes] of files) {
  const target = join(root, path); if (!check) await mkdir(dirname(target), { recursive: true });
  if (!isWithin(root, await realpath(dirname(target)))) throw new Error("Capacity output parent must stay in the frame workspace");
  try { if ((await lstat(target)).isSymbolicLink() || !isWithin(root, await realpath(target))) throw new Error("Capacity output must not be linked or leave the frame workspace"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (check) { if (!(await readFile(target)).equals(bytes)) throw new Error(`Capacity artifact is stale: ${path}`); }
  else await writeFile(target, bytes);
}
console.log(`Notation capacity ${check ? "verified" : "built"}: ${files.size} artifacts; browser qualification pending`);
