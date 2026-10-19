import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { h } from "../src/shell/dom.js";
import { icon } from "../src/shell/icons.js";
import { icon as previewIcon } from "../src/fixtures/preview-icons.js";
import { markFrameUi, FRAME_UI_ATTRIBUTE } from "../src/runtime/style-boundary.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { withTestDocument, serializeDom } from "./support/dom-test-environment.js";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
// Flat-rule inspection only: this checks stylesheet contracts, not computed browser styles.
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body: body.replace(/\s+/g, " ").trim() }));
const before = name => read("evidence/style-boundaries/before-source/" + name);

test("frame construction marks only owned nodes, including detached portal controls", () => withTestDocument(() => {
  const privateChild = document.createElement("button");
  const root = h("div", {}, h("button", { type: "button" }), privateChild);
  assert.equal(root.getAttribute(FRAME_UI_ATTRIBUTE), "");
  assert.equal(root.firstChild.getAttribute(FRAME_UI_ATTRIBUTE), "");
  assert.equal(privateChild.getAttribute(FRAME_UI_ATTRIBUTE), null);
  const portal = h("div", { role: "dialog" }, h("input")); document.body.append(portal);
  assert.equal(portal.firstChild.getAttribute(FRAME_UI_ATTRIBUTE), "");
  assert.equal(markFrameUi(root), root);
  assert.match(icon("library"), /<svg data-frame-ui="" class="icon"/);
}));

test("every bundled frame glyph opts into the same block layout and accessibility contract", () => {
  for (const [file, render] of [["src/shell/icons.js", icon], ["src/fixtures/preview-icons.js", previewIcon]]) {
    const names = [...read(file).matchAll(/^  (\w+):/gm)].map(([, name]) => name);
    assert.ok(names.length > 0, file);
    for (const name of names) for (const size of [14, 16, 18, 20]) {
      const markup = render(name, size), root = markup.slice(0, markup.indexOf(">") + 1);
      assert.match(root, /data-frame-ui=""/, `${file}: ${name} must opt into frame CSS`);
      assert.match(root, /class="icon"/);
      assert.match(root, new RegExp(`width="${size}" height="${size}"`));
      assert.match(root, /viewBox="0 0 20 20"/);
      assert.match(root, /aria-hidden="true"/);
      assert.match(markup, /<(?:path|rect|circle|ellipse)\b/, name + " must retain its drawing");
    }
  }
  assert.equal(previewIcon("close", 16), icon("close", 16), "fallback glyph uses the same contract");
  const baseRules = rules(read("styles/base.css"));
  const iconRule = baseRules.find(rule => rule.selector === ".icon:where([data-frame-ui])");
  assert.match(iconRule?.body ?? "", /display: block;/, "frame SVGs do not create an inline baseline gap");
  assert.match(iconRule.body, /flex: none;/, "frame SVG dimensions do not shrink");
});

test("style opt-in changes attributes only and retains the element builder's listeners and children", async () => withTestDocument(async () => {
  const original = await import("data:text/javascript;base64," + Buffer.from(before("src/shell/dom.js")).toString("base64"));
  let calls = 0;
  const build = builder => builder("button", { class: "example", title: "示例", style: { padding: "4px" },
    dataset: { selected: "true" }, onclick: () => calls++ }, builder("span", {}, "标签"));
  const current = build(h), old = build(original.h);
  const omitSkinMarker = node => typeof node === "string" ? node : { ...node,
    attributes: Object.fromEntries(Object.entries(node.attributes).filter(([key]) => key !== FRAME_UI_ATTRIBUTE)),
    children: node.children.map(omitSkinMarker) };
  assert.deepEqual(omitSkinMarker(serializeDom(current)), serializeDom(old));
  current.click(); old.click(); assert.equal(calls, 2);
}));

