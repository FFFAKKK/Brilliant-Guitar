import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { withTestDocument } from "./support/dom-test-environment.js";
import { openPopover, closePopover } from "../src/shell/popover.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";

test("the DOM test boundary removes the same capture listener with boolean and object options on every target", () => withTestDocument(({ document, window }) => {
  for (const target of [document, window, document.createElement("button")]) {
    const callback = () => {};
    target.addEventListener("contract", callback, true);
    target.addEventListener("contract", callback, false);
    assert.equal(getEventListeners(target, "contract").length, 2);
    target.removeEventListener("contract", callback, true);
    assert.equal(getEventListeners(target, "contract").length, 1, "capture=true boolean must remove the capture listener");
    target.removeEventListener("contract", callback, { capture: false });
    assert.equal(getEventListeners(target, "contract").length, 0);
    target.addEventListener("contract", callback, { capture: true });
    target.removeEventListener("contract", callback, true);
    assert.equal(getEventListeners(target, "contract").length, 0);
  }
}));

test("twenty actual popover open/close cycles return document listeners to their original count", () => withTestDocument(({ document }) => {
  const baseline = getEventListeners(document, "pointerdown").length;
  const anchor = document.createElement("button"); document.body.append(anchor);
  try {
    for (let index = 0; index < 20; index++) {
      openPopover(anchor, document.createElement("div"), { label: "Trial" });
      assert.equal(getEventListeners(document, "pointerdown").length, baseline + 1);
      closePopover(); assert.equal(getEventListeners(document, "pointerdown").length, baseline);
    }
  } finally { closePopover({ restoreFocus: false }); anchor.remove(); }
}));

test("simultaneous actual runtimes release all window listeners despite a temporary count above Node's default warning threshold", () => withTestDocument(({ document, window }) => {
  const before = Object.fromEntries(["resize", "pagehide"].map(type => [type, getEventListeners(window, type).length]));
  const roots = [document.createElement("main"), document.createElement("main")]; document.body.append(...roots);
  const runtimes = [];
  let single;
  try {
    runtimes.push(createBackupUiRuntime({ root: roots[0], animationProvider: null }));
    single = Object.fromEntries(["resize", "pagehide"].map(type => [type, getEventListeners(window, type).length - before[type]]));
    runtimes.push(createBackupUiRuntime({ root: roots[1], animationProvider: null }));
    for (const type of ["resize", "pagehide"]) assert.equal(getEventListeners(window, type).length, before[type] + 2 * single[type]);
    assert.ok(getEventListeners(window, "resize").length > 10, "this intentional live-instance peak explains the Node warning");
    runtimes[0].dispose();
    for (const type of ["resize", "pagehide"]) assert.equal(getEventListeners(window, type).length, before[type] + single[type], "the second runtime stays live");
  } finally { runtimes.forEach(runtime => runtime.dispose()); }
  for (const type of ["resize", "pagehide"]) assert.equal(getEventListeners(window, type).length, before[type]);
}));
