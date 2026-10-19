import { readFile, writeFile } from "node:fs/promises";
const source = new URL("../../../shared/ui-animation/contract.js", import.meta.url);
const output = new URL("../src/vendor/animation-contract.js", import.meta.url);
export async function animationContractOutput() {
  return "// Generated from shared/ui-animation/contract.js. Run node scripts/build-animation-contract.mjs; edit the shared source.\n" + await readFile(source, "utf8");
}
const expected = await animationContractOutput();
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== expected) throw new Error("Animation contract is stale; run node scripts/build-animation-contract.mjs");
} else await writeFile(output, expected);
