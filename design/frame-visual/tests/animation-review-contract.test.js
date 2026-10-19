import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("Motion pilot stays isolated from ordinary framework entries", () => {
  const page = read("animation-review.html");
  assert.match(page, /styles\/animation-review\.css/);
  assert.match(page, /src\/fixtures\/animation-review\.js/);
  for (const entry of ["runtime-preview.html", "structure-preview.html", "layout-collaboration-review.html"]) {
    assert.doesNotMatch(read(entry), /animation-review|motion-pilot|motion-review\.js/);
  }
});

test("only the adapter imports the local pinned engine and plugin uses a bound port", () => {
  const adapter = read("src/fixtures/motion-pilot/motion-adapter.js");
  const pilot = read("src/fixtures/motion-pilot/layout-pilot.js");
  const definitions = read("src/fixtures/motion-pilot/layout-motion-definitions.js");
  const coordinator = read("src/fixtures/motion-pilot/coordinator.js");
  assert.match(adapter, /vendor\/motion-review\.js/);
  assert.doesNotMatch(pilot, /from ["'](?:motion|gsap)|\.animate\(/);
  assert.doesNotMatch(pilot, /from ["'][^"']*coordinator\.js/);
  assert.doesNotMatch(definitions, /from ["'][^"']*(?:coordinator|motion-adapter|vendor\/motion-review)\.js/);
  assert.doesNotMatch(coordinator, /from ["'][^"']*layout-motion-definitions\.js|frame\.layout/);
  assert.match(pilot, /motion\.bind/);
  const manifest = JSON.parse(read("package.json"));
  assert.equal(manifest.dependencies.motion, "14.0.0");
  assert.ok(read("vendor/motion-review.LICENSE.txt").includes("MIT"));
});

test("review compares the same two interactions with bilingual choices and approved paper", () => {
  const source = read("src/fixtures/animation-review.js");
  for (const label of ["Continuity", "Focus", "Quiet", "Full", "Slow", "Reduced", "Off"]) assert.ok(source.includes(label));
  assert.match(source, /fixtures\/approved-score\.svg/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /pagehide/);
});

test("paper and work area are excluded from animation grants and page scrolling", () => {
  const source = read("src/fixtures/motion-pilot/layout-pilot.js");
  const css = read("styles/animation-review.css");
  assert.doesNotMatch(source, /motion-paper|motion-score|motion-stage/);
  assert.match(css, /html, body\s*\{[^}]*overflow:\s*hidden;/s);
  assert.doesNotMatch(css, /transition\s*:\s*(?:all|width|height)/);
  assert.doesNotMatch(css.match(/\.motion-paper\s*\{[^}]*\}/s)?.[0] || "", /(?:animation|transition|transform)\s*:/);
});
