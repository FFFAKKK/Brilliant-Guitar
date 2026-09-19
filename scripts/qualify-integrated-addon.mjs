import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const prepareOnly = process.argv.length === 3 && process.argv[2] === "--prepare-only";
if (process.argv.length > (prepareOnly ? 3 : 2)) {
  throw new Error("usage: node scripts/qualify-integrated-addon.mjs [--prepare-only]");
}

function cargoExecutable() {
  if (process.env.CARGO !== undefined && process.env.CARGO.length > 0) {
    return process.env.CARGO;
  }
  const homeCargo = join(
    homedir(),
    ".cargo",
    "bin",
    platform() === "win32" ? "cargo.exe" : "cargo",
  );
  return existsSync(homeCargo) ? homeCargo : "cargo";
}

function nativeBuildOutput() {
  if (platform() === "win32") {
    return join(root, "target", "release", "brilliant_kernel_node.dll");
  }
  if (platform() === "darwin") {
    return join(root, "target", "release", "libbrilliant_kernel_node.dylib");
  }
  return join(root, "target", "release", "libbrilliant_kernel_node.so");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireRegularFile(path, label) {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function ensureOutputDirectory(path) {
  mkdirSync(path, { recursive: true });
  const entry = lstatSync(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`Qualification output must be a real directory: ${path}`);
  }
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(cargoExecutable(), [
  "build",
  "-p",
  "brilliant-kernel-node",
  "--release",
  "--features",
  "integrated-bridge-v2",
  "--locked",
  "--offline",
]);

const builtPath = nativeBuildOutput();
requireRegularFile(builtPath, "Cargo output");
const builtBytes = readFileSync(builtPath);
const digest = sha256(builtBytes);
const artifactDirectory = join(root, "target", "kernel-commercial-addons");
ensureOutputDirectory(artifactDirectory);
const artifactPath = join(artifactDirectory, `integrated-v2-${digest}.node`);

if (existsSync(artifactPath)) {
  requireRegularFile(artifactPath, "Qualified addon");
  const existingDigest = sha256(readFileSync(artifactPath));
  if (existingDigest !== digest) {
    throw new Error(`Qualified addon digest mismatch: ${artifactPath}`);
  }
} else {
  const temporaryPath = `${artifactPath}.${process.pid}.tmp`;
  copyFileSync(builtPath, temporaryPath);
  requireRegularFile(temporaryPath, "Temporary qualified addon");
  if (sha256(readFileSync(temporaryPath)) !== digest) {
    throw new Error("Qualified addon changed while being copied");
  }
  renameSync(temporaryPath, artifactPath);
}

const manifestDirectory = join(root, "target", "kernel-commercial-current");
ensureOutputDirectory(manifestDirectory);
const manifestPath = join(manifestDirectory, "integrated-v2.manifest.json");
const manifest = Object.freeze({
  kind: "integrated-addon-qualification-v1",
  feature: "integrated-bridge-v2",
  path: relative(root, artifactPath).replaceAll("\\", "/"),
  bytes: builtBytes.byteLength,
  sha256: digest,
});
const temporaryManifest = `${manifestPath}.${process.pid}.tmp`;
writeFileSync(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
renameSync(temporaryManifest, manifestPath);
process.stdout.write(`${JSON.stringify(manifest)}\n`);

if (prepareOnly) process.exit(0);

run(
  process.execPath,
  [join(root, "dist", "test", "test-infrastructure", "run-compiled-tests.js")],
  { ...process.env, BRILLIANT_INTEGRATED_ADDON_PATH: artifactPath },
);
