// Engineering-stage evidence is separate from the saved visual review.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
// An intentional visual revision must supply fresh browser evidence, not overwrite history.
const visual = JSON.parse(fs.readFileSync(path.resolve(root, process.argv[2] ?? "evidence/revision-02/review.json"), "utf8"));
const original = path.resolve(root, "../..", baseline.source);
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const inventory = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? inventory(file) : [file];
});
const sources = ["runtime-preview.html", "styles/runtime-preview.css", "src/runtime-preview.js",
  "src/layout/workspace-state.js", "src/host/workspace-commands.js", "src/host/stage-viewport.js",
  "src/shell/visual-controls.js", "src/shell/visual-workbench.js", "src/shell/visual-zoom.js",
  "src/features/builtin-pages.js", "src/features/workspace-layout-page.js",
  "src/workspace-geometry.js",
  "tests/workspace-runtime.test.js", "tests/stage-viewport.test.js", "tools/audit-runtime.cjs"];
const report = { date: "2026-10-02", scope: "backup visual copy integration", originalFiles: 0,
  inheritedContracts: 0, visualBaselineFiles: 0, sourceHashes: {}, passed: false };
try {
  const originals = inventory(original).map(file => path.relative(original, file).replaceAll("\\", "/")).sort();
  assert.deepEqual(originals, Object.keys(baseline.sourceHashes).sort(), "Original inventory changed");
  for (const [relative, expected] of Object.entries(baseline.sourceHashes)) {
    assert.equal(hash(path.join(original, relative)), expected, "Original changed: " + relative);
    report.originalFiles++;
    if (/^(src\/(runtime|host|layout)\/|tests\/)/.test(relative)) {
      assert.equal(hash(path.join(root, relative)), expected, "Inherited contract changed: " + relative);
      report.inheritedContracts++;
    }
  }
  for (const [relative, expected] of Object.entries(visual.sourceHashes)) {
    assert.equal(hash(path.join(root, relative)), expected, "Visual reference changed: " + relative);
    report.visualBaselineFiles++;
  }
  for (const relative of sources) {
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, "utf8");
    if (!relative.startsWith("tools/")) {
      assert.ok(!/apps[\\/]workbench|core-kernel|\blocalStorage\b|\bfetch\s*\(/.test(source), "Unexpected product/kernel/persistence dependency: " + relative);
    }
    report.sourceHashes[relative] = hash(file);
  }
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
}
const destination = path.resolve(root, process.argv[3] ?? "evidence/runtime-integration");
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, "scope-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
