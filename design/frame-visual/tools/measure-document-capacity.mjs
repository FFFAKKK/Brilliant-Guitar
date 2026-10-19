import { measureDocumentCapacity } from "./document-capacity.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output" || !args[1]) throw new Error("Usage: measure-document-capacity.mjs --output <new-workspace-directory>");
const report = await measureDocumentCapacity({ output: args[1] });
console.log(JSON.stringify({ status: report.status, qualificationG6: report.qualificationG6, directory: report.directory,
  cases: report.cases.map(item => ({ name: item.name, measures: item.measures, events: item.events, pages: item.pages, p95Ms: item.stats.totalToLayoutMs.p95 })),
  error: report.error, changedFiles: report.changedFiles }));
process.exitCode = report.status === "baseline-only" ? 0 : 1;
