import { join } from "node:path";
import { runAuthorSubmissionChecks } from "../scripts/author-submission-check.mjs";

const args = process.argv.slice(2), options = {};
if (args.length !== 4) throw new Error("Provide --directory <submission> --output <new-workspace-directory>");
for (let index = 0; index < args.length; index += 2) {
  const name = args[index], value = args[index + 1];
  if (!["--directory", "--output"].includes(name) || !value || value.startsWith("--") || options[name]) {
    throw new Error("Provide unique --directory and --output arguments");
  }
  options[name] = value;
}
const report = await runAuthorSubmissionChecks({ directory: options["--directory"], output: options["--output"] });
console.log(`Author submission ${report.status}; independent qualification pending. Report: ${join(report.directory, "report.json")}`);
process.exitCode = report.status === "passed" ? 0 : 1;
