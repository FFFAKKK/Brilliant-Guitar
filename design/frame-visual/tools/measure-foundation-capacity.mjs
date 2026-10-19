import { realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureCapacityBaseline } from "./foundation-capacity.mjs";

const args = process.argv.slice(2), index = args.indexOf("--output");
const report = await measureCapacityBaseline();
if (index >= 0) {
  if (!args[index + 1]) throw new Error("Missing --output path");
  const target = resolve(args[index + 1]), root = await realpath(fileURLToPath(new URL("../../../", import.meta.url)));
  const parent = await realpath(dirname(target)), tail = relative(root, parent);
  if (isAbsolute(tail) || tail === ".." || tail.startsWith("..\\") || tail.startsWith("../")) throw new Error("Capacity output must stay in the project workspace");
  await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  console.log(`Capacity baseline recorded: ${report.cases.map(item => item.measures).join("/")} measures; G6 pending. Report: ${target}`);
} else console.log(JSON.stringify(report, null, 2));
