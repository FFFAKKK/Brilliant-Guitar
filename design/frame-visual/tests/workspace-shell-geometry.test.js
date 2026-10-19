import assert from "node:assert/strict";
import test from "node:test";
import { applyWorkspaceShellGeometry } from "../src/shell/workspace-shell-geometry.js";

function shell() {
  const values = new Map();
  return { values, style: { setProperty(key, value) { values.set(key, String(value)); } } };
}

test("shared shell geometry projects open and closed regions from one accepted state", () => {
  const node = shell();
  applyWorkspaceShellGeometry(node, {
    leftOpen: false, rightOpen: true, topOpen: true, voiceOpen: true,
    leftWidth: 260, rightWidth: 310, topHeight: 120, voiceHeight: 220,
  });
  assert.deepEqual(Object.fromEntries(node.values), {
    "--left-w": "0px", "--right-w": "310px", "--left-capacity": "260px",
    "--right-capacity": "310px", "--top-h": "120px", "--visible-top": "120px",
    "--voice-content": "188px",
  });
});

test("closed top and bottom regions preserve capacity values without consuming visible rows", () => {
  const node = shell();
  applyWorkspaceShellGeometry(node, {
    leftOpen: true, rightOpen: false, topOpen: false, voiceOpen: false,
    leftWidth: 230, rightWidth: 420, topHeight: 80, voiceHeight: 320,
  });
  assert.equal(node.values.get("--left-w"), "230px");
  assert.equal(node.values.get("--right-w"), "0px");
  assert.equal(node.values.get("--top-h"), "80px");
  assert.equal(node.values.get("--visible-top"), "0px");
  assert.equal(node.values.get("--voice-content"), "0px");
  assert.equal(node.values.get("--right-capacity"), "420px");
});

test("missing geometry inputs fail before writing a partial projection", () => {
  assert.throws(() => applyWorkspaceShellGeometry(null, {}), /需要 shell 和 state/);
});
