import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

type TreeEntry = Readonly<{ mode: string; type: string; name: string }>;

function requirePath(path: string): void {
  if (
    path === "" ||
    /[\\:\0]/u.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Historical snapshot requires a repository-relative path: ${path}`);
  }
}

function parseEntries(raw: Buffer): TreeEntry[] {
  return raw.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const match = /^([0-7]{6}) (blob|tree|commit) [0-9a-f]{40}\t([\s\S]+)$/u.exec(record);
    if (match === null) throw new Error("Invalid historical Git tree entry");
    return { mode: match[1]!, type: match[2]!, name: match[3]! };
  });
}

function requireRegularEntry(entry: TreeEntry): void {
  if (
    (entry.type === "tree" && entry.mode === "040000") ||
    (entry.type === "blob" && ["100644", "100755"].includes(entry.mode))
  ) return;
  throw new Error(`Historical input is not a regular file or tree: ${entry.name}`);
}

// Historical task facts come from immutable Git objects, never ignored local state.
export function historicalSnapshot(commit: string, repository = process.cwd()) {
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error("Historical snapshot requires a full commit SHA");
  }
  const cwd = resolve(repository);
  const git = (args: readonly string[]): Buffer => execFileSync(
    "git",
    ["--no-replace-objects", "--literal-pathspecs", ...args],
    { cwd, maxBuffer: 80 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
  if (git(["cat-file", "-t", commit]).toString("utf8").trim() !== "commit") {
    throw new Error(`Historical snapshot is not a commit: ${commit}`);
  }
  const entries = new Map<string, TreeEntry | null>();
  const bytes = new Map<string, Buffer>();
  const listing = new Map<string, readonly string[]>();
  const entryAt = (path: string): TreeEntry | null => {
    requirePath(path);
    if (!entries.has(path)) {
      const found = parseEntries(git(["ls-tree", "-z", commit, "--", path]));
      if (found.length > 1 || (found[0] !== undefined && found[0].name !== path)) {
        throw new Error(`Historical path did not resolve exactly: ${path}`);
      }
      if (found[0] !== undefined) requireRegularEntry(found[0]);
      entries.set(path, found[0] ?? null);
    }
    return entries.get(path)!;
  };
  const readBytes = (path: string): Buffer => {
    if (entryAt(path)?.type !== "blob") {
      throw new Error(`Historical file missing at ${commit}: ${path}`);
    }
    if (!bytes.has(path)) bytes.set(path, git(["cat-file", "blob", `${commit}:${path}`]));
    return Buffer.from(bytes.get(path)!);
  };
  const requireTree = (path: string): void => {
    if (entryAt(path)?.type !== "tree") {
      throw new Error(`Historical directory missing at ${commit}: ${path}`);
    }
  };
  return Object.freeze({
    commit,
    hasPath: (path: string): boolean => entryAt(path) !== null,
    readBytes,
    readText: (path: string): string => readBytes(path).toString("utf8"),
    filesUnder(path: string): string[] {
      requireTree(path);
      if (!listing.has(path)) {
        const found = parseEntries(git(["ls-tree", "-r", "-z", commit, "--", path]));
        for (const entry of found) {
          requireRegularEntry(entry);
          if (entry.type !== "blob" || !entry.name.startsWith(`${path}/`)) {
            throw new Error(`Historical directory contains an invalid entry: ${entry.name}`);
          }
        }
        listing.set(path, found.map((entry) => entry.name.slice(path.length + 1)).sort());
      }
      return [...listing.get(path)!];
    },
    directoriesUnder(path: string): string[] {
      requireTree(path);
      const found = parseEntries(git(["ls-tree", "-z", `${commit}:${path}`]));
      for (const entry of found) requireRegularEntry(entry);
      return found.filter((entry) => entry.type === "tree").map((entry) => entry.name).sort();
    },
  });
}
