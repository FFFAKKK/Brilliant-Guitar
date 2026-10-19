import { readFileSync } from "node:fs";

const entry = new URL("../../src/runtime-preview.js", import.meta.url);
const factory = new URL("../../src/host/workspace-runtime.js", import.meta.url);
let serial = 0;
const asModule = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const resolveImports = (source, base) => source.replace(/from "(\.[^"]+)"/g,
  (_, dependency) => `from "${new URL(dependency, base).href}"`);

// Test-only lexical inspection of a copy. No test hooks or broad capabilities
// are added to the production runtime API. Historical assertions remain intact.
export async function loadRuntimeForTest({ observeContexts = false, transform = source => source } = {}) {
  let source = resolveImports(readFileSync(factory, "utf8"), factory);
  const builtinMarker = "const builtin = createBuiltinPages(layout, contents, actions, { includeLayout: false });";
  const returnMarker = "return Object.freeze({ execute: (id, payload)";
  if (!source.includes(builtinMarker) || !source.includes(returnMarker)) throw new Error("Runtime test inspection markers changed");
  source = source.replace(builtinMarker, builtinMarker + `
    const observedContexts = {};
    ${observeContexts ? `for (const definition of builtin.components) { const mount = definition.mount;
      definition.mount = (element, ctx, options) => { observedContexts[definition.id] = ctx; return mount(element, ctx, options); }; }` : ""}`);
  const layoutMarker = "const layoutPlugin = createWorkspaceLayoutPlugin(layout, contents, actions, { view });";
  if (!source.includes(layoutMarker)) throw new Error("Runtime layout plugin marker changed");
  source = source.replace(layoutMarker, `let layoutPlugin = createWorkspaceLayoutPlugin(layout, contents, actions, { view });
    ${observeContexts ? `layoutPlugin = { ...layoutPlugin, components: layoutPlugin.components.map((definition) => {
      const mount = definition.mount;
      return { ...definition, mount(element, ctx, options) {
        observedContexts[definition.id] = ctx; return mount(element, ctx, options);
      } };
    }) };` : ""}`);
  source = source.replace(returnMarker, `return Object.freeze({ inspection: {
    observedContexts, router, shortcuts, registry, platform, store, actionOwner, menus, menuBinding,
    dialogs, shell, stage, components, composition, editSession, notices, layout, contents, actions, view, viewState }, execute: (id, payload)`);
  source = transform(source);
  const url = asModule(source + `\n// runtime-inspection-${serial++}`);
  return { url, ...await import(url) };
}

export async function importPreviewForTest(options = {}) {
  const { url } = await loadRuntimeForTest(options);
  const root = document.createElement("div"); root.id = "app"; document.body.append(root);
  const source = resolveImports(readFileSync(entry, "utf8"), entry).replace(new URL("./host/workspace-runtime.js", entry).href, url)
    .replace(/\nwindow\.addEventListener\("pagehide", \(\) => \{[\s\S]*?\}, \{ once: true \}\);\n$/, "\n")
    + `\nexport { runtime }; // preview-inspection-${serial++}`;
  const { runtime } = await import(asModule(source));
  return { root, runtime, ...runtime.inspection };
}

export async function importOriginalPreviewForTest() {
  const before = new URL("../../evidence/runtime-composition/before-source/src/runtime-preview.js", import.meta.url);
  const shell = new URL("../../src/shell/visual-workbench.js", import.meta.url);
  const originalShell = new URL("../../evidence/runtime-composition/before-source/src/shell/visual-workbench.js", import.meta.url);
  const shellUrl = asModule(resolveImports(readFileSync(originalShell, "utf8"), shell));
  const source = resolveImports(readFileSync(before, "utf8"), entry)
    .replace(shell.href, shellUrl)
    + `\nexport { router, store, composition }; // original-preview-${serial++}`;
  return import(asModule(source));
}
