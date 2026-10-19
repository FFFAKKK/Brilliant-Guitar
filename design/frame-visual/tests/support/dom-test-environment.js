// Deliberately small DOM double for actual shell/lifecycle integration tests.
// It does not calculate browser layout or qualify pixels, fonts or accessibility.
const cssName = value => value.replace(/[A-Z]/g, char => "-" + char.toLowerCase());

// The observed Node v24.15.0 EventTarget removes capture=true with an options object,
// but not with the browser's boolean shorthand. Normalize at the DOM test boundary.
class TestEventTarget extends EventTarget {
  addEventListener(type, listener, options) {
    return super.addEventListener(type, listener, typeof options === "boolean" ? { capture: options } : options);
  }
  removeEventListener(type, listener, options) {
    return super.removeEventListener(type, listener, typeof options === "boolean" ? { capture: options } : options);
  }
}

class TestNode extends TestEventTarget {
  constructor(tag, document, raw = null) {
    super(); this.tag = tag; this.ownerDocument = document; this.raw = raw;
    this.parentNode = null; this.childNodes = []; this.attributes = new Map(); this.value = "";
    const values = new Map();
    this.style = new Proxy({ values, setProperty: (key, value) => values.set(key, String(value)),
      getPropertyValue: key => values.get(key) ?? "" }, {
      get: (target, key) => key in target ? target[key] : values.get(cssName(key)) ?? "",
      set: (target, key, value) => { values.set(cssName(key), String(value)); return true; },
    });
    this.dataset = new Proxy({}, { set: (target, key, value) => { target[key] = String(value); this.setAttribute("data-" + cssName(key), value); return true; } });
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(" ").filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(" ").filter(name => !names.includes(name)).join(" "); },
      contains: name => this.className.split(" ").includes(name),
    };
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  get tagName() { return this.tag.toUpperCase(); }
  get isConnected() { return this.ownerDocument.contains(this); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value) { this.setAttribute("id", value); }
  get className() { return this.getAttribute("class") ?? ""; }
  set className(value) { this.setAttribute("class", value); }
  get hidden() { return this.attributes.has("hidden"); }
  set hidden(value) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
  get disabled() { return this.attributes.has("disabled"); }
  set disabled(value) { if (value) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get tabIndex() { return Number(this.getAttribute("tabindex") ?? -1); }
  set tabIndex(value) { this.setAttribute("tabindex", value); }
  get children() { return this.childNodes.filter(node => node.tag !== "#text"); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.tag === "#text" ? this.raw : this.childNodes.map(node => node.textContent).join(""); }
  set textContent(value) { this.replaceChildren(String(value)); }
  get scrollWidth() { return this.textContent.length * 8; }
  set innerHTML(value) { this.replaceChildren(new TestNode("svg", this.ownerDocument, value)); }
  append(...nodes) {
    for (let node of nodes) {
      if (!(node instanceof TestNode)) node = new TestNode("#text", this.ownerDocument, String(node));
      node.remove(); node.parentNode = this; this.childNodes.push(node);
    }
  }
  insertBefore(node, next) {
    if (node === next) return node;
    node.remove(); const index = next == null ? this.childNodes.length : this.childNodes.indexOf(next);
    if (index < 0) throw new Error("Missing insertion reference");
    node.parentNode = this; this.childNodes.splice(index, 0, node); return node;
  }
  replaceChildren(...nodes) { for (const node of [...this.childNodes]) node.remove(); this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this);
    this.parentNode = null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  dispatchEvent(event) {
    if (!event.bubbles) return super.dispatchEvent(event);
    const path = [];
    for (let node = this; node; node = node.parentNode ?? node.host) path.push(node);
    if (path.includes(this.ownerDocument)) path.push(this.ownerDocument.defaultView);
    Object.defineProperty(event, "target", { configurable: true, value: this });
    Object.defineProperty(event, "composedPath", { configurable: true, value: () => path });
    for (const node of path) {
      EventTarget.prototype.dispatchEvent.call(node, event);
      if (event.cancelBubble) break;
    }
    return !event.defaultPrevented;
  }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return attribute[2] === undefined ? this.attributes.has(attribute[1]) : this.getAttribute(attribute[1]) === attribute[2];
    const compound = selector.match(/^([a-z]+)(\[.+\])$/);
    if (compound) return this.tag === compound[1] && this.matches(compound[2]);
    return this.tag === selector;
  }
  querySelectorAll(selector) {
    return this.childNodes.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() {
    const width = this.ownerDocument.width;
    if (this.classList.contains("v-title-start")) return { left: 0, right: 350, width: 350 };
    if (this.classList.contains("v-title-end")) return { left: width - 340, right: width, width: 340 };
    return { left: 0, top: 0, right: 260, bottom: 400, width: 260, height: 400 };
  }
}

export function serializeDom(node) {
  if (node.tag === "#text") return node.raw;
  if (node.raw !== null) return { raw: node.raw };
  return { tag: node.tag, attributes: Object.fromEntries([...node.attributes].sort()),
    style: Object.fromEntries([...node.style.values].sort()), children: node.childNodes.map(serializeDom) };
}

export async function withTestDocument(run, { width = 1440, height = 900 } = {}) {
  const names = ["document", "window", "innerWidth", "innerHeight"];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const document = Object.assign(new TestEventTarget(), { width, activeElement: null, createElement: tag => new TestNode(tag, document) });
  document.body = document.createElement("body"); document.body.parentNode = document;
  document.contains = node => node === document || document.body.contains(node);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => document.body.querySelector(selector);
  document.getElementById = id => document.body.querySelector("#" + id);
  const environment = { document, window: new TestEventTarget(), innerWidth: width, innerHeight: height };
  document.defaultView = environment.window;
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: environment[name] });
  try { return await run(environment); }
  finally {
    for (const name of names) {
      if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name)); else delete globalThis[name];
    }
  }
}
