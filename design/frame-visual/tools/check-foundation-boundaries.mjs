import { join } from "node:path";
import { projectRoot } from "../scripts/author-validation-kit.mjs";
import { runFoundationChecks } from "../scripts/foundation-boundary-check.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1])) throw new Error("Usage: check-foundation-boundaries.mjs [--output <new-directory>]");
const label = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const output = args[1] ?? join(projectRoot, "design/frame-visual/evidence", `foundation-boundary-check-${label}`);
const report = await runFoundationChecks({ output, onProgress: text => console.log(text) });
console.log(`Boundary regression ${report.status}; overall qualification pending. Report: ${join(report.directory, "report.json")}`);
process.exitCode = report.status === "passed" ? 0 : 1;
