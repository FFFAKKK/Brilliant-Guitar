// An internal contribution module of the core UI package, not another platform/router.
export function createDocumentCommands(actions) {
  if (!actions) return {};
  for (const method of ["newScore", "open", "reload", "canReplace", "canReload"]) {
    if (typeof actions[method] !== "function") throw new TypeError(`文档动作缺少 ${method}`);
  }
  const commands = [
    { id: "notation.core.document.new", label: "新建作品", enabled: actions.canReplace,
      run: payload => actions.newScore(Object.keys(payload ?? {}).length ? payload : undefined) },
    { id: "notation.core.document.open", label: "打开作品…", enabled: actions.canReplace, run: () => actions.open() },
    { id: "notation.core.document.reload", label: "重新读取作品", enabled: actions.canReload, run: () => actions.reload() },
  ];
  const menuItems = commands.map((command, order) => ({ menu: "file", order, label: command.label, command: command.id }));
  const shortcuts = [{ id: "notation.core.document.new-key", command: commands[0].id, keys: ["Mod+N"], scope: "global" },
    { id: "notation.core.document.open-key", command: commands[1].id, keys: ["Mod+O"], scope: "global" }];
  function contribute(name, method, enabled, label, menu, order, keys, invoke = () => actions[method]()) {
    if (typeof actions[method] !== "function") return;
    if (typeof actions[enabled] !== "function") throw new TypeError(`文档动作缺少 ${enabled}`);
    const id = `notation.core.document.${name}`;
    commands.push({ id, label, enabled: actions[enabled], run: invoke });
    menuItems.push({ menu, order, label, command: id });
    shortcuts.push({ id: `${id}-key`, command: id, keys, scope: "global" });
  }
  contribute("undo", "undo", "canUndo", "撤销", "edit", 0, ["Mod+Z"]);
  contribute("redo", "redo", "canRedo", "重做", "edit", 1, ["Mod+Shift+Z", "Mod+Y"]);
  contribute("save", "save", "canSave", "保存", "file", 3, ["Mod+S"]);
  contribute("save-as", "save", "canSaveAs", "另存为…", "file", 4, ["Mod+Shift+S"], () => actions.save(true));
  return { commands, menuItems, shortcuts };
}
