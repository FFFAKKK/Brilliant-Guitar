import { spawn } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { isWithin, projectRoot } from "./author-validation-kit.mjs";

export async function createEvidenceDirectory(output) {
  const root = await realpath(projectRoot), requested = resolve(projectRoot, output);
  const parent = await realpath(dirname(requested));
  if (!isWithin(root, requested) || !isWithin(root, parent)) throw new Error("Evidence output must stay in the project workspace");
  const destination = join(parent, basename(requested));
  await mkdir(destination); // Existing runs, including links, are never reused.
  return destination;
}

function testCounts(text) {
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const values = [...text.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, "gm"))];
    counts[key] = values.length === 1 ? Number(values[0][1]) : null;
  }
  return counts;
}

/** Shared engineering check, not a sandbox for code running in the child. */
export async function runVerificationProcess({ args, test = false, timeoutMs = 60000, env = process.env }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("Verification timeout must be positive");
  const result = await new Promise(resolveResult => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", error = null, timedOut = false;
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", bytes => { stdout += bytes; }); child.stderr.on("data", bytes => { stderr += bytes; });
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once("error", failure => { error = failure.message; });
    child.once("close", (exitCode, signal) => { clearTimeout(timeout); resolveResult({ exitCode, signal, timedOut, error, stdout, stderr }); });
  });
  const counts = test ? testCounts(result.stdout) : null;
  const completeTests = !test || counts.tests > 0 && counts.pass === counts.tests
    && ["fail", "cancelled", "skipped", "todo"].every(key => counts[key] === 0);
  return { ...result, command: [process.execPath, ...args], counts,
    status: result.exitCode === 0 && result.signal === null && !result.timedOut && !result.error && completeTests ? "passed" : "failed" };
}
