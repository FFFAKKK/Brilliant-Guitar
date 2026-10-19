import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { normalizeUnknownMeasureCount } from "./support/accepted-reading-markup.js";

for (const slot of ["top", "bottom"]) test(`${slot} contributions reuse one host, command and persistent cell`, () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  let mounts = 0, disposals = 0, calls = 0, ctx, cell, input;
  const visibility = [], command = `example.${slot}.run`;
  const plugin = defineUiPlugin({ namespace: `example.${slot}`,
    commands: [{ id: command, run() { calls++; return { ok: true }; } }],
    ui: [{ id: `example.${slot}.status`, kind: "slotItem", title: "横向内容",
      slots: [slot], minWidth: 40, permissions: { commands: [command] },
      mount(element, context) {
        mounts++; cell = element; ctx = context;
        input = document.createElement("input"); input.value = "keep";
        const button = document.createElement("button"); button.textContent = "执行";
        button.addEventListener("click", () => ctx.execute(command));
        element.append(input, button);
        return { setVisible: value => visibility.push(value), dispose() { disposals++; } };
      } }],
  });
  const runtime = createWorkspaceRuntime({ root, plugins: [plugin] });
  const region = slot === "top" ? "top" : "voice";
  try {
    assert.equal(runtime.execute(C.configureRegion, { region, open: true }).ok, true);
    assert.equal(mounts, 1); assert.ok(root.contains(cell));
    assert.equal(cell.dataset.variant, slot); assert.equal(cell.style.getPropertyValue("min-width"), "40px");
    assert.equal(root.querySelectorAll(".runtime-slot-cell").length, 1);
    cell.querySelector("button").click(); assert.equal(calls, 1);
    assert.equal(ctx.execute(C.region, { region: "left" }).code, "permission.denied");
    runtime.execute(C.configureRegion, { region, open: false });
    assert.equal(visibility.at(-1), false);
    runtime.execute(C.configureRegion, { region, open: true });
    assert.equal(visibility.at(-1), true); assert.equal(mounts, 1);
    assert.equal(root.querySelector(".runtime-slot-cell"), cell); assert.equal(input.value, "keep");
    if (slot === "bottom") assert.equal(root.querySelector(".v-voice-placeholder").hidden, true);
  } finally { runtime.dispose(); root.remove(); }
  assert.equal(disposals, 1); runtime.dispose(); assert.equal(disposals, 1);
  assert.equal(ctx.execute(command).code, "component.disposed"); assert.equal(calls, 1);
}));

test("a shell without a document does not display the old fictional measure count", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createWorkspaceRuntime({ root });
  try {
    assert.equal(root.textContent.includes("16 小节"), false);
    const labels = root.querySelectorAll(".v-slot-label");
    assert.ok(labels.some(node => node.hidden && node.textContent === ""));
  } finally { runtime.dispose(); root.remove(); }
}));

test("historical count normalization is exact and does not ignore actual, private or changed content", () => {
  const historical = { tag: "span", attributes: { class: "v-slot-label", "data-frame-ui": "" },
    style: {}, children: ["16 小节"] };
  assert.deepEqual(normalizeUnknownMeasureCount(historical),
    { ...historical, attributes: { ...historical.attributes, hidden: "" }, children: [] });
  for (const changed of [
    { ...historical, children: ["17 小节"] },
    { ...historical, children: ["16 小节", "unexpected"] },
    { ...historical, attributes: { class: "v-slot-label" } },
    { ...historical, attributes: { ...historical.attributes, class: "other" } },
    { ...historical, tag: "div" },
  ]) assert.deepEqual(normalizeUnknownMeasureCount(changed), changed);
});
