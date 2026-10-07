import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "brilliant-agent-isolated-"));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check through npm run test:standalone");
function command(args, cwd) {
  const result = spawnSync(process.execPath, [npm, "--cache", join(scratch, "cache"), ...args], { cwd, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Package validation failed");
  return result.stdout;
}
const packed = JSON.parse(command(["pack", "--json", "--pack-destination", scratch], root))[0];
writeFileSync(join(scratch, "package.json"), '{"private":true,"type":"module"}');
command(["install", join(scratch, packed.filename), "--cache", join(scratch, "cache"), "--no-audit", "--no-fund"], scratch);
writeFileSync(join(scratch, "smoke.mjs"), `
import assert from 'node:assert/strict';
import { createAgentSession } from '@brilliant-guitar/agent-runtime';
const session = createAgentSession({ provider: { decide: async () => ({ kind: 'finish', reason: 'completed', text: 'isolated response' }) } });
await session.setEnabled(true);
assert.equal((await session.submit('headless standalone')).response, 'isolated response');
assert.equal(session.getSnapshot().status, 'completed');
await session.dispose();
console.log('Packed Agent runs without Guitar, Workbench, Tauri or UI.');
`);
const result = spawnSync(process.execPath, [join(scratch, "smoke.mjs")], { cwd: scratch, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
if (result.status !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
