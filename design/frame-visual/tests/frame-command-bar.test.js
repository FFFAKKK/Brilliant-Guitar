import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { withTestDocument, serializeDom } from "./support/dom-test-environment.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createFrameTogglePresentation } from "../src/host/frame-toggle-presentation.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { h } from "../src/shell/dom.js";

test("actual command bar contains only app menus across ordinary region changes", () => withTestDocument(() => {
  const root = h("main", {}); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    const bar = root.querySelector(".v-title");
    const labels = () => bar.querySelectorAll(".v-menu").map(node => node.getAttribute("aria-label"));
    assert.deepEqual(labels(), ["文件", "编辑", "视图", "谱面", "播放", "插件", "帮助"]);
    assert.equal(bar.getAttribute("aria-label"), "命令栏");
    for (const selector of [".v-window-buttons", ".v-mac-buttons", ".v-region-switches", ".v-document", ".v-doc-state"]) {
      assert.equal(bar.querySelector(selector), null, selector);
    }
    assert.doesNotMatch(bar.textContent, /谱面尺寸验证|只读练习谱|16 小节|最小化|最大化|关闭/);
    for (const region of ["top", "left", "right", "voice"]) {
      const before = runtime.workspace.snapshot()[region + "Open"];
      assert.equal(runtime.execute("frame.workspace.region.toggle", { region }).ok, true);
      assert.equal(runtime.workspace.snapshot()[region + "Open"], !before);
      assert.equal(root.querySelector(".v-title"), bar);
      assert.deepEqual(labels(), ["文件", "编辑", "视图", "谱面", "播放", "插件", "帮助"]);
    }
  } finally { runtime.dispose(); }
}));

test("bottom-region entry is text-free and neutral across open, close and static feedback", () => withTestDocument(() => {
  const root = h("main", {}); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    const button = root.querySelector("#voice-trigger");
    const feedback = button.querySelector(".v-voice-icon"), ink = feedback.querySelector(".v-frame-toggle-ink");
    assert.ok(ink);
    assert.equal(button.textContent, "");
    assert.equal(button.querySelector(".v-voice-label"), null);
    assert.equal(button.querySelector(".v-frame-toggle-surface"), null);
    assert.equal(button.getAttribute("aria-label"), "下侧栏");
    assert.ok(root.querySelector(".v-rail-button").querySelector(".v-frame-toggle-surface"), "page selection keeps its own selected surface");
    assert.equal(button.getAttribute("data-frame-toggle"), null);
    for (let i = 0; i < 4; i++) {
      button.click(); const open = runtime.workspace.snapshot().voiceOpen;
      assert.equal(button.getAttribute("aria-expanded"), String(open));
      assert.equal(feedback.dataset.frameToggleRest, open ? "open" : "closed");
      const action = open ? "收起下侧栏" : "展开下侧栏";
      assert.equal(button.getAttribute("title"), action); assert.equal(button.getAttribute("data-tooltip"), action);
      assert.equal(button.querySelector(".v-frame-toggle-ink"), ink);
      assert.equal(button.textContent, "");
      assert.equal(button.querySelector(".v-frame-toggle-surface"), null);
      assert.equal(JSON.stringify(serializeDom(button.querySelector(".v-icon-wrap"))).includes(open ? 'm6 8 4 4 4-4' : 'm6 12 4-4 4 4'), true);
    }
    const css = readFileSync(new URL("../styles/structure-preview.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.v-voice-label/);
    assert.match(css, /\.v-voice-trigger\s*\{\s*display:\s*grid;\s*place-items:\s*center;\s*width:\s*28px;\s*height:\s*28px;\s*padding:\s*0;/);
    assert.doesNotMatch(css, /\.v-voice-trigger\[aria-expanded="true"\]/);
    const motionCss = readFileSync(new URL("../styles/frame-toggle-motion.css", import.meta.url), "utf8");
    assert.match(motionCss, /\.v-voice-icon\s*>\s*\.v-frame-toggle-ink:where\(\[data-frame-ui\]\)\s*\{\s*color:\s*var\(--frame-muted\);\s*\}/);
  } finally { runtime.dispose(); }
}));

test("glyph-only feedback keeps one neutral decoration during interrupted playback and release", () => withTestDocument(async () => {
  const button = h("button", {}), feedback = h("span", { class: "v-voice-icon" }); button.append(feedback);
  const jobs = [], service = createAnimationService({ provider: { name: "capture", start(args) {
    const control = { stop() {} }; jobs.push({ ...args, control }); return control;
  } } });
  const presentation = createFrameTogglePresentation({ controls: new Map([["voice", {
    button, feedbackTarget: feedback, surface: false, glyph: "up", accepted: state => state.open,
    nextGlyph: state => state.open ? "down" : "up",
  }]]), service });
  try {
    presentation.update({ open: false }); const ink = feedback.querySelector(".v-frame-toggle-ink");
    presentation.update({ open: true }, { immediate: false });
    assert.equal(feedback.dataset.frameToggleRest, "moving");
    assert.equal(ink.querySelector(".v-frame-toggle-surface"), null); assert.equal(ink.textContent, "");
    ink.style.opacity = "0.4";
    presentation.update({ open: false }, { immediate: false });
    assert.equal(feedback.querySelector(".v-frame-toggle-ink"), ink);
    assert.equal(ink.querySelector(".v-frame-toggle-surface"), null);
    jobs[0].complete(); await Promise.resolve(); assert.equal(feedback.dataset.frameToggleRest, "moving");
    jobs.at(-1).complete(); await Promise.resolve(); assert.equal(feedback.dataset.frameToggleRest, "closed");
    assert.equal(service.snapshot().active, 0);
    presentation.dispose(); assert.equal(feedback.querySelector(".v-frame-toggle-ink"), null);
    assert.equal(service.snapshot().targets, 0);
  } finally { presentation.dispose(); service.dispose(); }
}));

test("a feedback target outside its button is rejected and earlier acquired scopes roll back", () => withTestDocument(() => {
  const button = h("button", {}), inside = h("span", {}), outside = h("span", {}), other = h("button", {});
  button.append(inside); let acquired = 0, released = 0;
  const service = { forComponent() { acquired++; return { bind: () => ({}), dispose() { released++; } }; } };
  assert.throws(() => createFrameTogglePresentation({ controls: new Map([
    ["valid", { button, feedbackTarget: inside, glyph: "up" }],
    ["invalid", { button: other, feedbackTarget: outside, glyph: "up" }],
  ]), service }), /inside its control/);
  assert.equal(acquired, 1); assert.equal(released, 1);
  assert.equal(inside.querySelector(".v-frame-toggle-ink"), null);
  assert.equal(outside.children.length, 0);
}));
