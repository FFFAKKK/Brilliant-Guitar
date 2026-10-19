// Replays final engineering gates without touching historical evidence.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process"), { pathToFileURL } = require("node:url");
const frame = path.resolve(__dirname, ".."), root = path.resolve(frame, "../.."), workbench = path.join(root, "apps/workbench");
const output = path.join(frame, "evidence/layout-preview-formal-shape-20261007");
const checks = [
  { name: "frame-tests", executable: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "npm --prefix design/frame-visual test"], cwd: root },
  { name: "workbench-types", args: [path.join(workbench, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "tsconfig.json"], cwd: workbench },
  { name: "formal-mount-tests", args: ["--experimental-strip-types", "--test", "apps/workbench/test/plugin-mount.test.ts"], cwd: root },
  { name: "shape-types", args: [path.join(workbench, "node_modules/typescript/bin/tsc"), "--ignoreConfig", "--strict", "--exactOptionalPropertyTypes", "--target", "ES2022", "--moduleResolution", "bundler", "--module", "esnext", "--lib", "ES2022,DOM", "--noEmit", path.join(output, "shape-types.ts")], cwd: root },
  ...["animation-contract", "motion", "plugin-startup", "desktop"].map(script => ({ name: script + "-check", args: ["scripts/build-" + script + ".mjs", "--check"], cwd: frame })),
];
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
(async () => {
  const results = [];
  for (const c of checks) {
    const result = spawnSync(c.executable ?? process.execPath, c.args, { cwd: c.cwd, shell: c.shell ?? false, encoding: "utf8" });
    const log = (result.stdout ?? "") + (result.stderr ?? "") + (result.error ? String(result.error) : "");
    fs.writeFileSync(path.join(output, c.name + ".log"), log);
    const count = /(?:ℹ|#) tests (\d+)/.exec(log);
    results.push({ name: c.name, command: [c.executable ?? process.execPath, ...c.args], cwd: c.cwd, exit: result.status,
      passed: result.status === 0, ...(count ? { tests: Number(count[1]) } : {}), log: c.name + ".log" });
    console.log(c.name + ": " + (result.status === 0 ? "passed" : "FAILED"));
  }
  const originals = JSON.parse(fs.readFileSync(path.join(output, "visual-before-hashes.json"), "utf8"));
  const accepted = JSON.parse(fs.readFileSync(path.join(output, "visual-accepted-hashes.json"), "utf8"));
  const visual = accepted.map(entry => ({ ...entry, beforeSession: originals.find(v => v.path === entry.path)?.sha256, after: hash(path.join(root, entry.path)) }));
  results.push({ name: "accepted-visual-sources-stable-through-final-validation", passed: visual.every(v => v.sha256 === v.after), files: visual,
    note: "Concurrent author changes after session baseline are retained; engineering did not edit the visual sources." });
  const old = await import(pathToFileURL(path.join(output, "before/shared/ui-animation/contract.js")));
  let rejected = false;
  try { old.captureAnimationContribution({ contractVersion: 1, definitions: { "shape-transition": {
    defaultVariant: "own", variants: { own: { type: "tween", duration: .28, ease: [.77, 0, .175, 1] } },
  } } }); } catch (error) { rejected = error instanceof TypeError; }
  results.push({ name: "previous-ui-motion-1-rejects-unknown-shape", passed: rejected });
  const browser = JSON.parse(fs.readFileSync(path.join(output, "formal-shape-browser.json"), "utf8"));
  const frames = browser.frames.reduce((sum, f) => sum + f.samples, 0), progress = browser.frames.reduce((sum, f) => sum + f.coupledFrames, 0);
  results.push({ name: "actual-formal-shape-browser", passed: browser.failed.length === 0 && browser.errors.length === 0 && progress > 0,
    checks: browser.checks.length, passedChecks: browser.passed, scoreFrames: frames, coupledFrames: progress,
    maximumScoreDrift: Math.max(0, ...browser.frames.flatMap(f => Object.values(f.drift))),
    maximumProgressSpread: Math.max(0, ...browser.frames.map(f => f.progressSpread)), report: "formal-shape-browser.json" });
  const files = ["shared/ui-animation/contract.js", "shared/ui-animation/contract.d.ts",
    ...["runtime/animation-service.js", "runtime/dom-animation-driver.js", "runtime/motion-animation-provider.js", "features/workspace-layout-plugin.js", "features/workspace-layout-page.js", "vendor/animation-contract.js", "vendor/plugin-platform.js"].map(p => "design/frame-visual/src/" + p),
    "design/frame-visual/vendor/plugin-startup-preview.js", "design/frame-visual/dist/desktop/asset-manifest.json",
    "design/frame-visual/tests/shape-animation-service.test.js", "design/frame-visual/tests/layout-formal-integration.test.js", "design/frame-visual/tests/runtime-composition.test.js", "apps/workbench/test/plugin-mount.test.ts",
    "design/frame-visual/tools/layout-formal-shape-browser.cjs", "design/frame-visual/tools/layout-formal-shape-verify.cjs"];
  const report = { at: new Date().toISOString(), status: results.every(r => r.passed) ? "passed" : "failed", checks: results,
    sourceHashes: files.map(file => ({ file, sha256: hash(path.join(root, file)) })),
    limits: "Chrome + generated desktop static assets; native WebView and visual joint acceptance remain separate; no Rust build, commit or archive." };
  fs.writeFileSync(path.join(output, "final-verification.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, browser: results.at(-1) }));
  if (report.status !== "passed") process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
