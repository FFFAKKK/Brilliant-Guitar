const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const copy = path.resolve(__dirname, "..");
const project = path.resolve(copy, "../..");
const baseline = JSON.parse(fs.readFileSync(path.join(copy, "copy-provenance.json"), "utf8"));
const source = path.resolve(project, baseline.source);
const score = JSON.parse(fs.readFileSync(path.join(copy, "fixtures/score-provenance.json"), "utf8"));
const report = { generated: new Date().toISOString(), originalFiles: 0, changedInheritedFiles: [], checks: [], passed: false };

const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? files(absolute) : [absolute];
  });
}

try {
  const originals = files(source).map((file) => path.relative(source, file).replaceAll("\\", "/")).sort();
  assert.deepEqual(originals, Object.keys(baseline.sourceHashes).sort(), "Original inventory changed");
  for (const [relative, expected] of Object.entries(baseline.sourceHashes)) {
    assert.equal(hash(path.join(source, relative)), expected, "Original changed: " + relative);
    if (hash(path.join(copy, relative)) !== expected) report.changedInheritedFiles.push(relative);
    report.originalFiles++;
  }
  report.checks.push("All 33 original files match the recorded SHA256 baseline");

  const allowed = new Set(["README.md", "index.html", "package.json", "styles/tokens.css", "styles/base.css", "styles/frame.css", "styles/docks.css", "styles/panels.css", "src/shell/shell.js", "src/shell/popover.js"]);
  for (const relative of report.changedInheritedFiles) assert.ok(allowed.has(relative), "Unexpected inherited change: " + relative);
  report.checks.push("Inherited changes are limited to documentation, preview startup and visual presentation");

  const contracts = originals.filter((relative) => /^(src\/(layout|runtime|host)\/|tests\/)/.test(relative));
  for (const relative of contracts) assert.equal(hash(path.join(copy, relative)), baseline.sourceHashes[relative], "Contract changed: " + relative);
  report.contractFiles = contracts.length;
  report.checks.push("Layout, persistence, registry, plugin, host and test contracts are unchanged");

  assert.equal(hash(score.source), score.sourceSHA256, "Approved static source changed");
  assert.equal(hash(path.join(copy, "fixtures/approved-score.svg")), score.assetSHA256, "Extracted static score changed");
  const approvedHtml = fs.readFileSync(score.source, "utf8");
  const originalScore = approvedHtml.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)[0].replace(' style=""', "");
  const extractedScore = fs.readFileSync(path.join(copy, "fixtures/approved-score.svg"), "utf8");
  const embeddedFonts = extractedScore.match(/<style>[\s\S]*?<\/style>/)[0];
  assert.equal(extractedScore.replace(embeddedFonts, "").trim(), originalScore, "Score geometry changed during extraction");
  for (const font of approvedHtml.match(/@font-face\s*\{[^}]*\}/g)) assert.ok(embeddedFonts.includes(font), "Approved font declaration changed");
  const structure = "E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md";
  assert.equal(hash(structure), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf", "Structure document changed");
  report.checks.push("Structure document and approved static score match recorded hashes; score geometry and two embedded fonts match the source");

  const imports = /\b(?:import|export)[^\n]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g;
  for (const file of files(copy).filter((file) => /\.(js|cjs|html)$/.test(file))) {
    const contents = fs.readFileSync(file, "utf8");
    for (const match of contents.matchAll(imports)) {
      const dependency = match[1] || match[2] || match[3];
      assert.ok(!/apps[\\/]workbench|vexflow-renderer|score-page-layout/.test(dependency), "Forbidden dependency: " + dependency);
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(copy, "package.json"), "utf8"));
  for (const command of Object.values(pkg.scripts)) assert.ok(!/apps[\\/]workbench|vexflow-renderer|score-page-layout/.test(command), "Forbidden build dependency");
  const preview = fs.readFileSync(path.join(copy, "src/fixtures/structure-preview.js"), "utf8");
  assert.ok(!/from\s*["'][^"']*(?:\/runtime\/|\/layout\/)|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/.test(preview), "Preview must stay in memory");
  report.checks.push("Preview uses memory fixtures and has no abandoned product or business runtime dependency");
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
}

const output = path.resolve(copy, process.argv[2] ?? "evidence/scope-audit.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
