// Read-only generation checks and fresh logs; the browser must finish first.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const frame = path.resolve(__dirname, ".."), root = path.resolve(frame, "../.."), workbench = path.join(root, "apps/workbench");
const output = path.join(frame, "evidence/layout-visible-formal-animation-20261007"), tsc = path.join(workbench, "node_modules/typescript/bin/tsc");
const browserFile = process.env.FRAME_VISIBLE_BROWSER_REPORT || "toggle-v7/formal-visible-browser.json";
const checks = [
  { name: "frame-tests", executable: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm --prefix design/frame-visual test"], cwd: root },
  { name: "workbench-types", args: [tsc, "--noEmit", "-p", "tsconfig.json"], cwd: workbench },
  { name: "formal-mount-tests", args: ["--experimental-strip-types", "--test", "apps/workbench/test/plugin-mount.test.ts"], cwd: root },
  { name: "shape-types", args: [tsc, "--ignoreConfig", "--strict", "--exactOptionalPropertyTypes", "--target", "ES2022", "--moduleResolution", "bundler", "--module", "esnext", "--lib", "ES2022,DOM", "--noEmit", path.join(frame, "evidence/layout-preview-formal-shape-20261007/shape-types.ts")], cwd: root },
  ...["animation-contract", "motion", "plugin-startup", "desktop"].map(script => ({ name: script + "-check", args: ["scripts/build-" + script + ".mjs", "--check"], cwd: frame })),
];
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const results = [];
for (const c of checks) {
  const r = spawnSync(c.executable || process.execPath, c.args, { cwd: c.cwd, encoding: "utf8" });
  const log = (r.stdout || "") + (r.stderr || "") + (r.error ? String(r.error) : "");
  fs.writeFileSync(path.join(output, "final-" + c.name + ".log"), log);
  const count = /(?:ℹ|#) tests (\d+)/.exec(log);
  results.push({ name: c.name, command: [c.executable || process.execPath, ...c.args], cwd: c.cwd, exit: r.status, passed: r.status === 0, ...(count ? { tests: Number(count[1]) } : {}), log: "final-" + c.name + ".log" });
  console.log(c.name + ": " + (r.status === 0 ? "passed" : "FAILED"));
}
const b = JSON.parse(fs.readFileSync(path.join(output, browserFile), "utf8"));
results.push({ name: "actual-formal-visible-browser", passed: b.failed.length === 0 && b.errors.length === 0,
  checks: b.checks.length, passedChecks: b.passed, scoreFrames: b.frames.reduce((s, f) => s + f.samples, 0),
  maximumScoreDrift: Math.max(0, ...b.frames.flatMap(f => Object.values(f.drift))),
  controlFrames: b.frames.reduce((s, f) => s + f.controlSamples, 0),
  maximumArrangementControlDrift: Math.max(0, ...b.frames.filter(f => f.name.includes("/selection")).flatMap(f => Object.values(f.controls).flatMap(r => Object.values(r)))),
  report: browserFile });
const privateFiles = ["shell/workspace-layout-preview.js", "shell/workspace-layout-preview-geometry.js", "shell/workspace-layout-visual.js", "shell/workspace-layout-selection.js", "shell/workspace-layout-toggle-motion.js", "features/workspace-layout-motion-recipes.js"].map(f => "design/frame-visual/src/" + f);
privateFiles.push("design/frame-visual/styles/workspace-layout.css");
const sources = ["host/frame-region-presentation.js", "host/frame-toggle-presentation.js", "host/frame-pointer-presentation.js", "host/workspace-runtime.js", "runtime/animation-service.js", "runtime/motion-animation-provider.js", "features/workspace-layout-plugin.js", "features/workspace-layout-page.js", "shell/visual-workbench.js"].map(f => "design/frame-visual/src/" + f);
sources.push("design/frame-visual/styles/structure-preview.css", "design/frame-visual/styles/frame-toggle-motion.css", "design/frame-visual/vendor/plugin-startup-preview.js", "design/frame-visual/dist/desktop/asset-manifest.json", "design/frame-visual/tests/frame-region-presentation.test.js", "design/frame-visual/tests/layout-formal-integration.test.js", "design/frame-visual/tests/animation-service.test.js", "design/frame-visual/tests/style-boundaries.test.js", "design/frame-visual/tests/workspace-animations.test.js", "design/frame-visual/tools/layout-visible-formal-browser.cjs");
const report = { at: new Date().toISOString(), status: results.every(r => r.passed) ? "passed" : "failed", checks: results,
  sourceHashes: sources.map(file => ({ file, sha256: hash(file) })), consumedAuthorHashes: privateFiles.map(file => ({ file, sha256: hash(file) })),
  overallUserExperienceAcceptance: "blocked",
  userExperienceReport: "design/frame-visual/research/user-experience-audit-20261007.md",
  knownUserExperienceConcerns: [
    { id: "UX-01", summary: "Accepted region dimensions reflow the settings host before the animation baseline; after-acceptance zero drift does not resolve this." },
    { id: "UX-02", summary: "Edit/cancel wording does not clearly express the existing content transaction scope." },
  ],
  limits: "Chrome + formal ESM / classic file / desktop static assets; native WebView and joint visual acceptance remain separate. No Rust, kernel changes, commit, stage or archive." };
fs.writeFileSync(path.join(output, "final-verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, browser: results.at(-1) }));
if (report.status !== "passed") process.exitCode = 1;
