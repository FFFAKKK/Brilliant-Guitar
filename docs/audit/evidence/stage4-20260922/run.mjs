import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
assert.equal(git("branch", "--show-current"), "codex/audit-close-save-recovery-stage1");
const baseline = "eae40757681a3aa6810ee63ac70ea8f880687994";
assert.equal(git("diff", "--name-only", baseline, "--", "apps", "crates", "src"), "");
const parent = resolve(root, ".local-evidence/coordinator-stage4");
mkdirSync(parent, { recursive: true });
const output = mkdtempSync(join(parent, "run-"));
const env = { ...process.env, AUDIT_STAGE4_OUTPUT: output };
const inputs = ["stage1-20260922/Cargo.toml", "stage1-20260922/Cargo.lock",
  ...["run.mjs", "contracts.rs", "edit-cases.json", "node-boundaries.test.mjs"].map((name) => `stage4-20260922/${name}`)];
writeFileSync(join(output, "run.json"), JSON.stringify({
  sourceCommit: git("rev-parse", "HEAD"), productionBaseline: baseline,
  createdAt: new Date().toISOString(), node: process.version,
  evidenceSha256: Object.fromEntries(inputs.map((path) => [path,
    createHash("sha256").update(readFileSync(resolve(root, "docs/audit/evidence", path))).digest("hex")])),
  note: "Characterization only; generated data is isolated and no product GUI is launched.",
}, null, 2));
console.log(`Stage 4 evidence: ${output}`);

function run(name, command, args) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(output, `${name}.stdout.log`), result.stdout ?? "");
  writeFileSync(join(output, `${name}.stderr.log`), result.stderr ?? "");
  writeFileSync(join(output, `${name}.result.json`), JSON.stringify({
    command, args, status: result.status, signal: result.signal, error: result.error?.message,
  }, null, 2));
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${command} terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${command} exited ${result.status}`);
}

run("rust", "cargo", ["+1.97.1", "test",
  "--manifest-path", "docs/audit/evidence/stage1-20260922/Cargo.toml",
  "--locked", "--offline", "--target-dir", ".local-evidence/coordinator-stage1/target",
  "--test", "cross-host-contract", "audit_"]);
run("node", process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=spec",
  "docs/audit/evidence/stage4-20260922/node-boundaries.test.mjs"]);
