// Review fixture only: grey blocks that report their slot, variant and size.
// It installs through the same public manifest as any real plugin; remove it and the frame still works.
const block = (label) => (root, host, { variant }) => {
  root.classList.add("placeholder");
  const name = document.createElement("span");
  const meta = document.createElement("small");
  name.textContent = label;
  root.append(name, meta);
  const describe = () => { meta.textContent = `${root.dataset.variant} · ${Math.round(root.clientWidth)}×${Math.round(root.clientHeight)}`; };
  const observer = new ResizeObserver(describe);
  observer.observe(root);
  describe(variant);
  return { setVariant: describe, dispose: () => observer.disconnect() };
};

const dockable = (id, title, defaultSlot, slots = ["top", "left", "right", "bottom"]) => ({
  id: `fixture.${id}`, title, role: "tool", slots, defaultSlot, mount: block(title),
});

export const placeholderPlugin = {
  namespace: "fixture",
  components: [
    { id: "fixture.stage", title: "中央视图", role: "view", slots: ["stage"], mount: block("中央视图") },
    dockable("top-a", "上 A", "top"),
    dockable("top-b", "上 B", "top"),
    dockable("left-a", "左 A", "left"),
    dockable("left-b", "左 B", "left"),
    dockable("right-a", "右 A", "right", ["left", "right", "bottom"]),
    dockable("bottom-a", "下 A", "bottom", ["left", "right", "bottom"]),
    dockable("bottom-b", "下 B", "bottom", ["left", "right", "bottom"]),
  ],
};
