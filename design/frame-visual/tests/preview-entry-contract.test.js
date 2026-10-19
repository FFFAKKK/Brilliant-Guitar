import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("all visual entries load the shared shell and layout component styles", () => {
  for (const file of ["runtime-preview.html", "structure-preview.html", "layout-collaboration-review.html"]) {
    const source = read(file);
    assert.match(source, /styles\/structure-preview\.css/ , file);
    assert.match(source, /styles\/workspace-layout\.css/, file);
  }
});

test("the two shell implementations use the same geometry projection", () => {
  for (const file of ["src/fixtures/structure-preview.js", "src/shell/visual-workbench.js"]) {
    const source = read(file);
    const projection = file === "src/fixtures/structure-preview.js" ? /applyWorkspaceShellGeometry\(shell, state\)/
      : /applyWorkspaceShellGeometry\(shell, regionPresentation\?\.beforeRender\(state, \{ pointer \}\) \?\? state\)/;
    assert.match(source, projection, file);
    assert.doesNotMatch(source, /setProperty\("--left-w"/, file + " must not duplicate region projection");
  }
});

test("all visual entries keep page-level overflow owned by the frame", () => {
  const base = read("styles/base.css");
  assert.match(base, /body\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(read("styles/scrollbars.css"), /html, body/);
  for (const file of ["runtime-preview.html", "structure-preview.html", "layout-collaboration-review.html"]) {
    assert.match(read(file), /styles\/base\.css/ , file);
  }
});

test("layout component opts into no motion instead of relying on the global kill switch", () => {
  const source = read("styles/workspace-layout.css");
  assert.doesNotMatch(source, /\btransition\s*:/);
  assert.doesNotMatch(source, /\banimation\s*:/);
});
