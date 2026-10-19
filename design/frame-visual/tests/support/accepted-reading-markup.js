// Historical extraction tests retain all content, style, commands and states.
// Only revision-15's explicit frame-owned reading annotations are excluded;
// their behavior is checked separately, including real browser geometry.
export function omitAcceptedReadingMarkup(node) {
  if (typeof node !== "object" || !node?.children) return node;
  const attributes = { ...node.attributes };
  if (attributes.class?.split(" ").includes("v-layout-zoom-group")) return null;
  if (attributes.class === "v-zoom") {
    delete attributes["data-zoom"];
    return { ...node, attributes, children: [] };
  }
  if (attributes["data-frame-ui"] != null && attributes.role === "tablist"
    && attributes.class === "v-rail-list" && attributes["aria-label"] === "右侧栏页面") delete attributes["aria-label"];
  if (attributes["data-frame-ui"] != null && attributes["data-frame-reading"] != null) {
    if (attributes.id?.startsWith("frame-read-")) delete attributes.id;
    if (attributes["data-frame-reading-auto"] === "true") delete attributes.tabindex;
    if (attributes["data-frame-reading-name"] === "true") delete attributes["aria-label"];
    if (attributes.role === "region") delete attributes.role;
    for (const key of ["data-frame-reading", "data-frame-reading-auto", "data-frame-reading-name"]) delete attributes[key];
  }
  return { ...node, attributes, children: node.children.map(omitAcceptedReadingMarkup).filter(Boolean) };
}

// The runtime score slot is intentionally the one visual difference between
// the extracted shell and the historical static-image fixture. Normalize only
// that slot when comparing shell geometry; score rendering has its own tests.
export function normalizeScorePaperContent(node) {
  if (typeof node !== "object" || !node?.children) return node;
  if (node.attributes?.class === "v-paper") {
    const attributes = { ...node.attributes, "aria-label": "谱面纸张" };
    return { ...node, attributes, children: [{ scoreContent: true }] };
  }
  return { ...node, children: node.children.map(normalizeScorePaperContent) };
}

// The runtime now registers the layout page as frame.layout.page while the
// archived shell fixture still uses frame.builtin.layout. Normalize that
// migration-only identity in structural comparisons; live runtime tests assert
// the new id directly.
export function normalizeLegacyLayoutIdentity(node) {
  if (typeof node === "string") return node.replaceAll("frame.layout.page", "frame.builtin.layout");
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return node.map(normalizeLegacyLayoutIdentity);
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalizeLegacyLayoutIdentity(value)]));
}

// Only the authorized content-edit scope wording differs from the frozen
// shell. Do not rewrite the historical fixture or normalize other UI text.
export function normalizeContentEditScope(node) {
  if (typeof node !== "object" || !node?.children) return node;
  const attributes = { ...node.attributes };
  let children = node.children.map(normalizeContentEditScope);
  const names = { "assembly-cancel": "取消内容编辑", "assembly-done": "确认内容编辑" };
  if (Object.hasOwn(names, attributes.id)) {
    for (const key of ["aria-label", "data-tooltip", "title"]) attributes[key] = names[attributes.id];
  }
  if (attributes.class === "v-mode-name") children = children.map(child => child === "布局调整" ? "内容编辑" : child);
  if (attributes.class === "v-mode-detail") children = children.filter(child => child !== "栏内组件配置" && child !== "");
  // Only the historical expected tree receives the accepted stable editing
  // header/status revision. Current DOM is never filtered or rearranged.
  if (attributes.id === "composer-edit") children = children.map(child => typeof child === "object" && child?.tag === "span"
    ? { ...child, children: child.children.map(text => text === "编辑中" ? "编辑内容" : text) } : child);
  if (attributes.id === "layout-session" && attributes.class === "v-layout-session") attributes.class += " v-sr-only";
  if (attributes.class === "v-layout-content") {
    const changes = children.filter(child => child?.attributes?.class === "v-layout-changes");
    children = [...children.filter(child => child?.attributes?.class !== "v-layout-changes"), ...changes];
  }
  return { ...node, attributes, children };
}

// Apply only to the historical expected tree. The current shell is compared
// unchanged, so unrelated geometry, styles, menu commands and state still fail.
export function normalizeCommandBarChrome(node) {
  if (typeof node !== "object" || !node?.children) return node;
  const attributes = { ...node.attributes }, style = { ...node.style };
  let children = node.children.map(normalizeCommandBarChrome);
  if (attributes.class === "v-title") {
    attributes["aria-label"] = "命令栏";
    children = children.filter(child => child?.attributes?.class === "v-title-start");
  }
  if (attributes.class === "v-title-start") {
    children = children.filter(child => child?.attributes?.class !== "v-mac-buttons");
  }
  if (attributes.class?.split(" ").includes("visual-shell")) {
    delete style["--document-space"];
    // Historical expected tree only: this DOM double reports a 260px shell
    // and a menu ending at 350px, so the authorized shared handle has no room.
    // Dedicated geometry tests provide actual wide/narrow bounds separately.
    Object.assign(style, { "--frame-horizontal-handle-x": "260px",
      "--frame-horizontal-handle-left": "260px", "--frame-horizontal-handle-width": "0px" });
  }
  if (attributes.id === "voice-trigger") {
    const action = attributes["aria-expanded"] === "true" ? "收起下侧栏" : "展开下侧栏";
    attributes.title = action; attributes["data-tooltip"] = action;
    children = children.map(child => {
      if (child?.attributes?.class === "v-icon-wrap") return { tag: "span", style: {},
        attributes: { class: "v-voice-icon", "data-frame-ui": "", "aria-hidden": "true" }, children: [child] };
      if (child?.tag === "span" && child.children?.length === 1 && child.children[0] === "下侧栏") {
        return null;
      }
      return child;
    }).filter(Boolean);
  }
  return { ...node, attributes, style, children };
}

// Only the four newly authorized frame-owned handles differ from the frozen shell.
// The gesture suite independently asserts their exact count, semantics and live wiring.
export function omitFrameEdgeHandles(node) {
  if (typeof node !== "object" || !node?.children) return node;
  if (node.attributes?.class === "v-edge-handle" && node.attributes["data-frame-ui"] === ""
    && /^edge-handle-(left|right|top|voice)$/.test(node.attributes.id)) return null;
  return { ...node, children: node.children.map(omitFrameEdgeHandles).filter(Boolean) };
}


// Only the historical expected tree loses this obsolete unavailable-path hint.
// Current DOM remains strict; private or differently worded nodes are unchanged.
export function normalizeUnavailableLibraryHint(node) {
  if (typeof node !== "object" || !node?.children) return node;
  const attributes = node.attributes ?? {};
  const recognized = attributes.class === "v-left-empty" && attributes["data-frame-ui"] === "";
  return { ...node, children: node.children.map(child => recognized && child === "从模块库添加模块"
    ? "暂无内容" : normalizeUnavailableLibraryHint(child)) };
}

// Expected historical tree only. Its fixture count was hard-coded; the current
// shell hides unknown counts and independently tests real document projection.
export function normalizeUnknownMeasureCount(node) {
  if (typeof node !== "object" || !node?.children) return node;
  const attributes = node.attributes ?? {};
  if (node.tag === "span" && attributes.class === "v-slot-label"
    && attributes["data-frame-ui"] === "" && node.children.length === 1
    && node.children[0] === "16 小节") {
    return { ...node, attributes: { ...attributes, hidden: "" }, children: [] };
  }
  return { ...node, children: node.children.map(normalizeUnknownMeasureCount) };
}
