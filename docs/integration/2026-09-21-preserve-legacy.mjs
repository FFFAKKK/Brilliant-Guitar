import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["--create", "--verify"].includes(mode)) {
  throw new Error("Usage: node 2026-09-21-preserve-legacy.mjs --create|--verify");
}
const reportDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(reportDirectory, "../..");
const auditCommit = "430a92076a94e36dba7ed8a3b55dcbf0c9c85f03";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function git(cwd, ...args) {
  const result = spawnSync("git", ["--no-optional-locks", "-C", cwd, ...args], {
    maxBuffer: 32 * 1024 * 1024, timeout: 120_000, windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`git ${args[0]}: ${result.stderr?.toString()}`);
  }
  return result.stdout;
}

const comparison = JSON.parse(git(repository, "show",
  `${auditCommit}:docs/integration/2026-09-21-legacy-comparison.json`));
const disposition = JSON.parse(git(repository, "show",
  `${auditCommit}:docs/integration/2026-09-21-legacy-disposition.json`));
const root = realpathSync(disposition.worktrees.main);
const archiveParent = realpathSync(path.join(root, ".repo-archive"));
assert.equal(archiveParent, path.join(root, ".repo-archive"), "Archive parent must not be redirected");
const archive = path.join(archiveParent, "2026-09-21-legacy-preservation");
const receiptPath = path.join(reportDirectory, "2026-09-21-legacy-preservation.json");

function inside(base, relative) {
  assert.ok(relative.length > 0 && !path.isAbsolute(relative));
  const destination = path.resolve(base, relative);
  const tail = path.relative(base, destination);
  assert.ok(tail && !tail.startsWith(`..${path.sep}`) && tail !== ".." && !path.isAbsolute(tail));
  return destination;
}

function regularFile(file) {
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Not a regular file: ${file}`);
  return readFileSync(file);
}

function writeNew(relative, bytes) {
  const destination = inside(archive, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, bytes, { flag: "wx" });
}

function state(group) {
  assert.equal(git(group.worktree, "rev-parse", "HEAD").toString().trim(), group.head);
  const status = git(group.worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all");
  const records = status.toString("utf8").split("\0").filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    assert.ok(code === " M" || code === "??", `Unexpected index/deletion/rename state: ${line}`);
    return { path: line.slice(3), status: code };
  });
  assert.deepEqual(records.map((item) => item.path).sort(), group.files.map((item) => item.path).sort());
  const branch = git(group.worktree, "branch", "--show-current").toString().trim() || null;
  for (const file of group.files) {
    assert.equal(sha256(regularFile(inside(group.worktree, file.path))), file.sha256, `Changed source: ${file.path}`);
  }
  return { branch, status, records };
}

function verifyPayload(manifest) {
  assert.equal(manifest.auditCommit, auditCommit);
  assert.equal(manifest.groups.length, comparison.groups.length);
  let restoredFiles = 0;
  let totalBytes = 0;
  for (const group of manifest.groups) {
    const frozen = comparison.groups.find((item) => item.worktree === group.worktree);
    assert.ok(frozen);
    assert.equal(group.head, frozen.head);
    assert.equal(group.files.length, frozen.files.length);
    assert.deepEqual(group.files.map((item) => item.path).sort(), frozen.files.map((item) => item.path).sort());
    for (const file of group.files) {
      const expected = frozen.files.find((item) => item.path === file.path);
      assert.equal(file.sha256, expected.sha256);
      const snapshot = regularFile(inside(archive, file.snapshot));
      const restored = regularFile(inside(archive, file.restored));
      assert.equal(sha256(snapshot), expected.sha256);
      assert.equal(snapshot.length, file.bytes);
      assert.ok(snapshot.equals(restored), `Restore mismatch: ${file.path}`);
      restoredFiles++;
      totalBytes += snapshot.length;
    }
    assert.equal(sha256(regularFile(inside(archive, group.patch.path))), group.patch.sha256);
    const current = state(frozen);
    assert.equal(current.branch, group.branch);
    assert.equal(sha256(current.status), group.statusSha256);
  }
  assert.equal(restoredFiles, 85);
  return { restoredFiles, totalBytes, sourceFilesUnchanged: true, indexesEmpty: true };
}

if (mode === "--create") {
  assert.ok(!existsSync(archive), "Archive already exists; refusing to overwrite");
  assert.ok(!existsSync(receiptPath), "Receipt already exists; refusing to overwrite");
  git(root, "check-ignore", path.join(archive, "manifest.json"));
  const before = comparison.groups.map((group) => state(group));
  mkdirSync(archive);
  const groups = comparison.groups.map((group, index) => {
    const id = Object.keys(disposition.worktrees).find((key) => disposition.worktrees[key] === group.worktree);
    assert.ok(id && /^[a-z0-9]+$/.test(id));
    const patch = git(group.worktree, "diff", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", "HEAD", "--");
    const patchPath = `patches/${id}.patch`;
    writeNew(patchPath, patch);
    const files = group.files.map((file) => {
      const bytes = regularFile(inside(group.worktree, file.path));
      assert.equal(sha256(bytes), file.sha256);
      const snapshot = `snapshot/${id}/${file.path}`;
      const restored = `restore-rehearsal/${id}/${file.path}`;
      writeNew(snapshot, bytes);
      // The rehearsal reads the backup, never the original working copy.
      writeNew(restored, regularFile(inside(archive, snapshot)));
      return { path: file.path, status: before[index].records.find((item) => item.path === file.path).status,
        snapshot, restored, bytes: bytes.length, sha256: file.sha256 };
    });
    return { id, worktree: group.worktree, head: group.head, branch: before[index].branch,
      statusSha256: sha256(before[index].status), patch: { path: patchPath, bytes: patch.length, sha256: sha256(patch) }, files };
  });
  const manifest = {
    schemaVersion: 1, date: "2026-09-21", createdAt: new Date().toISOString(), auditCommit,
    scope: "85 reviewed dirty file contents and four tracked patches; not a full repository, Git history, ignored artifact or off-machine backup",
    restoration: "Restore only into a separately reviewed destination at the recorded base HEAD. Raw snapshot files preserve untracked files and original line endings. No command here restores into an original worktree.",
    originalsRetained: true, cleanupAuthorized: false, groups,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeNew("manifest.json", manifestBytes);
  const verified = verifyPayload(manifest);
  const receipt = { schemaVersion: 1, date: "2026-09-21", auditCommit, archive,
    manifestSha256: sha256(manifestBytes), ...verified, worktrees: groups.length,
    modified: groups.flatMap((group) => group.files).filter((file) => file.status === " M").length,
    untracked: groups.flatMap((group) => group.files).filter((file) => file.status === "??").length,
    originalsRetained: true, originalWorktreesRestoredInto: false, cleanupAuthorized: false,
    backupScope: manifest.scope };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  writeNew("verified.json", receiptBytes);
  writeFileSync(receiptPath, receiptBytes, { flag: "wx" });
  console.log(JSON.stringify(receipt, null, 2));
} else {
  const manifestBytes = regularFile(path.join(archive, "manifest.json"));
  const receipt = JSON.parse(regularFile(path.join(archive, "verified.json")));
  assert.equal(sha256(manifestBytes), receipt.manifestSha256);
  assert.deepEqual(JSON.parse(regularFile(receiptPath)), receipt);
  console.log(JSON.stringify({ archive, ...verifyPayload(JSON.parse(manifestBytes)) }, null, 2));
}
