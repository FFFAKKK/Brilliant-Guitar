import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const profile = Object.freeze({
  platform: "win32", arch: "x64", node: "v24.15.0", npm: "11.12.1",
  rust: "1.97.1", rustHost: "x86_64-pc-windows-msvc", pwsh: "7.6.5",
});
export const addonVariants = Object.freeze({
  "core-v1": { features: [], defaultPath: "target/rkp-1-node/brilliant_kernel_node.node" },
  "integrated-v2": {
    features: ["integrated-bridge-v2"],
    defaultPath: "target/integrated-v2/brilliant_kernel_node.node",
  },
  "wasm-v1": { features: ["wasm-bridge-v1"], defaultPath: "target/wasm-v1/brilliant_kernel_node.node" },
});
const packages = [".", "apps/workbench", "apps/desktop"];
const nativeInputs = ["crates", "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "scripts"];
const desktopInputs = [...nativeInputs, "src", "apps", "package.json", "package-lock.json", "tsconfig.json"];
const historicalTests = [
  "test/core-kernel/cvn-7-contract-trace.test.ts",
  ...["oracle-manifest", "rkp-1-workspace-contracts", "rkp-2-workspace-contracts",
    "rkp-3-workspace-contracts", "rkp-4-workspace-contracts"]
    .map((name) => `test/core-kernel/rust-migration/${name}.test.ts`),
];
const manifestDirectory = "target/development-environment";
export const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function output(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options,
  }).trim();
}
function git(root, args, options) {
  return output("git", ["--no-optional-locks", "--no-replace-objects", "--literal-pathspecs", ...args], root, options);
}
function cargo() {
  return join(homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
}
function npmCli() {
  const path = join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  assert.ok(existsSync(path), "npm CLI must be installed alongside the selected Node executable");
  return path;
}
function run(command, args, root, env = process.env) {
  const child = spawnSync(command, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `Command failed: ${command} ${args.join(" ")}`);
}

// Writable outputs and installed packages belong to this checkout, never a junction target.
export function ownedPath(root, path, createDirectory = false) {
  assert.ok(typeof path === "string" && path.length > 0 && !isAbsolute(path), "Expected a relative path");
  const parts = path.split("/");
  assert.ok(parts.every((part) => part && part !== "." && part !== ".." && !/[\\:\0]/u.test(part)), "Invalid relative path");
  let current = realpathSync(root);
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current) && createDirectory) mkdirSync(current);
    const stat = lstatSync(current);
    assert.ok(!stat.isSymbolicLink(), `Linked path is not isolated: ${current}`);
    assert.equal(realpathSync(current), current, `Redirected path: ${current}`);
  }
  return current;
}
function directory(root, path) {
  const result = ownedPath(root, path, true);
  assert.ok(lstatSync(result).isDirectory(), `Expected directory: ${path}`);
  return result;
}
function regular(root, path) {
  const result = ownedPath(root, path);
  assert.ok(lstatSync(result).isFile(), `Expected regular file: ${path}`);
  return result;
}
function fileFacts(root, path) {
  const bytes = readFileSync(regular(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}
function publishJson(root, path, value) {
  directory(root, relative(root, dirname(join(root, path))).replaceAll("\\", "/"));
  if (existsSync(join(root, path))) regular(root, path);
  const temporary = `${join(root, path)}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  renameSync(temporary, join(root, path));
}
function retainFile(root, from, to) {
  directory(root, relative(root, dirname(join(root, to))).replaceAll("\\", "/"));
  const source = fileFacts(root, from);
  if (existsSync(join(root, to))) {
    assert.equal(fileFacts(root, to).sha256, source.sha256, `Immutable artifact changed: ${to}`);
  } else {
    copyFileSync(regular(root, from), join(root, to), constants.COPYFILE_EXCL);
    assert.equal(fileFacts(root, to).sha256, source.sha256);
  }
  return fileFacts(root, to);
}
function publishDefault(root, artifact, path) {
  directory(root, relative(root, dirname(join(root, path))).replaceAll("\\", "/"));
  if (existsSync(join(root, path))) {
    const previous = fileFacts(root, path);
    if (previous.sha256 === artifact.sha256) return;
    retainFile(root, path, `target/development-artifacts/previous-${previous.sha256}.node`);
  }
  const temporary = `${join(root, path)}.${randomUUID()}.tmp`;
  copyFileSync(regular(root, artifact.path), temporary, constants.COPYFILE_EXCL);
  assert.equal(sha256(readFileSync(temporary)), artifact.sha256);
  renameSync(temporary, join(root, path));
}

export function assertBuildEnvironment(root, env = process.env) {
  const names = Object.keys(env).filter((name) =>
    /^(RUSTFLAGS|RUSTDOCFLAGS|RUSTC.*|RUSTUP_.*|CARGO(?:_.*)?|TAURI_.*|VITE_.*|NODE_OPTIONS)$/iu.test(name)
    && env[name]);
  assert.deepEqual(names, [], "Unrecorded build overrides are not accepted");
  const configRoots = new Set([join(homedir(), ".cargo")]);
  for (let path = resolve(root); ; path = dirname(path)) {
    configRoots.add(join(path, ".cargo"));
    if (dirname(path) === path) break;
  }
  for (const path of ["apps", "apps/desktop", "apps/desktop/src-tauri"]) {
    configRoots.add(join(root, path, ".cargo"));
  }
  for (const path of configRoots) {
    for (const name of ["config", "config.toml"]) {
      assert.ok(!existsSync(join(path, name)), "Cargo configuration override needs explicit profile review");
    }
  }
}

export function captureSource(root, base, desktop = false) {
  assert.match(base, /^[0-9a-f]{40}$/u, "Use a full base commit SHA");
  assert.equal(git(root, ["cat-file", "-t", base]), "commit");
  git(root, ["merge-base", "--is-ancestor", base, "HEAD"]);
  assert.equal(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "", "Checkout must be clean");
  const entries = git(root, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean);
  assert.ok(entries.every((entry) => entry.startsWith("H ")), "Hidden index flags are not accepted");
  const commit = git(root, ["rev-parse", "HEAD"]);
  const inputs = desktop ? desktopInputs : nativeInputs;
  const tree = git(root, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", ...inputs]);
  assert.ok(tree.length > 0);
  for (const entry of tree.split("\0").filter(Boolean)) {
    assert.ok(entry.startsWith("100644 blob ") || entry.startsWith("100755 blob "), "Linked build input");
    regular(root, entry.slice(entry.indexOf("\t") + 1));
  }
  return {
    commit, tree: git(root, ["rev-parse", `${commit}^{tree}`]),
    worktree: realpathSync(root), inputs, inputSha256: sha256(tree),
  };
}

export function checkDependencies(root) {
  return packages.map((path) => {
    const prefix = path === "." ? "" : `${path}/`;
    const lock = JSON.parse(readFileSync(regular(root, `${prefix}package-lock.json`)));
    const installed = JSON.parse(readFileSync(regular(root, `${prefix}node_modules/.package-lock.json`)));
    const declared = JSON.parse(readFileSync(regular(root, `${prefix}package.json`)));
    assert.equal(lock.lockfileVersion, 3);
    for (const key of ["dependencies", "devDependencies"]) {
      assert.deepEqual(declared[key] ?? {}, lock.packages[""][key] ?? {}, `Package/lock drift: ${path}`);
    }
    for (const [name, expected] of Object.entries(lock.packages)) {
      if (name === "") continue;
      const actual = installed.packages[name];
      if (actual === undefined) {
        assert.equal(expected.optional, true, `Missing locked dependency: ${path}/${name}`);
        continue;
      }
      for (const key of ["version", "integrity", "resolved"]) {
        assert.equal(actual[key], expected[key], `Installed dependency drift: ${path}/${name}/${key}`);
      }
      const metadata = JSON.parse(readFileSync(regular(root, `${prefix}${name}/package.json`)));
      assert.equal(metadata.version, expected.version, `Package version drift: ${path}/${name}`);
    }
    for (const name of Object.keys(installed.packages)) {
      assert.ok(lock.packages[name], `Extraneous installed dependency: ${path}/${name}`);
    }
    return {
      path, lockedPackages: Object.keys(lock.packages).length - 1,
      installedPackages: Object.keys(installed.packages).length,
      lockSha256: sha256(readFileSync(join(root, prefix, "package-lock.json"))),
    };
  });
}

export function checkHistoricalObjects(root) {
  assert.equal(git(root, ["rev-parse", "--is-shallow-repository"]), "false", "A shallow checkout is not supported");
  const ts = createRequire(join(root, "package.json"))("typescript");
  const objects = new Set();
  for (const path of historicalTests) {
    const file = ts.createSourceFile(path, readFileSync(regular(root, path), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && /^[0-9a-f]{40}$/u.test(node.text)) objects.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.ok(objects.size > 0);
  const sorted = [...objects].sort();
  const results = git(root, ["cat-file", "--batch-check"], { input: `${sorted.join("\n")}\n` }).split(/\r?\n/u);
  assert.equal(results.length, sorted.length);
  for (const [index, line] of results.entries()) {
    assert.match(line, /^[0-9a-f]{40} (commit|tree|blob) [0-9]+$/u, `Missing historical object: ${sorted[index]}`);
    assert.equal(line.slice(0, 40), sorted[index]);
  }
  return { files: historicalTests, objects: sorted.length, sha256: sha256(sorted.join("\n")) };
}

export function checkTools(root) {
  assert.equal(process.platform, profile.platform, "This acceptance profile covers Windows x64 only");
  assert.equal(process.arch, profile.arch);
  assert.equal(process.version, profile.node);
  assertBuildEnvironment(root);
  const npm = output(process.execPath, [npmCli(), "--version"], root);
  const rustc = output(join(dirname(cargo()), "rustc.exe"), [`+${profile.rust}`, "-vV"], root);
  const cargoVersion = output(cargo(), [`+${profile.rust}`, "--version"], root);
  const pwsh = output("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], root);
  assert.equal(npm, profile.npm);
  assert.equal(pwsh, profile.pwsh);
  assert.ok(rustc.split(/\r?\n/u).includes(`release: ${profile.rust}`));
  assert.ok(rustc.split(/\r?\n/u).includes(`host: ${profile.rustHost}`));
  assert.ok(cargoVersion.startsWith(`cargo ${profile.rust} `));
  return { node: process.version, nodePath: process.execPath, npm, rustc, cargo: cargoVersion,
    cargoPath: cargo(), pwsh, git: output("git", ["--version"], root), platform: process.platform, arch: process.arch };
}

function addonBuildArguments(variant) {
  const settings = addonVariants[variant];
  return [`+${profile.rust}`, "build", "-p", "brilliant-kernel-node", "--release",
    "--locked", "--offline", "--target-dir", `target/development-build/${variant}`,
    ...(settings.features.length ? ["--features", settings.features.join(",")] : [])];
}

export function validateArtifact(root, manifest, base) {
  assert.equal(manifest.kind, "development-artifact-v1");
  assert.equal(manifest.source.worktree, realpathSync(root), "Artifact belongs to another checkout");
  assert.equal(manifest.platform, process.platform);
  assert.equal(manifest.arch, process.arch);
  assert.match(manifest.source.commit, /^[0-9a-f]{40}$/u);
  git(root, ["merge-base", "--is-ancestor", manifest.source.commit, "HEAD"]);
  const desktop = manifest.variant.startsWith("desktop-");
  const current = captureSource(root, base, desktop);
  assert.deepEqual(manifest.source.inputs, current.inputs);
  assert.equal(manifest.source.tree, git(root, ["rev-parse", `${manifest.source.commit}^{tree}`]));
  const originalInputs = git(root, ["ls-tree", "-r", "-z", "--full-tree", manifest.source.commit, "--", ...current.inputs]);
  assert.equal(manifest.source.inputSha256, sha256(originalInputs));
  assert.equal(manifest.source.inputSha256, current.inputSha256, "Artifact build inputs are stale");
  assert.deepEqual(fileFacts(root, manifest.artifact.path), manifest.artifact);
  assert.equal(manifest.build.targetDirectory, `target/development-build/${manifest.variant}`);
  if (Object.hasOwn(addonVariants, manifest.variant)) {
    assert.deepEqual(manifest.build.args, addonBuildArguments(manifest.variant));
    assert.equal(manifest.build.command, manifest.tools.cargoPath);
    assert.equal(manifest.defaultPath, addonVariants[manifest.variant].defaultPath);
    assert.equal(fileFacts(root, manifest.defaultPath).sha256, manifest.artifact.sha256, "Default addon differs");
  } else {
    assert.ok(["desktop-release", "desktop-smoke"].includes(manifest.variant), "Unknown artifact variant");
    assert.equal(manifest.build.command, manifest.tools.nodePath);
    assert.equal(manifest.build.rustupToolchain, profile.rust);
    const configuration = manifest.configuration;
    if (manifest.variant === "desktop-release") assert.equal(configuration, null);
    else {
      assert.match(configuration.identifier, /^com\.brilliantguitar\.baseline\.[0-9a-f]{32}$/u);
      assert.equal(fileFacts(root, configuration.path).sha256, configuration.sha256);
      assert.equal(JSON.parse(readFileSync(regular(root, configuration.path))).identifier, configuration.identifier);
    }
    assert.deepEqual(manifest.build.args, ["apps/desktop/scripts/run-tauri.mjs", "build", "--no-bundle", "--ci",
      ...(configuration ? ["--config", regular(root, configuration.path)] : []), "--", "--locked", "--offline"]);
  }
  return { variant: manifest.variant, sourceCommit: manifest.source.commit, ...manifest.artifact };
}

function withBuildLock(root, action) {
  const path = join(directory(root, manifestDirectory), "build.lock");
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, `${process.pid}\n`);
    return action();
  } finally {
    closeSync(descriptor);
    unlinkSync(path);
  }
}

export function prepareAddons(root, base, variants = Object.keys(addonVariants)) {
  const tools = checkTools(root);
  const source = captureSource(root, base);
  return withBuildLock(root, () => variants.map((variant) => {
    assert.ok(Object.hasOwn(addonVariants, variant), "Unknown addon variant");
    const settings = addonVariants[variant];
    const targetDirectory = `target/development-build/${variant}`;
    directory(root, targetDirectory);
    const args = addonBuildArguments(variant);
    run(cargo(), args, root);
    assert.deepEqual(captureSource(root, base), source, "Source changed while building");
    const built = `${targetDirectory}/release/brilliant_kernel_node.dll`;
    const artifact = retainFile(root, built, `target/development-artifacts/${variant}-${fileFacts(root, built).sha256}.node`);
    publishDefault(root, artifact, settings.defaultPath);
    const manifest = { kind: "development-artifact-v1", variant, source, tools,
      platform: process.platform, arch: process.arch, createdAt: new Date().toISOString(),
      build: { command: cargo(), args, targetDirectory },
      artifact, defaultPath: settings.defaultPath };
    publishJson(root, `${manifestDirectory}/${variant}.json`, manifest);
    if (variant === "integrated-v2") {
      publishJson(root, "target/kernel-commercial-current/integrated-v2.manifest.json", {
        kind: "integrated-addon-qualification-v1", feature: "integrated-bridge-v2",
        ...artifact, provenance: manifest,
      });
    }
    return manifest;
  }));
}

export function prepareDesktop(root, base, smoke = false) {
  const tools = checkTools(root);
  const source = captureSource(root, base, true);
  return withBuildLock(root, () => {
    const variant = smoke ? "desktop-smoke" : "desktop-release";
    const targetDirectory = `target/development-build/${variant}`;
    directory(root, targetDirectory);
    let configuration = null;
    if (smoke) {
      const identifier = `com.brilliantguitar.baseline.${randomUUID().replaceAll("-", "")}`;
      const original = JSON.parse(readFileSync(regular(root, "apps/desktop/src-tauri/tauri.conf.json")));
      const value = { identifier, app: { windows: original.app.windows.map((window) => ({
        ...window, title: "Brilliant Guitar Baseline Verification",
      })) } };
      const path = `${manifestDirectory}/desktop-smoke.config.json`;
      publishJson(root, path, value);
      configuration = { ...fileFacts(root, path), identifier };
    }
    const args = ["apps/desktop/scripts/run-tauri.mjs", "build", "--no-bundle", "--ci",
      ...(configuration ? ["--config", regular(root, configuration.path)] : []),
      "--", "--locked", "--offline"];
    run(process.execPath, args, root, {
      ...process.env, CARGO_TARGET_DIR: join(root, targetDirectory), RUSTUP_TOOLCHAIN: profile.rust,
    });
    assert.deepEqual(captureSource(root, base, true), source, "Source changed while building");
    const built = `${targetDirectory}/release/brilliant-guitar-desktop.exe`;
    const artifact = retainFile(root, built, `target/development-artifacts/${variant}-${fileFacts(root, built).sha256}.exe`);
    const manifest = { kind: "development-artifact-v1", variant, source, tools,
      platform: process.platform, arch: process.arch, createdAt: new Date().toISOString(),
      build: { command: process.execPath, args, targetDirectory, rustupToolchain: profile.rust },
      artifact, configuration };
    publishJson(root, `${manifestDirectory}/${variant}.json`, manifest);
    return manifest;
  });
}

export function checkEnvironment(root, base, artifacts = true) {
  const tools = checkTools(root);
  const source = captureSource(root, base);
  const dependencies = checkDependencies(root);
  const historicalObjects = checkHistoricalObjects(root);
  const verifiedArtifacts = artifacts
    ? [...Object.keys(addonVariants), "desktop-release"].map((variant) => {
      const manifest = JSON.parse(readFileSync(regular(root, `${manifestDirectory}/${variant}.json`)));
      assert.equal(manifest.variant, variant);
      assert.deepEqual(manifest.tools, tools, "Build tools differ from current tools");
      return validateArtifact(root, manifest, base);
    }) : [];
  return { kind: "development-environment-check-v1", base, source, tools, dependencies,
    historicalObjects, artifacts: verifiedArtifacts, artifactChecksEnabled: artifacts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, baseFlag, base, ...extra] = process.argv.slice(2);
  assert.ok(["--check", "--check-tools", "--prepare-addons", "--prepare-desktop", "--prepare-smoke"].includes(mode)
    && baseFlag === "--base" && base && extra.length === 0,
  "Usage: node scripts/development-environment.mjs --check|--check-tools|--prepare-addons|--prepare-desktop|--prepare-smoke --base <full-SHA>");
  let result;
  if (mode === "--prepare-addons") {
    checkEnvironment(repository, base, false);
    result = prepareAddons(repository, base);
  } else if (mode === "--prepare-desktop" || mode === "--prepare-smoke") {
    checkEnvironment(repository, base, false);
    result = prepareDesktop(repository, base, mode === "--prepare-smoke");
  } else {
    result = checkEnvironment(repository, base, mode === "--check");
  }
  console.log(JSON.stringify(result, null, 2));
}
