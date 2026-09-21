import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { historicalSnapshot } from "./historical-snapshot";

test("historical inputs ignore local edits, untracked files and later commits", () => {
  const root = mkdtempSync(join(tmpdir(), "historical-snapshot-"));
  const git = (args: readonly string[], input?: string): string => execFileSync(
    "git",
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", ...(input === undefined ? {} : { input }) },
  ).trim();
  try {
    git(["init", "--quiet"]);
    mkdirSync(join(root, "archive", "child"), { recursive: true });
    writeFileSync(join(root, "archive", "task.json"), '{"status":"completed"}\n');
    writeFileSync(join(root, "archive", "child", "facts.txt"), "frozen\n");
    writeFileSync(join(root, "archive", "literal[1].txt"), "literal\n");
    git(["add", "--", "archive"]);
    const link = git(["hash-object", "-w", "--stdin"], "archive/task.json\n");
    git(["update-index", "--add", "--cacheinfo", `120000,${link},link`]);
    git(["commit", "--quiet", "-m", "fixture"]);
    const commit = git(["rev-parse", "HEAD"]);
    const snapshot = historicalSnapshot(commit, root);
    assert.equal(snapshot.commit, commit);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.deepEqual(snapshot.directoriesUnder("archive"), ["child"]);
    assert.deepEqual(snapshot.filesUnder("archive"), ["child/facts.txt", "literal[1].txt", "task.json"]);
    assert.equal(snapshot.readText("archive/literal[1].txt"), "literal\n");

    const detached = snapshot.readBytes("archive/task.json");
    detached.fill(0);
    snapshot.filesUnder("archive").pop();
    writeFileSync(join(root, "archive", "task.json"), '{"status":"changed"}\n');
    writeFileSync(join(root, "archive", "untracked.txt"), "not historical\n");
    git(["add", "--", "archive/task.json"]);
    git(["commit", "--quiet", "-m", "later"]);
    assert.equal(snapshot.readText("archive/task.json"), '{"status":"completed"}\n');
    assert.equal(historicalSnapshot(commit, root).readText("archive/task.json"), '{"status":"completed"}\n');
    assert.equal(snapshot.hasPath("archive/untracked.txt"), false);
    assert.equal(snapshot.filesUnder("archive").length, 3);
    assert.throws(() => snapshot.readText("archive/untracked.txt"), /Historical file missing/u);
    assert.throws(() => snapshot.filesUnder("missing"), /Historical directory missing/u);
    assert.throws(() => snapshot.readText("archive"), /Historical file missing/u);
    assert.throws(() => snapshot.hasPath("link"), /not a regular file/u);
    for (const path of ["", "/archive", "../archive", "archive/../task", "archive//task", "C:/archive", "archive\\task", "archive\0task"]) {
      assert.throws(() => snapshot.hasPath(path), /repository-relative path/u);
    }
    assert.throws(() => historicalSnapshot("HEAD", root), /full commit SHA/u);
    assert.throws(() => historicalSnapshot("0".repeat(40), root));
    assert.throws(() => historicalSnapshot(git(["rev-parse", `${commit}^{tree}`]), root), /not a commit/u);
    assert.throws(() => historicalSnapshot(commit, join(root, "missing")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