test("base, scrollbar and broad visual control rules require node opt-in while preserving declaration values", () => {
  for (const file of ["styles/base.css", "styles/scrollbars.css"]) {
    const current = rules(read(file)), original = rules(before(file));
    assert.deepEqual(current.map(rule => rule.body), original.map(rule => rule.body), file + " declarations");
  }
  for (const rule of rules(read("styles/base.css"))) {
    if (["html, body", "body"].includes(rule.selector)) continue;
    assert.ok(rule.selector.includes("[data-frame-ui]"), "ungated base rule: " + rule.selector);
  }
  for (const rule of rules(read("styles/scrollbars.css"))) {
    assert.ok(rule.selector.includes("[data-frame-ui]"));
    assert.ok(!rule.selector.includes("*"), "no subtree-wide scrollbar suppression");
  }
  for (const rule of rules(read("styles/structure-preview.css"))) {
    if (/(?:^|[\s>+~,])(?:button|input|select|textarea)\b/.test(rule.selector)) {
      for (const part of rule.selector.split(",")) assert.match(part, /(?:button|input|select|textarea):where\(\[data-frame-ui\]\)/);
    }
  }
  const base = read("styles/base.css");
  assert.ok(!/:where\(\[data-frame-ui\]\)\s+\*/.test(base), "owned parent must not opt in private children");
  assert.ok(!/\*\s*\{\s*(?:transition|animation|scrollbar)/.test(base));
});

test("shell rules retain their selectors and declarations after layout controls move to their own stylesheet", () => {
  // The historical snapshot predates the layout component split. Exclude only
  // that component's named families; all remaining shell rules stay ordered.
  const componentRule = rule => /\.v-(?:composer|layout|map|switch|size-input)\b/.test(rule.selector);
  const original = rules(before("styles/structure-preview.css"));
  const current = rules(read("styles/structure-preview.css"))
    .map(rule => ({ ...rule, selector: rule.selector.replaceAll(":where([data-frame-ui])", "") }));
  assert.ok(original.some(componentRule), "historical snapshot contains layout component rules");
  // Bottom-entry cleanup uses a square hit area. The adopted paper carrier
  // uses grid so the full score root occupies its reading-width container.
  // Transform only those named historical rules; inspect the current CSS intact.
  const voiceRule = '.v-voice-trigger[aria-expanded="true"]';
  assert.equal(original.filter(rule => rule.selector === voiceRule).length, 1);
  const expected = original.filter(rule => !componentRule(rule)).flatMap(rule => rule.selector === voiceRule ? [
    { selector: ".v-voice-icon", body: "display: grid; place-items: center; width: 20px; height: 24px; flex: none;" },
    { selector: '.v-doc-state[role="status"]', body: "display: grid; place-items: center; flex: none; margin-right: 0; width: 20px;" },
  ] : rule.selector === ".v-voice-trigger" ? [
    { selector: ".v-voice-trigger", body: "display: grid; place-items: center; width: 28px; height: 28px; padding: 0; color: var(--frame-muted);" },
  ] : rule.selector === ".v-paper" ? [
    { ...rule, body: "display: grid; " + rule.body },
  ] : [rule]);
  assert.deepEqual(current, expected,
    "shell rules retain all declarations except the explicit command chrome and paper carrier changes");

  const layout = rules(read("styles/workspace-layout.css"));
  assert.ok(layout.length > 0, "the component stylesheet must be present");
  for (const rule of layout) for (const part of rule.selector.split(",")) {
    assert.match(part.trim(), /^\.v-(?:composer|layout|map|size-input|sr-only)\b/,
      "layout rules must start in their own component namespace: " + part);
  }
  for (const file of ["runtime-preview.html", "structure-preview.html"]) {
    const loadedStyles = [...read(file).matchAll(/<link\b[^>]*href="([^"?]+)(?:\?[^"\s]*)?"[^>]*>/g)]
      .map(([, href]) => href);
    assert.ok(loadedStyles.includes("styles/structure-preview.css"), file + " loads the shell stylesheet");
    assert.ok(loadedStyles.includes("styles/workspace-layout.css"), file + " loads the layout stylesheet");
  }
});

test("theme aliases add a limited content port without changing any existing token or exposing geometry", () => {
  const oldTokens = new Map([...before("styles/tokens.css").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,key,value]) => [key,value]));
  const current = new Map([...read("styles/tokens.css").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,key,value]) => [key,value]));
  for (const [key,value] of oldTokens) assert.equal(current.get(key), value, key);
  const added = [...current.keys()].filter(key => !oldTokens.has(key));
  assert.deepEqual(added.sort(), ["--ui-font-family","--ui-text-color","--ui-muted-color","--ui-surface-color",
    "--ui-accent-color","--ui-focus-color","--ui-space-unit","--ui-radius"].sort());
  assert.ok(added.every(key => !/height|width|position|rail|dock/.test(key)));
});

test("frame switch decorations use separate node-opted styles and no CSS animation executor", () => {
  assert.match(read("styles/structure-preview.css"), /@import "\.\/frame-toggle-motion\.css";/);
  const css = read("styles/frame-toggle-motion.css");
  assert.doesNotMatch(css, /\b(?:transition|animation)\s*:/);
  for (const rule of rules(css)) assert.ok(rule.selector.includes(":where([data-frame-ui])"), rule.selector);
  assert.doesNotMatch(css, /\.v-layout|\.v-map|\.v-paper/);
});

