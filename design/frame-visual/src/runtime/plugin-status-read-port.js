const freeze = value => Object.freeze(value);

function metadata(manifest, contributions) {
  const ui = contributions ?? manifest;
  return freeze({
    namespace: manifest.id ?? manifest.namespace,
    ...(manifest.id ? { name: manifest.name, version: manifest.version, apiVersion: manifest.apiVersion } : {}),
    components: freeze((ui.components ?? []).map(component => freeze({
      id: component.id,
      title: component.title ?? component.id,
      role: component.role,
      kind: component.uiKind,
      slots: freeze([...(component.slots ?? [])]),
    }))),
    commands: freeze((ui.commands ?? []).map(command => freeze({ id: command.id, label: command.label ?? command.id }))),
    menuItems: freeze((ui.menuItems ?? []).map(item => freeze({
      menu: item.menu,
      command: item.command,
      label: item.label ?? item.command,
    }))),
    shortcuts: freeze((ui.shortcuts ?? []).map(shortcut => freeze({
      id: shortcut.id,
      command: shortcut.command,
      scope: shortcut.scope ?? "global",
      keys: freeze([...(shortcut.keys ?? [])]),
    }))),
  });
}

/** Read-only projection of the fixed-session plugin platform. */
export function createPluginStatusReadPort(platform) {
  if (!platform || (typeof platform.list !== "function" && typeof platform.describe !== "function")
    || typeof platform.subscribe !== "function") {
    throw new TypeError("插件状态端口需要平台 list/describe 与 subscribe");
  }
  const snapshot = () => freeze((platform.describe?.() ?? platform.list()).map(record => freeze({
    namespace: record.manifest?.id ?? record.namespace,
    status: record.status,
    active: record.active,
    ...(record.manifest ? { manifest: metadata(record.manifest, platform.uiContributions?.(record.manifest.id)) } : {}),
    ...(record.error ? { error: record.error?.message ?? String(record.error) } : {}),
  })));
  return freeze({ snapshot, subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("插件状态订阅者必须是函数");
    return platform.subscribe(() => listener(snapshot()));
  } });
}
