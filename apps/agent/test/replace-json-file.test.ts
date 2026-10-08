import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { replaceJsonFile } from "../src/server/replace-json-file.ts";

test("transient Windows replacement locks retry the same atomic rename with bounded delays", async (t) => {
  const root = resolve(import.meta.dirname, "../../../.tmp/agent-replacement-tests");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, "replace-"));
  t.after(async () => { assert.ok(directory !== root && !relative(root, directory).startsWith("..")); await rm(directory, { recursive: true, force: true }); });
  const source = resolve(directory, "new.tmp"), target = resolve(directory, "sessions.json");
  await writeFile(source, "new-complete-file"); await writeFile(target, "old-complete-file");
  const pauses: number[] = [];
  let calls = 0;
  await replaceJsonFile(source, target, { platform: "win32", pause: async (ms) => { pauses.push(ms); }, replace: async (from, to) => {
    assert.equal(from, source); assert.equal(to, target); ++calls;
    if (calls <= 2) { assert.equal(await readFile(target, "utf8"), "old-complete-file"); throw Object.assign(new Error("locked"), { code: "EPERM" }); }
    await rename(from, to);
  } });
  assert.equal(calls, 3); assert.deepEqual(pauses, [20, 40]); assert.equal(await readFile(target, "utf8"), "new-complete-file");
  await assert.rejects(readFile(source), { code: "ENOENT" });
});

test("persistent Windows locks stop after four attempts and propagate the original error", async () => {
  const failure = Object.assign(new Error("persistent lock"), { code: "EPERM" });
  const pauses: number[] = []; let calls = 0;
  await assert.rejects(replaceJsonFile("same-source", "same-target", { platform: "win32", pause: async (ms) => { pauses.push(ms); },
    replace: async () => { ++calls; throw failure; } }), (error) => error === failure);
  assert.equal(calls, 4); assert.deepEqual(pauses, [20, 40, 80]);
});

test("other errors and non-Windows permission errors fail immediately", async () => {
  for (const [platform, code] of [["linux", "EPERM"], ["win32", "ENOENT"], ["win32", "EACCES"]] as const) {
    const failure = Object.assign(new Error("write failed"), { code }); let calls = 0;
    await assert.rejects(replaceJsonFile("source", "target", { platform, replace: async () => { ++calls; throw failure; },
      pause: async () => { assert.fail("must not delay unrelated errors"); } }), (error) => error === failure);
    assert.equal(calls, 1);
  }
});
