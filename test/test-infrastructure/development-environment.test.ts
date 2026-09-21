import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";

interface Source {
  commit: string;
  tree: string;
  worktree: string;
  inputs: string[];
  inputSha256: string;
}
const environment = require(resolve(__dirname, "../../../scripts/development-environment.mjs")) as {
  profile: { rust: string };
  sha256: (bytes: string | Buffer) => string;
  captureSource: (root: string, base: string, desktop?: boolean) => Source;
  ownedPath: (root: string, path: string, create?: boolean) => string;
  assertBuildEnvironment: (root: string, env: Record<string, string>) => void;
  checkDependencies: (root: string) => { installedPackages: number }[];
  validateArtifact: (root: string, manifest: unknown, base: string) => unknown;
};

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brilliant-environment-")));
  const write = (path: string, value: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const git = (args: string[]) => execFileSync("git", [
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args,
  ], { cwd: root, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  const commit = () => {
    git(["add", "--", "."]);
    git(["commit", "--quiet", "-m", "fixture"]);
    return git(["rev-parse", "HEAD"]);
  };
  git(["init", "--quiet"]);
  write(".gitignore", "target/\nnode_modules/\n");
  write("crates/example.rs", "// fixture\n");
  write("scripts/example.mjs", "// fixture\n");
  write("apps/desktop/example.ts", "// desktop fixture\n");
  const base = commit();
  return {
    root, write, git, commit, base,
    dispose: () => {
      assert.equal(dirname(root), realpathSync(tmpdir()));
      assert.ok(basename(root).startsWith("brilliant-environment-"));
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("environment source capture rejects floating, missing, dirty and hidden sources", () => {
  const f = fixture();
  try {
    assert.equal(environment.captureSource(f.root, f.base).commit, f.base);
    assert.throws(() => environment.captureSource(f.root, "HEAD"), /full base commit/u);
    assert.throws(() => environment.captureSource(f.root, "0".repeat(40)));
    assert.throws(() => environment.captureSource(f.root, f.git(["rev-parse", "HEAD^{tree}"])));
    f.write("crates/example.rs", "// changed\n");
    assert.throws(() => environment.captureSource(f.root, f.base), /clean/u);
    f.git(["update-index", "--assume-unchanged", "--", "crates/example.rs"]);
    assert.throws(() => environment.captureSource(f.root, f.base), /Hidden index flags/u);
    f.git(["update-index", "--no-assume-unchanged", "--", "crates/example.rs"]);
    f.write("crates/example.rs", "// fixture\n");
    f.write("untracked.txt", "new\n");
    assert.throws(() => environment.captureSource(f.root, f.base), /clean/u);
    f.git(["add", "--", "untracked.txt"]);
    assert.throws(() => environment.captureSource(f.root, f.base), /clean/u);
  } finally {
    f.dispose();
  }
});

function addonFixture(f: ReturnType<typeof fixture>) {
  const bytes = "fake addon, never loaded";
  const artifact = { path: "target/artifacts/fake.node", bytes: Buffer.byteLength(bytes), sha256: environment.sha256(bytes) };
  const defaultPath = "target/integrated-v2/brilliant_kernel_node.node";
  f.write(artifact.path, bytes);
  f.write(defaultPath, bytes);
  return {
    kind: "development-artifact-v1", variant: "integrated-v2",
    source: environment.captureSource(f.root, f.base),
    platform: process.platform, arch: process.arch, tools: { cargoPath: "fixture-cargo" },
    artifact, defaultPath,
    build: {
      command: "fixture-cargo", targetDirectory: "target/development-build/integrated-v2",
      args: [`+${environment.profile.rust}`, "build", "-p", "brilliant-kernel-node", "--release",
        "--locked", "--offline", "--target-dir", "target/development-build/integrated-v2",
        "--features", "integrated-bridge-v2"],
    },
  };
}

test("artifact provenance permits documentation descendants but rejects stale native inputs", () => {
  const f = fixture();
  try {
    const manifest = addonFixture(f);
    environment.validateArtifact(f.root, manifest, f.base);
    f.write("docs/report.md", "report\n");
    f.commit();
    environment.validateArtifact(f.root, manifest, f.base);
    f.write("crates/example.rs", "// new implementation\n");
    f.commit();
    assert.throws(() => environment.validateArtifact(f.root, manifest, f.base), /stale/u);
  } finally {
    f.dispose();
  }
});

test("artifact validation rejects mismatched ownership, hashes, arguments and default output", () => {
  const f = fixture();
  try {
    const manifest = addonFixture(f);
    const mutations: ((value: typeof manifest) => void)[] = [
      (value) => { value.source.worktree = join(f.root, "other"); },
      (value) => { value.artifact.sha256 = "0".repeat(64); },
      (value) => { value.artifact.path = "../outside.node"; },
      (value) => { value.build.args.push("--all-features"); },
      (value) => { value.build.targetDirectory = "../other"; },
      (value) => { value.source.inputSha256 = "0".repeat(64); },
      (value) => { value.source.tree = "0".repeat(40); },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(manifest);
      mutate(changed);
      assert.throws(() => environment.validateArtifact(f.root, changed, f.base));
    }
    f.write(manifest.defaultPath, "different addon");
    assert.throws(() => environment.validateArtifact(f.root, manifest, f.base), /Default addon differs/u);
  } finally {
    f.dispose();
  }
});

test("desktop manifests include frontend inputs and keep smoke separate from production", () => {
  const f = fixture();
  try {
    const artifact = { path: "target/desktop.exe", bytes: 3, sha256: environment.sha256("exe") };
    f.write(artifact.path, "exe");
    const manifest = {
      kind: "development-artifact-v1", variant: "desktop-release",
      source: environment.captureSource(f.root, f.base, true), platform: process.platform, arch: process.arch,
      tools: { nodePath: process.execPath }, artifact, configuration: null,
      build: {
        command: process.execPath, rustupToolchain: environment.profile.rust,
        targetDirectory: "target/development-build/desktop-release",
        args: ["apps/desktop/scripts/run-tauri.mjs", "build", "--no-bundle", "--ci", "--", "--locked", "--offline"],
      },
    };
    environment.validateArtifact(f.root, manifest, f.base);
    assert.throws(() => environment.validateArtifact(f.root, { ...manifest, variant: "desktop-smoke" }, f.base));
    f.write("apps/desktop/example.ts", "// changed frontend\n");
    f.commit();
    assert.throws(() => environment.validateArtifact(f.root, manifest, f.base), /stale/u);
  } finally {
    f.dispose();
  }
});

test("owned outputs reject traversal and junctions, including existing parent redirects", () => {
  const f = fixture();
  try {
    for (const path of ["../x", "/x", "C:/x", "x\\y", "x//y", "x/./y", "x\0y"]) {
      assert.throws(() => environment.ownedPath(f.root, path, true));
    }
    const target = environment.ownedPath(f.root, "target/real", true);
    const linked = join(f.root, "target/linked");
    symlinkSync(target, linked, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => environment.ownedPath(f.root, "target/linked/output", true), /Linked path/u);
  } finally {
    f.dispose();
  }
});

test("dependency checks inspect all three locks and installed package versions", () => {
  const f = fixture();
  try {
    for (const path of ["", "apps/workbench/", "apps/desktop/"]) {
      const entry = { version: "1.0.0", integrity: "fixture", resolved: "fixture:package" };
      f.write(`${path}package.json`, JSON.stringify({ devDependencies: { fixture: "1.0.0" } }));
      f.write(`${path}package-lock.json`, JSON.stringify({
        lockfileVersion: 3, packages: {
          "": { devDependencies: { fixture: "1.0.0" } }, "node_modules/fixture": entry,
          "node_modules/optional": { version: "1.0.0", optional: true },
        },
      }));
      f.write(`${path}node_modules/.package-lock.json`, JSON.stringify({
        lockfileVersion: 3, packages: { "node_modules/fixture": entry },
      }));
      f.write(`${path}node_modules/fixture/package.json`, JSON.stringify({ version: "1.0.0" }));
    }
    assert.deepEqual(environment.checkDependencies(f.root).map((item) => item.installedPackages), [1, 1, 1]);
    f.write("apps/workbench/node_modules/fixture/package.json", '{"version":"2.0.0"}');
    assert.throws(() => environment.checkDependencies(f.root), /Package version drift/u);
    f.write("apps/workbench/node_modules/fixture/package.json", '{"version":"1.0.0"}');
    f.write("apps/desktop/node_modules/.package-lock.json", '{"lockfileVersion":3,"packages":{}}');
    assert.throws(() => environment.checkDependencies(f.root), /Missing locked dependency/u);
    const lock = JSON.parse(readFileSync(join(f.root, "package-lock.json"), "utf8"));
    lock.packages[""].devDependencies.fixture = "2.0.0";
    f.write("package-lock.json", JSON.stringify(lock));
    assert.throws(() => environment.checkDependencies(f.root), /Package\/lock drift/u);
  } finally {
    f.dispose();
  }
});

test("unrecorded environment and nested Cargo configuration overrides fail closed", () => {
  const f = fixture();
  try {
    environment.assertBuildEnvironment(f.root, {});
    for (const name of ["CARGO_TARGET_DIR", "rustflags", "RUSTUP_TOOLCHAIN", "TAURI_CONFIG", "VITE_HOST", "NODE_OPTIONS"]) {
      assert.throws(() => environment.assertBuildEnvironment(f.root, { [name]: "override" }), /overrides/u);
    }
    f.write("apps/desktop/.cargo/config.toml", "[build]\n");
    assert.throws(() => environment.assertBuildEnvironment(f.root, {}), /configuration override/u);
  } finally {
    f.dispose();
  }
});
