import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createNotices } from "../src/runtime/notices.js";

test("notice observers cannot turn an accepted notice into a thrown operation or block the next observer", () => {
  const notices = createNotices(), seen = [];
  notices.subscribe(() => { throw new Error("notice observer fault"); });
  notices.subscribe(state => seen.push([state.entries.length, state.unread, state.latest?.text ?? null]));
  const entry = notices.push({ text: "accepted" });
  assert.equal(entry.text, "accepted");
  notices.markRead(); notices.clear();
  assert.deepEqual(seen, [[1, 1, "accepted"], [1, 0, null], [0, 0, null]]);
});

for (const mode of ["async-mount", "async-cleanup", "async-variant", "async-visible", "async-notice", "async-staff", "async-projection", "async-workspace", "async-layout-port", "async-observer-error"]) {
  test(`${mode}: contract failure does not escape as an unhandled rejection`, () => {
    const result = spawnSync(process.execPath, ["--unhandled-rejections=strict",
      fileURLToPath(new URL("./support/infrastructure-foundation-probe.js", import.meta.url)), mode],
    { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${mode}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /"healthy":true/);
  });
}
