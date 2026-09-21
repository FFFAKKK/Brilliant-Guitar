import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reportDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(reportDirectory, "../..");
const inventoryCommit = "3a7d87074d0a833576bd7e908ce26a249682c38c";
const inventoryPath = "docs/integration/2026-09-21-kernel-boundary-evidence.json";
const targets = {
  main: "269112b2d85e01827e8cb81bdcc5b671afde4303",
  score: "717cdc08eba0ecd6c9232baffa1960acbb855fdf",
  agent: "fe546976d00a6f2a76da16efbfced4c852886bb1",
  agentVerified: "cb918d0a86e7f5874b1efeb3059232d93dbad173",
  platform: "7d93aa81391cca120c5f33e36deb2b86fcc6c071",
  platformFixed: "0da94996def194ebe0b9fe159b3642398887115c",
  scoreBase: "20bf15da3b16131a1fcccbfca1838c88db7e5273",
  grantBase: "925badcf0ab58cf6199add4f74934d88fcec1823",
};

function git(...args) {
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`git ${args[0]}: ${result.stderr}`);
  }
  return result.stdout;
}

function blobHash(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function tree(commit, paths) {
  return new Map(git("ls-tree", "-rz", "--full-tree", commit, "--", ...paths)
    .split("\0").filter(Boolean).map((entry) => {
      const tab = entry.indexOf("\t");
      const [, type, hash] = entry.slice(0, tab).split(" ");
      if (type !== "blob") throw new Error(`Expected blob: ${entry}`);
      return [entry.slice(tab + 1), hash];
    }));
}

if (git("rev-parse", "--show-object-format").trim() !== "sha1") {
  throw new Error("This pinned audit requires the repository's SHA-1 object format");
}
const inventory = JSON.parse(git("show", `${inventoryCommit}:${inventoryPath}`));
const paths = [...new Set(inventory.protectedDirtyWorktrees.flatMap((item) => item.files))];
const targetTrees = new Map(Object.entries(targets).map(([name, commit]) => [name, tree(commit, paths)]));
const reachableObjects = new Set(git("rev-list", "--objects", "--all", "--", ...paths)
  .split("\n").filter(Boolean).map((line) => line.split(" ", 1)[0]));
const historicalTrees = new Map();
const groups = inventory.protectedDirtyWorktrees.map((group) => {
  const baseTree = tree(group.head, group.files);
  return {
    worktree: group.path,
    head: group.head,
    protectedInventorySha256: group.contentInventorySha256,
    files: group.files.map((relativePath) => {
      const bytes = readFileSync(path.join(group.path, relativePath));
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`Not UTF-8: ${relativePath}`);
      const rawBlob = blobHash(bytes);
      const lfBlob = blobHash(Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"));
      const matches = (hash) => hash === rawBlob || hash === lfBlob;
      const targetMatches = [...targetTrees].filter(([, files]) => matches(files.get(relativePath)))
        .map(([name]) => name);
      const historicalMatches = [];
      // History matches are verified in the commit tree, not inferred from log membership.
      if (targetMatches.length === 0) {
        for (const hash of new Set([rawBlob, lfBlob])) {
          if (!reachableObjects.has(hash)) continue;
          const commits = git("log", "--all", `--find-object=${hash}`, "--format=%H", "--", relativePath)
            .trim().split("\n").filter(Boolean);
          for (const commit of commits) {
            if (!historicalTrees.has(commit)) historicalTrees.set(commit, tree(commit, paths));
            if (historicalTrees.get(commit).get(relativePath) === hash) {
              historicalMatches.push({ commit, blob: hash });
              break;
            }
          }
        }
      }
      return {
        path: relativePath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        rawBlob,
        lfBlob,
        baseBlob: baseTree.get(relativePath) ?? null,
        sameAsWorktreeBase: matches(baseTree.get(relativePath)),
        targetMatches,
        historicalMatches,
      };
    }),
  };
});
const report = {
  schemaVersion: 1,
  date: "2026-09-21",
  inventoryCommit,
  inventoryPath,
  comparison: "Full-file Git blob equality, raw or CRLF-to-LF only; no whitespace/BOM trimming or semantic-equivalence inference",
  historyScope: "Reachable --all refs at audit time; same-path commit-tree verification for unmatched target files; not reflogs or dangling objects",
  deletionAuthorized: false,
  legacyChangesCommitted: false,
  targets,
  groups,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.length === 3 && process.argv[2] === "--write-evidence") {
  const destination = path.join(reportDirectory, "2026-09-21-legacy-comparison.json");
  writeFileSync(destination, serialized, { encoding: "utf8", flag: "wx" });
  console.log(destination);
  for (const group of groups) {
    console.log(JSON.stringify({
      worktree: group.worktree,
      files: group.files.length,
      targetMatches: group.files.filter((file) => file.targetMatches.length > 0).length,
      historyOnly: group.files.filter((file) => file.historicalMatches.length > 0).length,
      unmatched: group.files.filter((file) => file.targetMatches.length === 0
        && file.historicalMatches.length === 0).map((file) => file.path),
    }));
  }
} else if (process.argv.length === 2) {
  process.stdout.write(serialized);
} else {
  throw new Error("Usage: node 2026-09-21-compare-legacy.mjs [--write-evidence]");
}