function probe({ failMount = false } = {}) {
  const observations = { actions: 0, cleanups: 0, mounts: 0, context: null };
  const plugin = defineUiPlugin({ namespace: "example.skin", commands: [{ id: "example.skin.inspect", run: () => { observations.actions++; } }],
    ui: [{ id: "example.skin.panel", kind: "panel", title: "独立控件", slots: ["left","right"], defaultEnabled: true,
      permissions: { commands: ["example.skin.inspect"] }, mount(element, ctx) {
        observations.mounts++; observations.context = ctx;
        const content = document.createElement("div"); content.className = "example-skin";
        const style = document.createElement("style"); style.textContent = ".example-skin .probe-button { background: #6b3e8f; padding: 12px; transition: background-color 120ms; } .example-skin .probe-input { padding: 8px; } .example-skin .probe-scroll { overflow: auto; max-height: 120px; }";
        const button = document.createElement("button"); button.className = "probe-button"; button.textContent = "检查";
        const input = document.createElement("input"); input.className = "probe-input";
        const scroll = document.createElement("div"); scroll.className = "probe-scroll"; scroll.scrollTop = 48;
        const click = () => ctx.execute("example.skin.inspect"); button.addEventListener("click", click);
        content.append(style, button, input, scroll); element.append(content);
        ctx.onDispose(() => { button.removeEventListener("click", click); style.remove(); observations.cleanups++; });
        observations.content = content; observations.button = button; observations.input = input; observations.scroll = scroll; observations.style = style;
        if (failMount) throw new Error("probe mount failure");
      } }] });
  return { plugin, observations };
}

function mountProbe(options) {
  const { plugin, observations } = probe(options), router = createCommandRouter(), registry = createComponentRegistry(), notices = [];
  const platform = createPluginPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  platform.register(plugin); assert.equal(platform.start()[0].status, "active");
  const host = createComponentHost({ registry, router, notices: { push: value => notices.push(value) } });
  const cell = host.ensure("example.skin.panel", "panel");
  return { observations, router, registry, platform, host, cell, notices, dispose() { platform.dispose(); host.dispose(); } };
}

test("ordinary plugin controls stay unmarked through mount, resize variant, hide and cross-region moves", () => withTestDocument(() => {
  const current = mountProbe(), { cell, observations: state } = current;
  const left = h("div"), right = h("div"); document.body.append(left, right); left.append(cell);
  assert.equal(cell.getAttribute(FRAME_UI_ATTRIBUTE), "");
  for (const node of [state.content,state.button,state.input,state.scroll,state.style]) assert.equal(node.getAttribute(FRAME_UI_ATTRIBUTE), null);
  state.input.value = "保留文字"; state.input.focus(); state.button.click();
  current.host.setVariant("example.skin.panel", "list"); right.append(cell);
  current.host.setVisible("example.skin.panel", false); current.host.setVisible("example.skin.panel", true);
  assert.equal(current.host.ensure("example.skin.panel", "panel"), cell);
  assert.equal(state.mounts, 1); assert.equal(state.input.value, "保留文字"); assert.equal(state.scroll.scrollTop, 48);
  assert.equal(document.activeElement, state.input); assert.equal(state.actions, 1);
  assert.deepEqual(Object.keys(state.context).sort(), ["execute","notify","onDispose"]);
  assert.equal(state.button.getAttribute(FRAME_UI_ATTRIBUTE), null);
  current.dispose(); assert.equal(state.cleanups, 1); assert.equal(state.style.parentNode, null);
  state.button.click(); assert.equal(state.actions, 1);
  assert.equal(state.context.execute("example.skin.inspect").code, "component.disposed");
  current.dispose(); assert.equal(state.cleanups, 1); left.remove(); right.remove();
}));

test("mount failure releases private style/listeners and the host-owned fault uses the frame skin", () => withTestDocument(() => {
  const current = mountProbe({ failMount: true }), state = current.observations;
  assert.equal(state.cleanups, 1); assert.equal(state.style.parentNode, null);
  assert.equal(current.cell.querySelector(".component-fault").getAttribute(FRAME_UI_ATTRIBUTE), "");
  state.button.click(); assert.equal(state.actions, 0); assert.equal(current.notices.length, 1);
  current.dispose(); assert.equal(state.cleanups, 1);
}));

test("static review document opts in explicitly while both runtime entries retain private subtree ownership", () => {
  assert.match(read("sidebar-review.html"), /<body data-frame-document>/);
  for (const file of ["runtime-preview.html","index.html","structure-preview.html"]) assert.ok(!read(file).includes("data-frame-document"), file);
});


test("edge handle drawing is frame-opted, stays within chrome and has no independent CSS animation", () => {
  const css = read("styles/frame-edge-handles.css");
  assert.doesNotMatch(css, /\b(?:transition|animation)\s*:/);
  for (const rule of rules(css)) assert.ok(rule.selector.includes(":where([data-frame-ui])"), rule.selector);
  assert.doesNotMatch(css, /\.v-layout|\.v-map|\.v-paper|position:\s*fixed|inset:\s*0/);
  for (const side of ["left", "right"]) {
    const rule = rules(css).find(item => item.selector.includes('[data-edge="' + side + '"]'));
    assert.match(rule.body, /width: 6px;/, "side hit area stays in the rail gutter beside its tabs");
  }
  assert.match(read("styles/structure-preview.css"), /@import "\.\/frame-edge-handles\.css";/);
});
