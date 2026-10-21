// Generated from the existing workbench Tauri settings service. Run npm run startup:build.

// ../../apps/workbench/node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}

// ../../apps/workbench/node_modules/@tauri-apps/api/core.js
var _Channel_onmessage;
var _Channel_nextMessageIndex;
var _Channel_pendingMessages;
var _Channel_messageEndIndex;
var _Resource_rid;
var SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
function transformCallback(callback, once2 = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
}
var Channel = class {
  constructor(onmessage) {
    _Channel_onmessage.set(this, void 0);
    _Channel_nextMessageIndex.set(this, 0);
    _Channel_pendingMessages.set(this, []);
    _Channel_messageEndIndex.set(this, void 0);
    __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
    }), "f");
    this.id = transformCallback((rawMessage) => {
      const index = rawMessage.index;
      if ("end" in rawMessage) {
        if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
          this.cleanupCallback();
        } else {
          __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
        }
        return;
      }
      const message = rawMessage.message;
      if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
        __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
        __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
          const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
          delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        }
        if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
          this.cleanupCallback();
        }
      } else {
        __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
      }
    });
  }
  cleanupCallback() {
    window.__TAURI_INTERNALS__.unregisterCallback(this.id);
  }
  set onmessage(handler) {
    __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
  }
  get onmessage() {
    return __classPrivateFieldGet(this, _Channel_onmessage, "f");
  }
  [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
    return `__CHANNEL__:${this.id}`;
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
var Resource = class {
  get rid() {
    return __classPrivateFieldGet(this, _Resource_rid, "f");
  }
  constructor(rid) {
    _Resource_rid.set(this, void 0);
    __classPrivateFieldSet(this, _Resource_rid, rid, "f");
  }
  /**
   * Destroys and cleans up this resource from memory.
   * **You should not call any method on this object anymore and should drop any reference to it.**
   */
  async close() {
    return invoke("plugin:resources|close", {
      rid: this.rid
    });
  }
};
_Resource_rid = /* @__PURE__ */ new WeakMap();
function isTauri() {
  return !!(globalThis || window).isTauri;
}

// ../../apps/workbench/node_modules/@tauri-apps/api/dpi.js
var LogicalSize = class {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.width = args[0].Logical.width;
        this.height = args[0].Logical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the logical size to a physical one.
   * @example
   * ```typescript
   * import { LogicalSize } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = new LogicalSize(400, 500);
   * const physical = size.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var PhysicalSize = class {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.width = args[0].Physical.width;
        this.height = args[0].Physical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the physical size to a logical one.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = await appWindow.innerSize(); // PhysicalSize
   * const logical = size.toLogical(factor);
   * ```
   */
  toLogical(scaleFactor) {
    return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var Size = class {
  constructor(size) {
    this.size = size;
  }
  toLogical(scaleFactor) {
    return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
  }
  toPhysical(scaleFactor) {
    return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.size.type}`]: {
        width: this.size.width,
        height: this.size.height
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var LogicalPosition = class {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.x = args[0].Logical.x;
        this.y = args[0].Logical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the logical position to a physical one.
   * @example
   * ```typescript
   * import { LogicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new LogicalPosition(400, 500);
   * const physical = position.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var PhysicalPosition = class {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.x = args[0].Physical.x;
        this.y = args[0].Physical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the physical position to a logical one.
   * @example
   * ```typescript
   * import { PhysicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new PhysicalPosition(400, 500);
   * const physical = position.toLogical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toLogical(scaleFactor) {
    return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
var Position = class {
  constructor(position) {
    this.position = position;
  }
  toLogical(scaleFactor) {
    return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
  }
  toPhysical(scaleFactor) {
    return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.position.type}`]: {
        x: this.position.x,
        y: this.position.y
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};

// ../../apps/workbench/node_modules/@tauri-apps/api/event.js
var TauriEvent;
(function(TauriEvent2) {
  TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
  TauriEvent2["WINDOW_MOVED"] = "tauri://move";
  TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
  TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
  TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
  TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
  TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
  TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
  TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
  TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
  TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
  TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
  TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
  TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
  TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
  TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
async function _unlisten(event, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
  await invoke("plugin:event|unlisten", {
    event,
    eventId
  });
}
async function listen(event, handler, options) {
  var _a;
  const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke("plugin:event|listen", {
    event,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event, eventId);
  });
}
async function once(event, handler, options) {
  return listen(event, (eventData) => {
    void _unlisten(event, eventData.id);
    handler(eventData);
  }, options);
}
async function emit(event, payload) {
  await invoke("plugin:event|emit", {
    event,
    payload
  });
}
async function emitTo(target, event, payload) {
  const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
  await invoke("plugin:event|emit_to", {
    target: eventTarget,
    event,
    payload
  });
}

// ../../apps/workbench/node_modules/@tauri-apps/api/image.js
var Image = class _Image extends Resource {
  /**
   * Creates an Image from a resource ID. For internal use only.
   *
   * @ignore
   */
  constructor(rid) {
    super(rid);
  }
  /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
  static async new(rgba, width, height) {
    return invoke("plugin:image|new", {
      rgba: transformImage(rgba),
      width,
      height
    }).then((rid) => new _Image(rid));
  }
  /**
   * Creates a new image using the provided bytes by inferring the file format.
   * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   */
  static async fromBytes(bytes) {
    return invoke("plugin:image|from_bytes", {
      bytes: transformImage(bytes)
    }).then((rid) => new _Image(rid));
  }
  /**
   * Creates a new image using the provided path.
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   */
  static async fromPath(path) {
    return invoke("plugin:image|from_path", { path }).then((rid) => new _Image(rid));
  }
  /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
  async rgba() {
    return invoke("plugin:image|rgba", {
      rid: this.rid
    }).then((buffer) => new Uint8Array(buffer));
  }
  /** Returns the size of this image.  */
  async size() {
    return invoke("plugin:image|size", { rid: this.rid });
  }
};
function transformImage(image) {
  const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
  return ret;
}

// ../../apps/workbench/node_modules/@tauri-apps/api/window.js
var UserAttentionType;
(function(UserAttentionType2) {
  UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
  UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
})(UserAttentionType || (UserAttentionType = {}));
var CloseRequestedEvent = class {
  constructor(event) {
    this._preventDefault = false;
    this.event = event.event;
    this.id = event.id;
  }
  preventDefault() {
    this._preventDefault = true;
  }
  isPreventDefault() {
    return this._preventDefault;
  }
};
var ProgressBarStatus;
(function(ProgressBarStatus2) {
  ProgressBarStatus2["None"] = "none";
  ProgressBarStatus2["Normal"] = "normal";
  ProgressBarStatus2["Indeterminate"] = "indeterminate";
  ProgressBarStatus2["Paused"] = "paused";
  ProgressBarStatus2["Error"] = "error";
})(ProgressBarStatus || (ProgressBarStatus = {}));
function getCurrentWindow() {
  return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWindows() {
  return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
var localTauriEvents = ["tauri://created", "tauri://error"];
var Window = class {
  /**
   * Creates a new Window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const appWindow = new Window('my-label');
   * appWindow.once('tauri://created', function () {
   *  // window successfully created
   * });
   * appWindow.once('tauri://error', function (e) {
   *  // an error happened creating the window
   * });
   * ```
   *
   * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
   * @returns The {@link Window} instance to communicate with the window.
   */
  constructor(label, options = {}) {
    var _a;
    this.label = label;
    this.listeners = /* @__PURE__ */ Object.create(null);
    if (!(options === null || options === void 0 ? void 0 : options.skip)) {
      invoke("plugin:window|create", {
        options: {
          ...options,
          parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
          label
        }
      }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
    }
  }
  /**
   * Gets the Window associated with the given label.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const mainWindow = Window.getByLabel('main');
   * ```
   *
   * @param label The window label.
   * @returns The Window instance to communicate with the window or null if the window doesn't exist.
   */
  static async getByLabel(label) {
    var _a;
    return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
  }
  /**
   * Get an instance of `Window` for the current window.
   */
  static getCurrent() {
    return getCurrentWindow();
  }
  /**
   * Gets a list of instances of `Window` for all available windows.
   */
  static async getAll() {
    return getAllWindows();
  }
  /**
   *  Gets the focused window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const focusedWindow = Window.getFocusedWindow();
   * ```
   *
   * @returns The Window instance or `undefined` if there is not any focused window.
   */
  static async getFocusedWindow() {
    for (const w of await getAllWindows()) {
      if (await w.isFocused()) {
        return w;
      }
    }
    return null;
  }
  /**
   * Listen to an emitted event on this window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
   *   console.log(`Got error: ${payload}`);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async listen(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners = this.listeners[event];
        listeners.splice(listeners.indexOf(handler), 1);
      };
    }
    return listen(event, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Listen to an emitted event on this window only once.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
   *   console.log(`Window initialized!`);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async once(event, handler) {
    if (this._handleTauriEvent(event, handler)) {
      return () => {
        const listeners = this.listeners[event];
        listeners.splice(listeners.indexOf(handler), 1);
      };
    }
    return once(event, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Emits an event to all {@link EventTarget|targets}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emit(event, payload) {
    if (localTauriEvents.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emit(event, payload);
  }
  /**
   * Emits an event to all {@link EventTarget|targets} matching the given target.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emitTo(target, event, payload) {
    if (localTauriEvents.includes(event)) {
      for (const handler of this.listeners[event] || []) {
        handler({
          event,
          id: -1,
          payload
        });
      }
      return;
    }
    return emitTo(target, event, payload);
  }
  /** @ignore */
  _handleTauriEvent(event, handler) {
    if (localTauriEvents.includes(event)) {
      if (!(event in this.listeners)) {
        this.listeners[event] = [handler];
      } else {
        this.listeners[event].push(handler);
      }
      return true;
    }
    return false;
  }
  // Getters
  /**
   * The scale factor that can be used to map physical pixels to logical pixels.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const factor = await getCurrentWindow().scaleFactor();
   * ```
   *
   * @returns The window's monitor scale factor.
   */
  async scaleFactor() {
    return invoke("plugin:window|scale_factor", {
      label: this.label
    });
  }
  /**
   * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().innerPosition();
   * ```
   *
   * @returns The window's inner position.
   */
  async innerPosition() {
    return invoke("plugin:window|inner_position", {
      label: this.label
    }).then((p) => new PhysicalPosition(p));
  }
  /**
   * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().outerPosition();
   * ```
   *
   * @returns The window's outer position.
   */
  async outerPosition() {
    return invoke("plugin:window|outer_position", {
      label: this.label
    }).then((p) => new PhysicalPosition(p));
  }
  /**
   * The physical size of the window's client area.
   * The client area is the content of the window, excluding the title bar and borders.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().innerSize();
   * ```
   *
   * @returns The window's inner size.
   */
  async innerSize() {
    return invoke("plugin:window|inner_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * The physical size of the entire window.
   * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().outerSize();
   * ```
   *
   * @returns The window's outer size.
   */
  async outerSize() {
    return invoke("plugin:window|outer_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * Gets the window's current fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const fullscreen = await getCurrentWindow().isFullscreen();
   * ```
   *
   * @returns Whether the window is in fullscreen mode or not.
   */
  async isFullscreen() {
    return invoke("plugin:window|is_fullscreen", {
      label: this.label
    });
  }
  /**
   * Gets the window's current minimized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimized = await getCurrentWindow().isMinimized();
   * ```
   */
  async isMinimized() {
    return invoke("plugin:window|is_minimized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximized = await getCurrentWindow().isMaximized();
   * ```
   *
   * @returns Whether the window is maximized or not.
   */
  async isMaximized() {
    return invoke("plugin:window|is_maximized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current focus state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const focused = await getCurrentWindow().isFocused();
   * ```
   *
   * @returns Whether the window is focused or not.
   */
  async isFocused() {
    return invoke("plugin:window|is_focused", {
      label: this.label
    });
  }
  /**
   * Gets the window's current decorated state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const decorated = await getCurrentWindow().isDecorated();
   * ```
   *
   * @returns Whether the window is decorated or not.
   */
  async isDecorated() {
    return invoke("plugin:window|is_decorated", {
      label: this.label
    });
  }
  /**
   * Gets the window's current resizable state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const resizable = await getCurrentWindow().isResizable();
   * ```
   *
   * @returns Whether the window is resizable or not.
   */
  async isResizable() {
    return invoke("plugin:window|is_resizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native maximize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximizable = await getCurrentWindow().isMaximizable();
   * ```
   *
   * @returns Whether the window's native maximize button is enabled or not.
   */
  async isMaximizable() {
    return invoke("plugin:window|is_maximizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native minimize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimizable = await getCurrentWindow().isMinimizable();
   * ```
   *
   * @returns Whether the window's native minimize button is enabled or not.
   */
  async isMinimizable() {
    return invoke("plugin:window|is_minimizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native close button state.
   *
   * #### Platform-specific
   *
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const closable = await getCurrentWindow().isClosable();
   * ```
   *
   * @returns Whether the window's native close button is enabled or not.
   */
  async isClosable() {
    return invoke("plugin:window|is_closable", {
      label: this.label
    });
  }
  /**
   * Gets the window's current visible state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const visible = await getCurrentWindow().isVisible();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isVisible() {
    return invoke("plugin:window|is_visible", {
      label: this.label
    });
  }
  /**
   * Gets the window's current title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const title = await getCurrentWindow().title();
   * ```
   */
  async title() {
    return invoke("plugin:window|title", {
      label: this.label
    });
  }
  /**
   * Gets the window's current theme.
   *
   * #### Platform-specific
   *
   * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const theme = await getCurrentWindow().theme();
   * ```
   *
   * @returns The window theme.
   */
  async theme() {
    return invoke("plugin:window|theme", {
      label: this.label
    });
  }
  /**
   * Whether the window is configured to be always on top of other windows or not.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isAlwaysOnTop() {
    return invoke("plugin:window|is_always_on_top", {
      label: this.label
    });
  }
  async activityName() {
    return invoke("plugin:window|activity_name", {
      label: this.label
    });
  }
  async sceneIdentifier() {
    return invoke("plugin:window|scene_identifier", {
      label: this.label
    });
  }
  // Setters
  /**
   * Centers the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().center();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async center() {
    return invoke("plugin:window|center", {
      label: this.label
    });
  }
  /**
   *  Requests user attention to the window, this has no effect if the application
   * is already focused. How requesting for user attention manifests is platform dependent,
   * see `UserAttentionType` for details.
   *
   * Providing `null` will unset the request for user attention. Unsetting the request for
   * user attention might not be done automatically by the WM when the window receives input.
   *
   * #### Platform-specific
   *
   * - **macOS:** `null` has no effect.
   * - **Linux:** Urgency levels have the same effect.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().requestUserAttention();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async requestUserAttention(requestType) {
    let requestType_ = null;
    if (requestType) {
      if (requestType === UserAttentionType.Critical) {
        requestType_ = { type: "Critical" };
      } else {
        requestType_ = { type: "Informational" };
      }
    }
    return invoke("plugin:window|request_user_attention", {
      label: this.label,
      value: requestType_
    });
  }
  /**
   * Updates the window resizable flag.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setResizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setResizable(resizable) {
    return invoke("plugin:window|set_resizable", {
      label: this.label,
      value: resizable
    });
  }
  /**
   * Enable or disable the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setEnabled(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async setEnabled(enabled) {
    return invoke("plugin:window|set_enabled", {
      label: this.label,
      value: enabled
    });
  }
  /**
   * Whether the window is enabled or disabled.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setEnabled(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async isEnabled() {
    return invoke("plugin:window|is_enabled", {
      label: this.label
    });
  }
  /**
   * Sets whether the window's native maximize button is enabled or not.
   * If resizable is set to false, this setting is ignored.
   *
   * #### Platform-specific
   *
   * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaximizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMaximizable(maximizable) {
    return invoke("plugin:window|set_maximizable", {
      label: this.label,
      value: maximizable
    });
  }
  /**
   * Sets whether the window's native minimize button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinimizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMinimizable(minimizable) {
    return invoke("plugin:window|set_minimizable", {
      label: this.label,
      value: minimizable
    });
  }
  /**
   * Sets whether the window's native close button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setClosable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setClosable(closable) {
    return invoke("plugin:window|set_closable", {
      label: this.label,
      value: closable
    });
  }
  /**
   * Sets the window title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setTitle('Tauri');
   * ```
   *
   * @param title The new title
   * @returns A promise indicating the success or failure of the operation.
   */
  async setTitle(title) {
    return invoke("plugin:window|set_title", {
      label: this.label,
      value: title
    });
  }
  /**
   * Maximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().maximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async maximize() {
    return invoke("plugin:window|maximize", {
      label: this.label
    });
  }
  /**
   * Unmaximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unmaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async unmaximize() {
    return invoke("plugin:window|unmaximize", {
      label: this.label
    });
  }
  /**
   * Toggles the window maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().toggleMaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async toggleMaximize() {
    return invoke("plugin:window|toggle_maximize", {
      label: this.label
    });
  }
  /**
   * Minimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().minimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async minimize() {
    return invoke("plugin:window|minimize", {
      label: this.label
    });
  }
  /**
   * Unminimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unminimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async unminimize() {
    return invoke("plugin:window|unminimize", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to true.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().show();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async show() {
    return invoke("plugin:window|show", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to false.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().hide();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async hide() {
    return invoke("plugin:window|hide", {
      label: this.label
    });
  }
  /**
   * Closes the window.
   *
   * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().close();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async close() {
    return invoke("plugin:window|close", {
      label: this.label
    });
  }
  /**
   * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().destroy();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async destroy() {
    return invoke("plugin:window|destroy", {
      label: this.label
    });
  }
  /**
   * Whether the window should have borders and bars.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setDecorations(false);
   * ```
   *
   * @param decorations Whether the window should have borders and bars.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setDecorations(decorations) {
    return invoke("plugin:window|set_decorations", {
      label: this.label,
      value: decorations
    });
  }
  /**
   * Whether or not the window should have shadow.
   *
   * #### Platform-specific
   *
   * - **Windows:**
   *   - `false` has no effect on decorated window, shadows are always ON.
   *   - `true` will make undecorated window have a 1px white border,
   * and on Windows 11, it will have a rounded corners.
   * - **Linux:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setShadow(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setShadow(enable) {
    return invoke("plugin:window|set_shadow", {
      label: this.label,
      value: enable
    });
  }
  /**
   * Set window effects.
   */
  async setEffects(effects) {
    return invoke("plugin:window|set_effects", {
      label: this.label,
      value: effects
    });
  }
  /**
   * Clear any applied effects if possible.
   */
  async clearEffects() {
    return invoke("plugin:window|set_effects", {
      label: this.label,
      value: null
    });
  }
  /**
   * Whether the window should always be on top of other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnTop(true);
   * ```
   *
   * @param alwaysOnTop Whether the window should always be on top of other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setAlwaysOnTop(alwaysOnTop) {
    return invoke("plugin:window|set_always_on_top", {
      label: this.label,
      value: alwaysOnTop
    });
  }
  /**
   * Whether the window should always be below other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnBottom(true);
   * ```
   *
   * @param alwaysOnBottom Whether the window should always be below other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setAlwaysOnBottom(alwaysOnBottom) {
    return invoke("plugin:window|set_always_on_bottom", {
      label: this.label,
      value: alwaysOnBottom
    });
  }
  /**
   * Prevents the window contents from being captured by other apps.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setContentProtected(true);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setContentProtected(protected_) {
    return invoke("plugin:window|set_content_protected", {
      label: this.label,
      value: protected_
    });
  }
  /**
   * Resizes the window with a new inner size.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSize(size) {
    return invoke("plugin:window|set_size", {
      label: this.label,
      value: size instanceof Size ? size : new Size(size)
    });
  }
  /**
   * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMinSize(size) {
    return invoke("plugin:window|set_min_size", {
      label: this.label,
      value: size instanceof Size ? size : size ? new Size(size) : null
    });
  }
  /**
   * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMaxSize(size) {
    return invoke("plugin:window|set_max_size", {
      label: this.label,
      value: size instanceof Size ? size : size ? new Size(size) : null
    });
  }
  /**
   * Sets the window inner size constraints.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
   * ```
   *
   * @param constraints The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSizeConstraints(constraints) {
    function logical(pixel) {
      return pixel ? { Logical: pixel } : null;
    }
    return invoke("plugin:window|set_size_constraints", {
      label: this.label,
      value: {
        minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
        minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
        maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
        maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
      }
    });
  }
  /**
   * Sets the window outer position.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
   * ```
   *
   * @param position The new position, in logical or physical pixels.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setPosition(position) {
    return invoke("plugin:window|set_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Sets the window fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFullscreen(true);
   * ```
   *
   * @param fullscreen Whether the window should go to fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFullscreen(fullscreen) {
    return invoke("plugin:window|set_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
   * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
   *
   * On other platforms, this is the same as {@link Window.setFullscreen}.
   *
   * @param fullscreen Whether the window should go to simple fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSimpleFullscreen(fullscreen) {
    return invoke("plugin:window|set_simple_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * Bring the window to front and focus.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocus();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFocus() {
    return invoke("plugin:window|set_focus", {
      label: this.label
    });
  }
  /**
   * Sets whether the window can be focused.
   *
   * #### Platform-specific
   *
   * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
   *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocusable(true);
   * ```
   *
   * @param focusable Whether the window can be focused.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFocusable(focusable) {
    return invoke("plugin:window|set_focusable", {
      label: this.label,
      value: focusable
    });
  }
  /**
   * Sets the window icon.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIcon('/tauri/awesome.png');
   * ```
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @param icon Icon bytes or path to the icon file.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setIcon(icon) {
    return invoke("plugin:window|set_icon", {
      label: this.label,
      value: transformImage(icon)
    });
  }
  /**
   * Whether the window icon should be hidden from the taskbar or not.
   *
   * #### Platform-specific
   *
   * - **macOS:** Unsupported.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSkipTaskbar(true);
   * ```
   *
   * @param skip true to hide window icon, false to show it.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSkipTaskbar(skip) {
    return invoke("plugin:window|set_skip_taskbar", {
      label: this.label,
      value: skip
    });
  }
  /**
   * Grabs the cursor, preventing it from leaving the window.
   *
   * There's no guarantee that the cursor will be hidden. You should
   * hide it by yourself if you want so.
   *
   * #### Platform-specific
   *
   * - **Linux:** Unsupported.
   * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorGrab(true);
   * ```
   *
   * @param grab `true` to grab the cursor icon, `false` to release it.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorGrab(grab) {
    return invoke("plugin:window|set_cursor_grab", {
      label: this.label,
      value: grab
    });
  }
  /**
   * Modifies the cursor's visibility.
   *
   * #### Platform-specific
   *
   * - **Windows:** The cursor is only hidden within the confines of the window.
   * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
   *   outside of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorVisible(false);
   * ```
   *
   * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorVisible(visible) {
    return invoke("plugin:window|set_cursor_visible", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Modifies the cursor icon of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorIcon('help');
   * ```
   *
   * @param icon The new cursor icon.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorIcon(icon) {
    return invoke("plugin:window|set_cursor_icon", {
      label: this.label,
      value: icon
    });
  }
  /**
   * Sets the window background color.
   *
   * #### Platform-specific:
   *
   * - **Windows:** alpha channel is ignored.
   * - **iOS / Android:** Unsupported.
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.1.0
   */
  async setBackgroundColor(color) {
    return invoke("plugin:window|set_background_color", { color });
  }
  /**
   * Changes the position of the cursor in window coordinates.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
   * ```
   *
   * @param position The new cursor position.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorPosition(position) {
    return invoke("plugin:window|set_cursor_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Changes the cursor events behavior.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIgnoreCursorEvents(true);
   * ```
   *
   * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setIgnoreCursorEvents(ignore) {
    return invoke("plugin:window|set_ignore_cursor_events", {
      label: this.label,
      value: ignore
    });
  }
  /**
   * Starts dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async startDragging() {
    return invoke("plugin:window|start_dragging", {
      label: this.label
    });
  }
  /**
   * Starts resize-dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startResizeDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async startResizeDragging(direction) {
    return invoke("plugin:window|start_resize_dragging", {
      label: this.label,
      value: direction
    });
  }
  /**
   * Sets the badge count. It is app wide and not specific to this window.
   *
   * #### Platform-specific
   *
   * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeCount(5);
   * ```
   *
   * @param count The badge count. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   */
  async setBadgeCount(count) {
    return invoke("plugin:window|set_badge_count", {
      label: this.label,
      value: count
    });
  }
  /**
   * Sets the badge cont **macOS only**.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeLabel("Hello");
   * ```
   *
   * @param label The badge label. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   */
  async setBadgeLabel(label) {
    return invoke("plugin:window|set_badge_label", {
      label: this.label,
      value: label
    });
  }
  /**
   * Sets the overlay icon. **Windows only**
   * The overlay icon can be set for every window.
   *
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   *
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
   * ```
   *
   * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
   * @return A promise indicating the success or failure of the operation.
   */
  async setOverlayIcon(icon) {
    return invoke("plugin:window|set_overlay_icon", {
      label: this.label,
      value: icon ? transformImage(icon) : void 0
    });
  }
  /**
   * Sets the taskbar progress state.
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
   * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
   *
   * @example
   * ```typescript
   * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
   * await getCurrentWindow().setProgressBar({
   *   status: ProgressBarStatus.Normal,
   *   progress: 50,
   * });
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async setProgressBar(state) {
    return invoke("plugin:window|set_progress_bar", {
      label: this.label,
      value: state
    });
  }
  /**
   * Sets whether the window should be visible on all workspaces or virtual desktops.
   *
   * #### Platform-specific
   *
   * - **Windows / iOS / Android:** Unsupported.
   *
   * @since 2.0.0
   */
  async setVisibleOnAllWorkspaces(visible) {
    return invoke("plugin:window|set_visible_on_all_workspaces", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Sets the title bar style. **macOS only**.
   *
   * @since 2.0.0
   */
  async setTitleBarStyle(style) {
    return invoke("plugin:window|set_title_bar_style", {
      label: this.label,
      value: style
    });
  }
  /**
   * Set window theme, pass in `null` or `undefined` to follow system theme
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Theme is app-wide and not specific to this window.
   * - **iOS / Android:** Unsupported.
   *
   * @since 2.0.0
   */
  async setTheme(theme) {
    return invoke("plugin:window|set_theme", {
      label: this.label,
      value: theme
    });
  }
  // Listeners
  /**
   * Listen to window resize.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
   *  console.log('Window resized', size);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onResized(handler) {
    return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
      e.payload = new PhysicalSize(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window move.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
   *  console.log('Window moved', position);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onMoved(handler) {
    return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
      e.payload = new PhysicalPosition(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window close requested. Emitted when the user requests to closes the window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * import { confirm } from '@tauri-apps/api/dialog';
   * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
   *   const confirmed = await confirm('Are you sure?');
   *   if (!confirmed) {
   *     // user did not confirm closing the window; let's prevent it
   *     event.preventDefault();
   *   }
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onCloseRequested(handler) {
    return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
      const evt = new CloseRequestedEvent(event);
      await handler(evt);
      if (!evt.isPreventDefault()) {
        await this.destroy();
      }
    });
  }
  /**
   * Listen to a file drop event.
   * The listener is triggered when the user hovers the selected files on the webview,
   * drops the files or cancels the operation.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/webview";
   * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
   *  if (event.payload.type === 'over') {
   *    console.log('User hovering', event.payload.position);
   *  } else if (event.payload.type === 'drop') {
   *    console.log('User dropped', event.payload.paths);
   *  } else {
   *    console.log('File drop cancelled');
   *  }
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onDragDropEvent(handler) {
    const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
      handler({
        ...event,
        payload: {
          type: "enter",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
      handler({
        ...event,
        payload: {
          type: "over",
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
      handler({
        ...event,
        payload: {
          type: "drop",
          paths: event.payload.paths,
          position: new PhysicalPosition(event.payload.position)
        }
      });
    });
    const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
      handler({ ...event, payload: { type: "leave" } });
    });
    return () => {
      unlistenDrag();
      unlistenDrop();
      unlistenDragOver();
      unlistenCancel();
    };
  }
  /**
   * Listen to window focus change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
   *  console.log('Focus changed, window is focused? ' + focused);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onFocusChanged(handler) {
    const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
      handler({ ...event, payload: true });
    });
    const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
      handler({ ...event, payload: false });
    });
    return () => {
      unlistenFocus();
      unlistenBlur();
    };
  }
  /**
   * Listen to window scale change. Emitted when the window's scale factor has changed.
   * The following user actions can cause DPI changes:
   * - Changing the display's resolution.
   * - Changing the display's scale factor (e.g. in Control Panel on Windows).
   * - Moving the window to a display with a different scale factor.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
   *  console.log('Scale changed', payload.scaleFactor, payload.size);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onScaleChanged(handler) {
    return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
  }
  /**
   * Listen to the system theme change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
   *  console.log('New theme: ' + theme);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onThemeChanged(handler) {
    return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
  }
};
var BackgroundThrottlingPolicy;
(function(BackgroundThrottlingPolicy2) {
  BackgroundThrottlingPolicy2["Disabled"] = "disabled";
  BackgroundThrottlingPolicy2["Throttle"] = "throttle";
  BackgroundThrottlingPolicy2["Suspend"] = "suspend";
})(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
var ScrollBarStyle;
(function(ScrollBarStyle2) {
  ScrollBarStyle2["Default"] = "default";
  ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
})(ScrollBarStyle || (ScrollBarStyle = {}));
var Effect;
(function(Effect2) {
  Effect2["AppearanceBased"] = "appearanceBased";
  Effect2["Light"] = "light";
  Effect2["Dark"] = "dark";
  Effect2["MediumLight"] = "mediumLight";
  Effect2["UltraDark"] = "ultraDark";
  Effect2["Titlebar"] = "titlebar";
  Effect2["Selection"] = "selection";
  Effect2["Menu"] = "menu";
  Effect2["Popover"] = "popover";
  Effect2["Sidebar"] = "sidebar";
  Effect2["HeaderView"] = "headerView";
  Effect2["Sheet"] = "sheet";
  Effect2["WindowBackground"] = "windowBackground";
  Effect2["HudWindow"] = "hudWindow";
  Effect2["FullScreenUI"] = "fullScreenUI";
  Effect2["Tooltip"] = "tooltip";
  Effect2["ContentBackground"] = "contentBackground";
  Effect2["UnderWindowBackground"] = "underWindowBackground";
  Effect2["UnderPageBackground"] = "underPageBackground";
  Effect2["Mica"] = "mica";
  Effect2["Blur"] = "blur";
  Effect2["Acrylic"] = "acrylic";
  Effect2["Tabbed"] = "tabbed";
  Effect2["TabbedDark"] = "tabbedDark";
  Effect2["TabbedLight"] = "tabbedLight";
})(Effect || (Effect = {}));
var EffectState;
(function(EffectState2) {
  EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
  EffectState2["Active"] = "active";
  EffectState2["Inactive"] = "inactive";
})(EffectState || (EffectState = {}));
function mapMonitor(m) {
  return m === null ? null : {
    name: m.name,
    scaleFactor: m.scaleFactor,
    position: new PhysicalPosition(m.position),
    size: new PhysicalSize(m.size),
    workArea: {
      position: new PhysicalPosition(m.workArea.position),
      size: new PhysicalSize(m.workArea.size)
    }
  };
}
async function currentMonitor() {
  return invoke("plugin:window|current_monitor").then(mapMonitor);
}

// ../../shared/notation/note-properties.ts
var record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var NOTE_BASES = [1, 2, 4, 8, 16];
var PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"];
function equalEventProperties(a, b) {
  return a.duration.base === b.duration.base && a.duration.dots === b.duration.dots && (a.content.kind === "rest" ? b.content.kind === "rest" : b.content.kind === "note" && a.content.pitch.step === b.content.pitch.step && a.content.pitch.octave === b.content.pitch.octave && a.content.pitch.alter === b.content.pitch.alter);
}
var METER_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];
var STAFF_CLEFS = ["treble", "bass", "alto", "tenor"];
function isInputDuration(v) {
  return record(v) && NOTE_BASES.includes(v.base) && (v.dots === 0 || v.dots === 1);
}
function isEventProperties(v) {
  return record(v) && isInputContent(v.content) && (isInputDuration(v.duration) || v.content.kind === "rest" && record(v.duration) && v.duration.base === 32 && v.duration.dots === 0);
}
function isInputContent(v) {
  if (!record(v)) return false;
  if (v.kind === "rest") return true;
  const p = v.pitch;
  return v.kind === "note" && record(p) && PITCH_STEPS.includes(p.step) && typeof p.octave === "number" && Number.isInteger(p.octave) && p.octave >= 2 && p.octave <= 6 && [-1, 0, 1].includes(p.alter);
}
function isMeterInput(value) {
  return record(value) && typeof value.numerator === "number" && Number.isSafeInteger(value.numerator) && value.numerator >= 1 && value.numerator <= 32 && typeof value.denominator === "number" && METER_DENOMINATORS.includes(value.denominator);
}

// ../../apps/workbench/src/contracts/score-clipboard.ts
var SCORE_CLIPBOARD_FORMAT = "brilliant-guitar.score-events";
var SCORE_CLIPBOARD_VERSION = 1;
var SCORE_CLIPBOARD_EVENT_LIMIT = 100;
function isScoreClipboardFragmentV1(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fragment = value;
  return fragment.format === SCORE_CLIPBOARD_FORMAT && fragment.version === SCORE_CLIPBOARD_VERSION && Array.isArray(fragment.events) && fragment.events.length > 0 && fragment.events.length <= SCORE_CLIPBOARD_EVENT_LIMIT && fragment.events.every(isEventProperties);
}

// ../../shared/notation/notation-model.ts
function isExactFraction(value) {
  if (typeof value !== "object" || value === null) return false;
  const fraction = value;
  return typeof fraction.numerator === "number" && Number.isSafeInteger(fraction.numerator) && typeof fraction.denominator === "number" && Number.isSafeInteger(fraction.denominator) && fraction.denominator > 0;
}
function isStaffRuleWarning(value) {
  if (typeof value !== "object" || value === null) return false;
  const warning = value;
  return warning.code === "rule.sequence-exceeds-measure" && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration) && isExactFraction(warning.overflow);
}
function isNotationView(value) {
  if (typeof value !== "object" || value === null) return false;
  const view = value;
  if (view.kind === "unsupported") return typeof view.message === "string" && view.message.length > 0;
  if (view.kind !== "staff" || !["treble", "bass", "alto", "tenor"].includes(view.clef) || typeof view.partId !== "string" || !view.partId || typeof view.staffId !== "string" || !view.staffId || typeof view.tempoBpm !== "number" || !Number.isFinite(view.tempoBpm) || view.tempoBpm <= 0 || view.keySignatureChanges !== void 0 && !Array.isArray(view.keySignatureChanges) || !Array.isArray(view.measures) || !view.measures.length) return false;
  const ids = /* @__PURE__ */ new Set();
  const measuresValid = view.measures.every((measure) => {
    if (typeof measure !== "object" || measure === null) return false;
    const item = measure;
    if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.voiceId !== "string" || !item.voiceId || ids.has(item.voiceId) || typeof item.meter !== "object" || item.meter === null) return false;
    ids.add(item.id);
    ids.add(item.voiceId);
    if (!Array.isArray(item.events) || !Array.isArray(item.ruleWarnings) || !item.ruleWarnings.every(isStaffRuleWarning)) return false;
    for (const raw of item.events) {
      if (typeof raw !== "object" || raw === null) return false;
      const event = raw;
      if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !isEventProperties(event)) return false;
      ids.add(event.id);
    }
    const meter = item.meter;
    return typeof meter.numerator === "number" && Number.isInteger(meter.numerator) && meter.numerator >= 1 && meter.numerator <= 32 && typeof meter.denominator === "number" && [1, 2, 4, 8, 16, 32, 64].includes(meter.denominator);
  });
  if (!measuresValid) return false;
  const measures = view.measures;
  let previousIndex = -1;
  return (view.keySignatureChanges ?? []).every((raw) => {
    if (typeof raw !== "object" || raw === null) return false;
    const change = raw;
    if (typeof change.measureId !== "string" || !change.measureId || typeof change.measureIndex !== "number" || !Number.isSafeInteger(change.measureIndex) || change.measureIndex <= previousIndex || change.measureIndex >= measures.length || measures[change.measureIndex]?.id !== change.measureId || typeof change.fifths !== "number" || !Number.isSafeInteger(change.fifths) || change.fifths < -7 || change.fifths > 7) return false;
    previousIndex = change.measureIndex;
    return true;
  });
}

// ../../shared/notation/tablature-model.ts
function isTablatureProjection(value) {
  return isTablatureView(value) || record2(value) && value.kind === "unsupported" && typeof value.message === "string" && value.message.length > 0;
}
function pairedNotationMatches(staff, tab) {
  return staff.partId === tab.partId && staff.staffId === tab.staffId && staff.tempoBpm === tab.tempoBpm && staff.measures.length === tab.measures.length && staff.measures.every((measure, index) => {
    const other = tab.measures[index];
    return measure.id === other.id && measure.voiceId === other.voiceId && measure.meter.numerator === other.meter.numerator && measure.meter.denominator === other.meter.denominator && measure.events.length === other.events.length && measure.events.every((event, i) => {
      const item = other.events[i];
      return event.id === item.id && event.duration.base === item.duration.base && event.duration.dots === item.duration.dots && event.content.kind === item.content.kind;
    }) && measure.ruleWarnings.length === other.ruleWarnings.length && measure.ruleWarnings.every((warning, i) => {
      const item = other.ruleWarnings[i];
      return ["nominalDuration", "actualDuration", "overflow"].every((key) => {
        const field = key;
        return warning[field].numerator === item[field].numerator && warning[field].denominator === item[field].denominator;
      });
    });
  });
}
var record2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function isFrettedDimensions(value) {
  return record2(value) && typeof value.stringCount === "number" && Number.isSafeInteger(value.stringCount) && value.stringCount >= 1 && value.stringCount <= 32 && (value.fretCount === null || typeof value.fretCount === "number" && Number.isSafeInteger(value.fretCount) && value.fretCount >= 1) && typeof value.capoFret === "number" && Number.isSafeInteger(value.capoFret) && value.capoFret >= 0;
}
function isFrettedPosition(value, dimensions) {
  return isFrettedDimensions(dimensions) && record2(value) && typeof value.stringNumber === "number" && Number.isSafeInteger(value.stringNumber) && value.stringNumber >= 1 && value.stringNumber <= dimensions.stringCount && typeof value.fret === "number" && Number.isSafeInteger(value.fret) && value.fret >= 0 && value.fret <= Number.MAX_SAFE_INTEGER - dimensions.capoFret;
}
function isTablatureDuration(value, rest) {
  return isInputDuration(value) || rest && record2(value) && value.base === 32 && value.dots === 0;
}
function isTablatureView(value) {
  if (!record2(value) || !isFrettedDimensions(value) || value.kind !== "tablature" || typeof value.partId !== "string" || !value.partId || typeof value.staffId !== "string" || !value.staffId || typeof value.tempoBpm !== "number" || !Number.isFinite(value.tempoBpm) || value.tempoBpm <= 0 || !Array.isArray(value.measures) || !value.measures.length) return false;
  const ids = /* @__PURE__ */ new Set([value.partId, value.staffId]);
  const unique = (id) => {
    if (typeof id !== "string" || !id || ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  return value.measures.every((raw) => {
    if (!record2(raw) || !unique(raw.id) || !unique(raw.voiceId) || !isMeterInput(raw.meter) || !Array.isArray(raw.events) || !Array.isArray(raw.ruleWarnings) || !raw.ruleWarnings.every((warning) => record2(warning) && warning.code === "rule.sequence-exceeds-measure" && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration) && isExactFraction(warning.overflow))) return false;
    return raw.events.every((event) => {
      if (!record2(event) || !unique(event.id) || !record2(event.content)) return false;
      const content = event.content;
      if (!isTablatureDuration(event.duration, content.kind === "rest")) return false;
      return content.kind === "rest" || content.kind === "note" && unique(content.noteId) && isFrettedPosition(content.position, value);
    });
  });
}

// ../../apps/workbench/src/contracts/document-metadata.ts
var normalizeDocumentMetadata = (value) => ({
  title: value.title.trim() || "\u672A\u547D\u540D\u4E50\u8C31",
  authors: value.authors.map((author) => author.trim()).filter(Boolean),
  tempoBpm: value.tempoBpm
});
var documentMetadataKey = (value) => JSON.stringify(normalizeDocumentMetadata(value));
function isDocumentMetadataInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value;
  return Object.keys(r).every((key) => ["title", "authors", "tempoBpm"].includes(key)) && typeof r.title === "string" && r.title.trim().length <= 120 && Array.isArray(r.authors) && r.authors.length <= 16 && r.authors.every((author) => typeof author === "string" && !!author.trim() && author.trim().length <= 120) && typeof r.tempoBpm === "number" && Number.isFinite(r.tempoBpm) && r.tempoBpm > 0;
}

// ../../apps/workbench/src/contracts/note-input.ts
var KEY_SIGNATURE_FIFTHS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
var record3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function isScoreEditRequest(v) {
  if (!record3(v) || typeof v.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(v.requestId) || typeof v.documentId !== "string" || !v.documentId || typeof v.expectedVersion !== "number" || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0 || !record3(v.action)) return false;
  const a = v.action;
  return a.kind === "undo" || a.kind === "redo" || a.kind === "delete-event" && typeof a.eventId === "string" && !!a.eventId && (a.timePolicy === void 0 || a.timePolicy === "preserve" || a.timePolicy === "collapse") || a.kind === "delete-range" && isScoreEventRange(a.range) || a.kind === "paste-fragment" && typeof a.measureId === "string" && !!a.measureId && typeof a.voiceId === "string" && !!a.voiceId && isInputSequenceAnchor(a.anchor) && (a.offsetUnits === void 0 || typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0) && isScoreClipboardFragmentV1(a.fragment) || a.kind === "insert-measure" && typeof a.measureId === "string" && !!a.measureId && (a.position === "before" || a.position === "after") || a.kind === "remove-measure" && typeof a.measureId === "string" && !!a.measureId || a.kind === "set-measure-meter" && typeof a.measureId === "string" && !!a.measureId && isMeterInput(a.meter) && (a.scope === "meter-run" || a.scope === "measure") || a.kind === "set-key-signature" && typeof a.partId === "string" && !!a.partId && typeof a.measureId === "string" && !!a.measureId && isKeySignatureChangeInput(a.change) && Object.keys(a).every((key) => ["kind", "partId", "measureId", "change"].includes(key)) || a.kind === "set-staff-clef" && typeof a.staffId === "string" && !!a.staffId && STAFF_CLEFS.includes(a.clef) && Object.keys(a).every((key) => ["kind", "staffId", "clef"].includes(key)) || a.kind === "set-event-properties" && typeof a.eventId === "string" && !!a.eventId && isEventProperties(a.properties) || a.kind === "set-fretted-position" && typeof a.partId === "string" && !!a.partId && typeof a.eventId === "string" && !!a.eventId && isFrettedPosition(a.position, { stringCount: 32, fretCount: null, capoFret: 0 }) && Object.keys(a.position).every((key) => ["stringNumber", "fret"].includes(key)) && Object.keys(a).every((key) => ["kind", "partId", "eventId", "position"].includes(key)) || a.kind === "set-document-metadata" && isDocumentMetadataInput(a.metadata) && Object.keys(a).every((key) => ["kind", "metadata"].includes(key)) || a.kind === "set-title" && typeof a.title === "string" && a.title.trim().length <= 120 || a.kind === "append" && typeof a.measureId === "string" && !!a.measureId && isInputSequenceAnchor(a.anchor) && (a.offsetUnits === void 0 || typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0) && isInputDuration(a.duration) && isInputContent(a.content);
}
function isKeySignatureChangeInput(value) {
  if (!record3(value)) return false;
  return value.kind === "inherit" ? Object.keys(value).every((key) => key === "kind") : value.kind === "set" && Object.keys(value).every((key) => key === "kind" || key === "fifths") && KEY_SIGNATURE_FIFTHS.includes(value.fifths);
}
function isScoreEventRange(value) {
  return record3(value) && typeof value.measureId === "string" && !!value.measureId && typeof value.voiceId === "string" && !!value.voiceId && typeof value.startEventId === "string" && !!value.startEventId && typeof value.endEventId === "string" && !!value.endEventId;
}
function isInputSequenceAnchor(value) {
  if (!record3(value)) return false;
  return value.kind === "start" || value.kind === "after-event" && typeof value.eventId === "string" && !!value.eventId;
}

// ../../apps/workbench/node_modules/@brilliant-guitar/agent-runtime/dist/contracts/agent-provider-settings.js
var providerIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
function record4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function validText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
function isAgentProviderId(value) {
  return typeof value === "string" && value.length <= 160 && providerIdPattern.test(value);
}
function isAgentProviderSelection(value) {
  const selection = record4(value);
  return selection !== null && onlyKeys(selection, ["providerId", "modelId"]) && isAgentProviderId(selection.providerId) && validText(selection.modelId, 160);
}

// ../../apps/workbench/src/contracts/shortcut-settings.ts
var COMMAND_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9-]+)*$/;
var NAMED_KEYS = /* @__PURE__ */ new Set([
  "Space",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Plus",
  "Minus",
  "Comma",
  "Period",
  "Slash",
  "Backslash",
  "Semicolon",
  "Quote",
  "BracketLeft",
  "BracketRight",
  "Backquote"
]);
var OFFICIAL_SHORTCUT_PROFILE_NAME = "\u5B98\u65B9\u9ED8\u8BA4";
var DEFAULT_SHORTCUT_SETTINGS = {
  profileName: OFFICIAL_SHORTCUT_PROFILE_NAME,
  bindings: {}
};
function record5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys2(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function isShortcutCommandId(value) {
  return value.length <= 160 && COMMAND_ID_PATTERN.test(value);
}
function isNormalizedShortcut(value) {
  if (value.length === 0 || value.length > 64 || value.trim() !== value) return false;
  const parts = value.split("+");
  if (parts.some((part) => part.length === 0)) return false;
  const key = parts.at(-1);
  if (!key) return false;
  const modifiers = parts.slice(0, -1);
  const ordered = ["Mod", "Alt", "Shift"].filter((modifier) => modifiers.includes(modifier));
  if (ordered.length !== modifiers.length || ordered.some((modifier, index) => modifier !== modifiers[index])) return false;
  return NAMED_KEYS.has(key) || /^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key);
}
function normalizedBindings(value) {
  const bindings = record5(value);
  if (bindings === null || Object.keys(bindings).length > 512) return null;
  const result = {};
  const assigned = /* @__PURE__ */ new Set();
  for (const [commandId, shortcut] of Object.entries(bindings)) {
    if (!isShortcutCommandId(commandId) || shortcut !== null && (typeof shortcut !== "string" || !isNormalizedShortcut(shortcut) || assigned.has(shortcut))) return null;
    result[commandId] = shortcut;
    if (shortcut !== null) assigned.add(shortcut);
  }
  return result;
}
function validProfileName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && value.trim() === value && !/\p{Cc}/u.test(value);
}
function normalizeShortcutSettings(value) {
  const settings = record5(value);
  const bindings = normalizedBindings(settings?.bindings);
  if (settings === null || !onlyKeys2(settings, ["profileName", "bindings"]) || !validProfileName(settings.profileName) || bindings === null) return null;
  return { profileName: settings.profileName, bindings };
}

// ../../apps/workbench/src/contracts/application-settings.ts
var DEFAULT_NOTE_INPUT_PREFERENCES = {
  retention: "rhythm",
  defaultDuration: { base: 4, dots: 0 }
};
var DEFAULT_APPLICATION_SETTINGS = {
  schemaVersion: 1,
  ui: { animationsEnabled: true, ruleWarningsVisible: true },
  editing: { deleteTimePolicy: "preserve", noteInput: DEFAULT_NOTE_INPUT_PREFERENCES },
  agent: { enabled: false, providerSelection: null },
  shortcuts: DEFAULT_SHORTCUT_SETTINGS
};
function record6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys3(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function isApplicationSettingsV1(value) {
  const root = record6(value);
  const ui = record6(root?.ui);
  const editing = record6(root?.editing);
  const agent = record6(root?.agent);
  return root !== null && onlyKeys3(root, ["schemaVersion", "ui", "editing", "agent", "shortcuts"]) && root.schemaVersion === 1 && ui !== null && onlyKeys3(ui, ["animationsEnabled", "ruleWarningsVisible"]) && typeof ui.animationsEnabled === "boolean" && typeof ui.ruleWarningsVisible === "boolean" && editing !== null && onlyKeys3(editing, ["deleteTimePolicy", "noteInput"]) && (editing.deleteTimePolicy === "preserve" || editing.deleteTimePolicy === "collapse") && normalizeNoteInputPreferences(editing.noteInput) !== null && agent !== null && onlyKeys3(agent, ["enabled", "providerSelection"]) && typeof agent.enabled === "boolean" && (agent.providerSelection === null || isAgentProviderSelection(agent.providerSelection)) && normalizeShortcutSettings(root.shortcuts) !== null;
}
function normalizedBase(root) {
  const ui = record6(root.ui);
  const editing = record6(root.editing);
  const noteInput = editing?.noteInput === void 0 ? DEFAULT_NOTE_INPUT_PREFERENCES : normalizeNoteInputPreferences(editing.noteInput);
  if (root.schemaVersion !== 1 || ui === null || !onlyKeys3(ui, ["animationsEnabled", "ruleWarningsVisible"]) || typeof ui.animationsEnabled !== "boolean" || typeof ui.ruleWarningsVisible !== "boolean" || editing === null || !onlyKeys3(editing, editing.noteInput === void 0 ? ["deleteTimePolicy"] : ["deleteTimePolicy", "noteInput"]) || noteInput === null || editing.deleteTimePolicy !== "preserve" && editing.deleteTimePolicy !== "collapse") return null;
  return {
    schemaVersion: 1,
    ui: { animationsEnabled: ui.animationsEnabled, ruleWarningsVisible: ui.ruleWarningsVisible },
    editing: { deleteTimePolicy: editing.deleteTimePolicy, noteInput }
  };
}
function normalizeNoteInputPreferences(value) {
  const preferences = record6(value);
  if (preferences === null || !onlyKeys3(preferences, ["retention", "defaultDuration"]) || preferences.retention !== "rhythm" && preferences.retention !== "all" && preferences.retention !== "reset" || !isInputDuration(preferences.defaultDuration)) return null;
  return { retention: preferences.retention, defaultDuration: preferences.defaultDuration };
}
function normalizeApplicationSettings(value) {
  if (isApplicationSettingsV1(value)) return value;
  const root = record6(value);
  if (root === null) return null;
  const base = normalizedBase(root);
  if (base === null) return null;
  if (!Object.keys(root).every((key) => ["schemaVersion", "ui", "editing", "agent", "shortcuts"].includes(key))) return null;
  const agent = record6(root.agent);
  let normalizedAgent;
  if (root.agent === void 0) normalizedAgent = { enabled: false, providerSelection: null };
  else if (agent !== null && onlyKeys3(agent, ["enabled"]) && typeof agent.enabled === "boolean") {
    normalizedAgent = { enabled: agent.enabled, providerSelection: null };
  } else if (agent !== null && onlyKeys3(agent, ["enabled", "providerSelection"]) && typeof agent.enabled === "boolean" && (agent.providerSelection === null || isAgentProviderSelection(agent.providerSelection))) {
    normalizedAgent = { enabled: agent.enabled, providerSelection: agent.providerSelection };
  } else return null;
  const shortcuts = root.shortcuts === void 0 ? DEFAULT_SHORTCUT_SETTINGS : normalizeShortcutSettings(root.shortcuts);
  if (shortcuts === null) return null;
  return { ...base, agent: normalizedAgent, shortcuts };
}
function normalizeApplicationSettingsSnapshot(value) {
  const snapshot = record6(value);
  const settings = normalizeApplicationSettings(snapshot?.settings);
  if (snapshot === null || settings === null || !onlyKeys3(snapshot, ["settings", "persisted", "recoveredFromInvalid"]) || typeof snapshot.persisted !== "boolean" || typeof snapshot.recoveredFromInvalid !== "boolean") return null;
  return { settings, persisted: snapshot.persisted, recoveredFromInvalid: snapshot.recoveredFromInvalid };
}

// ../../apps/workbench/src/contracts/workspace-configuration.ts
var DEFAULT_WORKSPACE_CONFIGURATION = {
  schemaVersion: 1,
  dock: {
    layout: { left: 208, right: 280, top: 56, bottom: 136 },
    visibility: { top: true, right: true, bottom: true, left: true },
    selection: { top: null, right: null, bottom: null, left: null }
  },
  uiLayout: {
    version: 2,
    placements: [
      { componentId: "notation.staff-view", slot: "workspace", presentation: "inline", order: 0, visible: true },
      { componentId: "notation.note-input", slot: "left", presentation: "panel", order: 0, visible: true },
      { componentId: "notation.history-control", slot: "top", presentation: "panel", order: 0, visible: true },
      { componentId: "playback.transport", slot: "top", presentation: "panel", order: 1, visible: true },
      { componentId: "notation.paper-zoom", slot: "top", presentation: "panel", order: 2, visible: true },
      { componentId: "playback.output", slot: "right", presentation: "panel", order: 0, visible: true },
      { componentId: "agent.recovery-panel", slot: "right", presentation: "panel", order: 1, visible: true }
    ]
  },
  inspectorWidth: 288
};
function record7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys4(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function boundedInteger(value, minimum, maximum) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
var UI_SLOTS = ["workspace", "top", "right", "bottom", "left", "overlay"];
var UI_PRESENTATIONS = ["inline", "panel", "popover", "dialog"];
function isWorkspaceConfigurationV1(value) {
  const root = record7(value);
  const dock = record7(root?.dock);
  const layout = record7(dock?.layout);
  const visibility = record7(dock?.visibility);
  const selection = record7(dock?.selection);
  const uiLayout = record7(root?.uiLayout);
  if (root === null || !onlyKeys4(root, ["schemaVersion", "dock", "uiLayout", "inspectorWidth"]) || root.schemaVersion !== 1 || !boundedInteger(root.inspectorWidth, 160, 2048) || dock === null || !onlyKeys4(dock, ["layout", "visibility", "selection"]) || layout === null || !onlyKeys4(layout, ["left", "right", "top", "bottom"]) || ![layout.left, layout.right, layout.top, layout.bottom].every((item) => boundedInteger(item, 0, 4096)) || visibility === null || !onlyKeys4(visibility, ["top", "right", "bottom", "left"]) || ![visibility.top, visibility.right, visibility.bottom, visibility.left].every((item) => typeof item === "boolean") || selection === null || !onlyKeys4(selection, ["top", "right", "bottom", "left"]) || ![selection.top, selection.right, selection.bottom, selection.left].every((item) => item === null || typeof item === "string" && item.length > 0 && item.length <= 160) || uiLayout === null || !onlyKeys4(uiLayout, ["version", "placements"]) || uiLayout.version !== 2 || !Array.isArray(uiLayout.placements) || uiLayout.placements.length > 256) return false;
  const ids = /* @__PURE__ */ new Set();
  return uiLayout.placements.every((item) => {
    const placement = record7(item);
    if (placement === null || !onlyKeys4(placement, ["componentId", "slot", "presentation", "order", "visible"]) || typeof placement.componentId !== "string" || !placement.componentId || placement.componentId.length > 160 || ids.has(placement.componentId) || !UI_SLOTS.includes(placement.slot) || !UI_PRESENTATIONS.includes(placement.presentation) || !boundedInteger(placement.order, 0, 4096) || typeof placement.visible !== "boolean") return false;
    ids.add(placement.componentId);
    return true;
  });
}
function isWorkspaceConfigurationSnapshotV1(value) {
  const snapshot = record7(value);
  return snapshot !== null && onlyKeys4(snapshot, ["configuration", "persisted", "recoveredFromInvalid"]) && isWorkspaceConfigurationV1(snapshot.configuration) && typeof snapshot.persisted === "boolean" && typeof snapshot.recoveredFromInvalid === "boolean";
}

// ../../apps/workbench/src/contracts/workbench-issue.ts
var record8 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function isWorkbenchIssue(value) {
  if (!record8(value) || typeof value.code !== "string" || !value.code || typeof value.message !== "string" || !value.message || !["info", "warning", "error"].includes(value.severity) || !["core", "editor", "host", "bridge", "file", "renderer"].includes(value.source) || !record8(value.target) || value.retryable !== void 0 && typeof value.retryable !== "boolean") return false;
  const target = value.target;
  if (target.scope === "workbench") return true;
  if (target.scope === "component") return typeof target.componentId === "string" && !!target.componentId;
  if (target.scope === "measure") return typeof target.measureId === "string" && !!target.measureId && (target.eventId === void 0 || typeof target.eventId === "string");
  return target.scope === "event" && typeof target.measureId === "string" && !!target.measureId && typeof target.eventId === "string" && !!target.eventId;
}

// ../../apps/workbench/src/services/workbench-host-bridge.ts
var WorkbenchRequestError = class extends Error {
  status;
  issue;
  constructor(message, status, issue) {
    super(message);
    this.status = status;
    this.issue = issue;
  }
};
function requestError(error, fallback) {
  if (typeof error === "object" && error !== null) {
    const record16 = error;
    const message = typeof record16.message === "string" ? record16.message : fallback;
    return new WorkbenchRequestError(
      message,
      typeof record16.status === "number" ? record16.status : 503,
      isWorkbenchIssue(record16.issue) ? record16.issue : void 0
    );
  }
  return new WorkbenchRequestError(fallback, 503);
}
async function invokeHostCommand(invokeCommand, command, args, fallback) {
  try {
    return await invokeCommand(command, args);
  } catch (error) {
    throw requestError(error, fallback);
  }
}
var TauriWorkbenchHostBridge = class {
  nativeFiles = true;
  invoke;
  currentWindow;
  createChannel;
  forceClosing = false;
  constructor(invokeCommand = invoke, currentWindow = getCurrentWindow, createChannel = () => new Channel()) {
    this.invoke = invokeCommand;
    this.currentWindow = currentWindow;
    this.createChannel = createChannel;
  }
  async call(command, args, fallback) {
    return invokeHostCommand(this.invoke, command, args, fallback);
  }
  invokeCapability(request) {
    return this.call("workbench_invoke_capability_v1", { request }, "\u65E0\u6CD5\u8C03\u7528\u5E94\u7528\u80FD\u529B");
  }
  invokeAgentCapability(request) {
    return this.call("workbench_agent_invoke_capability_v1", { request }, "\u65E0\u6CD5\u8C03\u7528 Agent \u5E94\u7528\u80FD\u529B");
  }
  readScoreSummary(workspaceId) {
    return this.call("workbench_score_read_summary_v1", { workspaceId }, "\u65E0\u6CD5\u8BFB\u53D6\u4E50\u8C31\u6982\u8981");
  }
  readScoreMetadata(workspaceId) {
    return this.call("workbench_score_read_metadata_v1", { workspaceId }, "\u65E0\u6CD5\u8BFB\u53D6\u4E50\u8C31\u5143\u6570\u636E");
  }
  readScoreStructure(workspaceId) {
    return this.call("workbench_score_read_structure_v1", { workspaceId }, "\u65E0\u6CD5\u8BFB\u53D6\u4E50\u8C31\u7ED3\u6784");
  }
  readScoreMeasureIndex(workspaceId, input) {
    return this.call("workbench_score_read_measure_index_v1", {
      workspaceId,
      expectedDocumentId: input.expectedDocumentId,
      expectedDocumentVersion: input.expectedDocumentVersion
    }, "\u65E0\u6CD5\u8BFB\u53D6\u5C0F\u8282\u7D22\u5F15");
  }
  readScoreMeasureRange(workspaceId, input) {
    return this.call("workbench_score_read_measure_range_v1", {
      workspaceId,
      startMeasureId: input.startMeasureId,
      endMeasureId: input.endMeasureId,
      maxMeasures: input.maxMeasures
    }, "\u65E0\u6CD5\u8BFB\u53D6\u5C0F\u8282\u8303\u56F4");
  }
  prepareScoreTempoChange(workspaceId, precondition, input) {
    return this.call("workbench_score_prepare_tempo_change_v1", {
      workspaceId,
      expectedDocumentId: precondition.documentId,
      expectedDocumentVersion: precondition.documentVersion,
      input
    }, "\u65E0\u6CD5\u51C6\u5907\u4F5C\u54C1\u901F\u5EA6\u53D8\u66F4");
  }
  prepareScoreMetadataTransaction(workspaceId, precondition, input) {
    return this.call("workbench_score_prepare_metadata_transaction_v1", {
      workspaceId,
      expectedDocumentId: precondition.documentId,
      expectedDocumentVersion: precondition.documentVersion,
      input
    }, "\u65E0\u6CD5\u51C6\u5907\u4F5C\u54C1\u5143\u6570\u636E\u4E8B\u52A1");
  }
  read(workspaceId) {
    return this.call("workbench_read_v1", { workspaceId }, "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u4E50\u8C31");
  }
  create(workspaceId, input, requestId, expectedDocumentId) {
    return this.call("workbench_create_v1", {
      request: { workspaceId, input, requestId, expectedDocumentId }
    }, "\u65E0\u6CD5\u521B\u5EFA\u4E50\u8C31");
  }
  createGuarded(workspaceId, input, requestId, expected) {
    return this.call("workbench_create_guarded_v1", {
      request: { workspaceId, input, requestId, expected }
    }, "\u65E0\u6CD5\u5B89\u5168\u65B0\u5EFA\u4F5C\u54C1\uFF0C\u8BF7\u786E\u8BA4\u684C\u9762\u5BBF\u4E3B\u7248\u672C");
  }
  edit(workspaceId, input) {
    return this.call("workbench_edit_v1", {
      request: { workspaceId, ...input }
    }, "\u65E0\u6CD5\u5B8C\u6210\u7F16\u8F91");
  }
  exportDocument(workspaceId) {
    return this.call("workbench_export_v1", { workspaceId }, "\u65E0\u6CD5\u5BFC\u51FA\u5F53\u524D\u4E50\u8C31");
  }
  importDocument(workspaceId, document2) {
    return this.call("workbench_import_v1", {
      workspaceId,
      documentJson: JSON.stringify(document2)
    }, "\u65E0\u6CD5\u6253\u5F00\u4E50\u8C31\u6587\u4EF6");
  }
  openNativeDocument(workspaceId) {
    return this.call("workbench_open_file_v1", { workspaceId }, "\u65E0\u6CD5\u6253\u5F00\u4E50\u8C31\u6587\u4EF6");
  }
  openNativeDocumentGuarded(workspaceId, expected) {
    return this.call(
      "workbench_open_file_guarded_v1",
      { workspaceId, expected },
      "\u65E0\u6CD5\u5B89\u5168\u6253\u5F00\u4F5C\u54C1\uFF0C\u8BF7\u786E\u8BA4\u684C\u9762\u5BBF\u4E3B\u7248\u672C"
    );
  }
  saveNativeDocument(workspaceId, suggestedName, saveAs) {
    return this.call(
      "workbench_save_file_v1",
      { workspaceId, suggestedName, saveAs },
      "\u65E0\u6CD5\u4FDD\u5B58\u5F53\u524D\u4E50\u8C31"
    );
  }
  saveNativeDocumentGuarded(workspaceId, suggestedName, saveAs, expected) {
    return this.call(
      "workbench_save_file_guarded_v1",
      { workspaceId, suggestedName, saveAs, expected },
      "\u65E0\u6CD5\u5B89\u5168\u4FDD\u5B58\u4F5C\u54C1\uFF0C\u8BF7\u786E\u8BA4\u684C\u9762\u5BBF\u4E3B\u7248\u672C"
    );
  }
  async onNativeCloseRequested(handler) {
    return this.currentWindow().onCloseRequested(async (event) => {
      if (this.forceClosing) return;
      if (!await handler()) event.preventDefault();
    });
  }
  async closeNativeWindow(workspaceId) {
    await this.call("workbench_close_v1", { workspaceId }, "\u65E0\u6CD5\u5173\u95ED\u5F53\u524D\u5DE5\u4F5C\u533A");
    this.forceClosing = true;
    try {
      await this.currentWindow().close();
    } catch (error) {
      this.forceClosing = false;
      throw error;
    }
  }
  async onNativeCloseRequestedGuarded(handler) {
    return this.currentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      await handler();
    });
  }
  closeNativeWindowGuarded(workspaceId, expected) {
    return this.call(
      "workbench_close_window_guarded_v1",
      { workspaceId, expected },
      "\u65E0\u6CD5\u5B89\u5168\u5173\u95ED\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u786E\u8BA4\u684C\u9762\u5BBF\u4E3B\u7248\u672C"
    );
  }
  readApplicationSettings() {
    return this.call("workbench_read_settings_v1", {}, "\u65E0\u6CD5\u8BFB\u53D6\u5E94\u7528\u914D\u7F6E");
  }
  writeApplicationSettings(settings) {
    return this.call("workbench_write_settings_v1", { settings }, "\u65E0\u6CD5\u4FDD\u5B58\u5E94\u7528\u914D\u7F6E");
  }
  resetApplicationSettings() {
    return this.call("workbench_reset_settings_v1", {}, "\u65E0\u6CD5\u6062\u590D\u9ED8\u8BA4\u5E94\u7528\u914D\u7F6E");
  }
  readAgentProviderCredentialStatus(providerId) {
    return this.call("workbench_agent_provider_credential_status_v1", { providerId }, "\u65E0\u6CD5\u8BFB\u53D6 Provider \u51ED\u636E\u72B6\u6001");
  }
  setAgentProviderCredential(providerId, secret) {
    return this.call("workbench_agent_provider_set_credential_v1", { providerId, secret }, "\u65E0\u6CD5\u4FDD\u5B58 Provider \u51ED\u636E");
  }
  deleteAgentProviderCredential(providerId) {
    return this.call("workbench_agent_provider_delete_credential_v1", { providerId }, "\u65E0\u6CD5\u5220\u9664 Provider \u51ED\u636E");
  }
  async decideAgentProvider(request, signal, observer) {
    if (signal?.aborted) throw new DOMException("Agent Provider request cancelled", "AbortError");
    const cancel = () => {
      void this.invoke("workbench_agent_provider_cancel_v1", {
        runId: request.runId,
        turnId: request.turnId
      }).catch(() => void 0);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const progress = this.createChannel();
      progress.onmessage = observer ?? (() => void 0);
      return await this.call(
        "workbench_agent_provider_decide_v1",
        { request, progress },
        "\u6A21\u578B Provider \u6682\u65F6\u65E0\u6CD5\u5B8C\u6210\u51B3\u7B56"
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  listRecentDocuments() {
    return this.call("workbench_list_recent_documents_v1", {}, "\u65E0\u6CD5\u8BFB\u53D6\u6700\u8FD1\u6587\u4EF6\u76EE\u5F55");
  }
  removeRecentDocument(recordId) {
    return this.call("workbench_remove_recent_document_v1", { recordId }, "\u65E0\u6CD5\u79FB\u9664\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55");
  }
  openRecentDocumentGuarded(workspaceId, recordId, expected) {
    return this.call("workbench_open_recent_document_guarded_v1", { workspaceId, recordId, expected }, "\u65E0\u6CD5\u5B89\u5168\u6253\u5F00\u6700\u8FD1\u6587\u4EF6");
  }
  recordCurrentFile(workspaceId, expected) {
    return this.call("workbench_record_current_file_v1", { workspaceId, expected }, "\u65E0\u6CD5\u767B\u8BB0\u5F53\u524D\u6587\u4EF6");
  }
  async streamAgentModel(request, signal, observer) {
    if (signal?.aborted) throw new DOMException("Agent model request cancelled", "AbortError");
    const cancel = () => {
      void this.invoke("workbench_agent_provider_cancel_v1", {
        runId: request.runId,
        turnId: request.turnId
      }).catch(() => void 0);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const progress = this.createChannel();
      progress.onmessage = observer ?? (() => void 0);
      return await this.call(
        "workbench_agent_model_stream_v1",
        { request, progress },
        "\u6A21\u578B Provider \u6682\u65F6\u65E0\u6CD5\u63D0\u4F9B\u539F\u59CB\u6A21\u578B\u6D41"
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  readWorkspaceConfiguration(workspaceId) {
    return this.call("workbench_read_workspace_configuration_v1", { workspaceId }, "\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u4F5C\u533A\u914D\u7F6E");
  }
  writeWorkspaceConfiguration(workspaceId, configuration) {
    return this.call("workbench_write_workspace_configuration_v1", { workspaceId, configuration }, "\u65E0\u6CD5\u4FDD\u5B58\u5DE5\u4F5C\u533A\u914D\u7F6E");
  }
  resetWorkspaceConfiguration(workspaceId) {
    return this.call("workbench_reset_workspace_configuration_v1", { workspaceId }, "\u65E0\u6CD5\u6062\u590D\u9ED8\u8BA4\u5DE5\u4F5C\u533A\u914D\u7F6E");
  }
};
function createWorkbenchHostBridge() {
  return true ? new TauriWorkbenchHostBridge() : new BrowserWorkbenchHostBridge();
}
var TauriPluginSettingsStorage = class {
  invokeCommand;
  constructor(invokeCommand = invoke) {
    this.invokeCommand = invokeCommand;
  }
  async read() {
    const document2 = await invokeHostCommand(
      this.invokeCommand,
      "workbench_read_plugin_settings_v1",
      {},
      "\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u8BBE\u7F6E"
    );
    return document2 ?? {};
  }
  async write(document2) {
    await invokeHostCommand(
      this.invokeCommand,
      "workbench_write_plugin_settings_v1",
      { document: document2 },
      "\u65E0\u6CD5\u4FDD\u5B58\u63D2\u4EF6\u8BBE\u7F6E"
    );
  }
};

// ../../apps/workbench/src/contracts/document-replacement.ts
function isDocumentReplacementPrecondition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value;
  if (r.kind === "empty") return Object.keys(r).length === 1;
  return r.kind === "document" && Object.keys(r).length === 3 && typeof r.documentId === "string" && r.documentId.length > 0 && r.documentId.length <= 256 && typeof r.documentVersion === "number" && Number.isSafeInteger(r.documentVersion) && r.documentVersion >= 0;
}

// ../../apps/workbench/src/contracts/native-close.ts
function isNativeClosePrecondition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value;
  if (r.kind === "empty") return isDocumentReplacementPrecondition(r);
  return Object.keys(r).length === 4 && typeof r.sessionId === "string" && r.sessionId.length > 0 && r.sessionId.length <= 256 && isDocumentReplacementPrecondition({ kind: r.kind, documentId: r.documentId, documentVersion: r.documentVersion });
}
function nativeClosePrecondition(session) {
  if (!session) return { kind: "empty" };
  if (!session.persistence) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u5173\u95ED\u6240\u9700\u7684\u4F1A\u8BDD\u8EAB\u4EFD\uFF0C\u8BF7\u66F4\u65B0\u5BBF\u4E3B");
  return {
    kind: "document",
    sessionId: session.persistence.sessionId,
    documentId: session.documentId,
    documentVersion: session.documentVersion
  };
}

// ../../apps/workbench/src/contracts/recent-documents.ts
var record9 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var isRecentRecordId = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function isRecentDocumentsSnapshotV1(value) {
  if (!record9(value) || value.apiVersion !== 1 || Object.keys(value).length !== 2 || !Array.isArray(value.entries) || value.entries.length > 20) return false;
  const ids = /* @__PURE__ */ new Set();
  return value.entries.every((entry) => {
    if (!record9(entry) || Object.keys(entry).length !== 4 || !isRecentRecordId(entry.id) || typeof entry.name !== "string" || !entry.name || entry.name.length > 1024 || typeof entry.location !== "string" || !entry.location || entry.location.length > 32768 || typeof entry.lastOpenedAt !== "number" || !Number.isSafeInteger(entry.lastOpenedAt) || entry.lastOpenedAt < 0 || ids.has(entry.id.toLowerCase())) return false;
    ids.add(entry.id.toLowerCase());
    return true;
  });
}

// ../../apps/workbench/src/contracts/new-score.ts
var NEW_SCORE_LIMITS = { titleLength: 120, minMeasures: 1, maxMeasures: 128 };
function validateNewScoreInput(input) {
  const errors = {};
  if (input.title.trim().length > NEW_SCORE_LIMITS.titleLength) errors.title = "\u6807\u9898\u6700\u591A 120 \u4E2A\u5B57\u7B26";
  if (!Number.isInteger(input.measureCount) || input.measureCount < NEW_SCORE_LIMITS.minMeasures || input.measureCount > NEW_SCORE_LIMITS.maxMeasures) {
    errors.measureCount = "\u8BF7\u8F93\u5165 1\u2013128 \u4E4B\u95F4\u7684\u6574\u6570";
  }
  return errors;
}
function isScoreSessionSummary(value) {
  if (typeof value !== "object" || value === null) return false;
  const record16 = value;
  return typeof record16.documentId === "string" && record16.documentId.length > 0 && typeof record16.title === "string" && typeof record16.measureCount === "number" && Number.isInteger(record16.measureCount) && record16.measureCount >= 1 && typeof record16.documentVersion === "number" && Number.isInteger(record16.documentVersion) && record16.documentVersion >= 0;
}

// ../../apps/workbench/src/contracts/playback.ts
var record10 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var integer = (value) => typeof value === "number" && Number.isSafeInteger(value);
function isPitch(value) {
  if (!record10(value)) return false;
  return typeof value.step === "string" && ["C", "D", "E", "F", "G", "A", "B"].includes(value.step) && integer(value.alter) && value.alter >= -2 && value.alter <= 2 && integer(value.octave) && value.octave >= 0 && value.octave <= 8;
}
function isEvent(value) {
  if (!record10(value) || typeof value.id !== "string" || !value.id || !isExactFraction(value.duration) || !record10(value.content)) return false;
  return value.content.kind === "rest" || value.content.kind === "note" && isPitch(value.content.writtenPitch);
}
function isMeasure(value) {
  if (!record10(value) || typeof value.id !== "string" || !value.id || !record10(value.meter) || !integer(value.meter.numerator) || value.meter.numerator < 1 || !integer(value.meter.denominator) || value.meter.denominator < 1 || !isExactFraction(value.voiceStart) || !Array.isArray(value.events)) return false;
  const ids = /* @__PURE__ */ new Set();
  return value.events.every((event) => isEvent(event) && !ids.has(event.id) && !!ids.add(event.id));
}
function isPlaybackSourceProjection(value) {
  if (!record10(value) || value.projectionVersion !== 1 || typeof value.documentId !== "string" || !value.documentId || !integer(value.documentVersion) || value.documentVersion < 0) return false;
  if (value.kind === "unsupported") return typeof value.code === "string" && !!value.code && typeof value.message === "string" && !!value.message;
  if (value.kind !== "ready" || typeof value.bpm !== "number" || !Number.isFinite(value.bpm) || value.bpm <= 0 || !record10(value.writtenToSounding) || !integer(value.writtenToSounding.diatonicSteps) || !integer(value.writtenToSounding.chromaticSemitones) || !Array.isArray(value.measures) || !value.measures.length) return false;
  const ids = /* @__PURE__ */ new Set();
  const eventIds = /* @__PURE__ */ new Set();
  return value.measures.every((measure) => isMeasure(measure) && !ids.has(measure.id) && !!ids.add(measure.id) && measure.events.every((event) => !eventIds.has(event.id) && !!eventIds.add(event.id)));
}

// ../../apps/workbench/src/contracts/score-session.ts
function isScoreSessionRead(value) {
  if (!isScoreSessionSummary(value)) return false;
  const notation = value.notation;
  const r = value;
  if (typeof r.undoDepth !== "number" || !Number.isSafeInteger(r.undoDepth) || r.undoDepth < 0 || typeof r.redoDepth !== "number" || !Number.isSafeInteger(r.redoDepth) || r.redoDepth < 0) return false;
  const metadata = r.metadata;
  if (r.warnings !== void 0 && (!Array.isArray(r.warnings) || r.warnings.length > 4 || r.warnings.some((warning) => !isWorkbenchIssue(warning) || warning.severity !== "warning"))) return false;
  const persistence = r.persistence;
  if (persistence !== void 0) {
    if (typeof persistence !== "object" || persistence === null || Array.isArray(persistence)) return false;
    const state = persistence;
    if (typeof state.sessionId !== "string" || !state.sessionId || typeof state.dirty !== "boolean" || state.savedVersion !== null && (typeof state.savedVersion !== "number" || !Number.isSafeInteger(state.savedVersion) || state.savedVersion < 0 || state.savedVersion > value.documentVersion)) return false;
  }
  const metadataValid = metadata === void 0 || typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && typeof metadata.title === "string" && metadata.title === value.title && Array.isArray(metadata.authors) && metadata.authors.every((author) => typeof author === "string") && typeof metadata.tempoBpm === "number" && Number.isFinite(metadata.tempoBpm) && metadata.tempoBpm > 0;
  const tablature = r.tablature;
  const tabValid = tablature === void 0 || isTablatureProjection(tablature) && (tablature.kind === "unsupported" || tablature.measures.length === value.measureCount && (metadata === void 0 || tablature.tempoBpm === metadata.tempoBpm) && (!isNotationView(notation) || notation.kind === "unsupported" || pairedNotationMatches(notation, tablature)));
  return metadataValid && tabValid && isNotationView(notation) && isPlaybackSourceProjection(r.playbackSource) && (tablature === void 0 || !isTablatureProjection(tablature) || tablature.kind === "unsupported" || r.playbackSource.kind === "unsupported" || tablature.tempoBpm === r.playbackSource.bpm) && r.playbackSource.documentId === value.documentId && r.playbackSource.documentVersion === value.documentVersion && (metadata === void 0 || r.playbackSource.kind === "unsupported" || r.playbackSource.bpm === metadata.tempoBpm) && (metadata === void 0 || notation.kind === "unsupported" || notation.tempoBpm === metadata.tempoBpm) && (notation.kind === "unsupported" || notation.measures.length === value.measureCount);
}

// ../../apps/workbench/src/contracts/workspace-id.ts
var WORKSPACE_ID = /^[a-f0-9-]{36}$/i;
function isWorkspaceId(value) {
  return typeof value === "string" && WORKSPACE_ID.test(value);
}

// ../../apps/workbench/node_modules/@brilliant-guitar/agent-runtime/dist/contracts/capability.js
function matchesCapabilityDocumentPrecondition(value, expected, match = "exact") {
  if (expected === null || expected === void 0 || typeof value !== "object" || value === null || Array.isArray(value))
    return true;
  const candidate = value;
  const hasDocumentId = Object.prototype.hasOwnProperty.call(candidate, "documentId");
  const hasDocumentVersion = Object.prototype.hasOwnProperty.call(candidate, "documentVersion");
  if (!hasDocumentId && !hasDocumentVersion)
    return true;
  return typeof candidate.documentId === "string" && typeof candidate.documentVersion === "number" && Number.isSafeInteger(candidate.documentVersion) && candidate.documentVersion >= 0 && candidate.documentId === expected.documentId && (match === "same-document" || candidate.documentVersion === expected.documentVersion);
}
function record11(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function hasOnlyKeys(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
function isCapabilityResult(value, isData) {
  const item = record11(value);
  if (item === void 0 || typeof item.invocationId !== "string" || typeof item.capabilityId !== "string" || !Number.isSafeInteger(item.contractVersion) || typeof item.status !== "string")
    return false;
  if (item.status === "completed") {
    return hasOnlyKeys(item, ["status", "invocationId", "capabilityId", "contractVersion", "data"]) && isData(item.data);
  }
  if (item.status === "unavailable" || item.status === "rejected" || item.status === "failed") {
    return hasOnlyKeys(item, ["status", "invocationId", "capabilityId", "contractVersion", "code", "message"]) && typeof item.code === "string" && item.code.length > 0 && typeof item.message === "string" && item.message.length > 0;
  }
  return false;
}

// ../../apps/workbench/src/contracts/capability.ts
function record12(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function hasOnlyKeys2(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
function isNonNegativeSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isFiniteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isFinitePositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isPositiveSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isStableCapabilityId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
function isExactFraction2(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["numerator", "denominator"]) && typeof item.numerator === "number" && Number.isSafeInteger(item.numerator) && isPositiveSafeInteger(item.denominator);
}
function isScoreSummaryV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["documentId", "documentVersion", "title", "measureCount"]) && typeof item.documentId === "string" && item.documentId.length > 0 && isNonNegativeSafeInteger(item.documentVersion) && typeof item.title === "string" && isNonNegativeSafeInteger(item.measureCount);
}
function isScoreMetadataV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["documentId", "documentVersion", "title", "authors", "tempoBpm"]) && typeof item.documentId === "string" && item.documentId.length > 0 && isNonNegativeSafeInteger(item.documentVersion) && typeof item.title === "string" && Array.isArray(item.authors) && item.authors.every((author) => typeof author === "string") && isFiniteNonNegativeNumber(item.tempoBpm);
}
function isScorePrepareTempoChangeInputV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["tempoBpm"]) && isFinitePositiveNumber(item.tempoBpm);
}
function isScoreTempoChangeSetV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, [
    "changeSetId",
    "kind",
    "documentId",
    "baseDocumentVersion",
    "beforeTempoBpm",
    "afterTempoBpm"
  ]) && typeof item.changeSetId === "string" && /^sha256:[0-9a-f]{64}$/.test(item.changeSetId) && item.kind === "score-tempo" && isStableCapabilityId(item.documentId) && isNonNegativeSafeInteger(item.baseDocumentVersion) && isFinitePositiveNumber(item.beforeTempoBpm) && isFinitePositiveNumber(item.afterTempoBpm) && item.beforeTempoBpm !== item.afterTempoBpm;
}
function isScoreUpdateMetadataInputV1(value) {
  const item = record12(value);
  if (item === void 0) return false;
  const keys = Object.keys(item);
  return keys.length >= 1 && keys.length <= 2 && keys.every((key) => key === "title" || key === "tempoBpm") && (!Object.prototype.hasOwnProperty.call(item, "title") || typeof item.title === "string" && item.title === item.title.trim() && item.title.length > 0 && item.title.length <= 120) && (!Object.prototype.hasOwnProperty.call(item, "tempoBpm") || isFinitePositiveNumber(item.tempoBpm));
}
function isScoreMetadataSnapshotV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["title", "tempoBpm"]) && typeof item.title === "string" && item.title === item.title.trim() && item.title.length > 0 && item.title.length <= 120 && isFinitePositiveNumber(item.tempoBpm);
}
function metadataTransactionOperations(before, after) {
  const operations = [];
  if (before.title !== after.title) operations.push("set-title");
  if (before.tempoBpm !== after.tempoBpm) operations.push("set-tempo");
  return operations;
}
function isScoreMetadataTransactionChangeSetV1(value) {
  const item = record12(value);
  if (item === void 0 || !hasOnlyKeys2(item, [
    "changeSetId",
    "kind",
    "documentId",
    "baseDocumentVersion",
    "operations",
    "before",
    "after"
  ]) || typeof item.changeSetId !== "string" || !/^sha256:[0-9a-f]{64}$/.test(item.changeSetId) || item.kind !== "score-metadata-transaction" || !isStableCapabilityId(item.documentId) || !isNonNegativeSafeInteger(item.baseDocumentVersion) || !Array.isArray(item.operations) || !isScoreMetadataSnapshotV1(item.before) || !isScoreMetadataSnapshotV1(item.after)) return false;
  const expected = metadataTransactionOperations(item.before, item.after);
  return expected.length > 0 && item.operations.length === expected.length && item.operations.every((operation, index) => operation === expected[index]);
}
function isScoreStructureV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["documentId", "documentVersion", "measureCount", "partCount", "staffCount"]) && typeof item.documentId === "string" && item.documentId.length > 0 && isNonNegativeSafeInteger(item.documentVersion) && isNonNegativeSafeInteger(item.measureCount) && isNonNegativeSafeInteger(item.partCount) && isNonNegativeSafeInteger(item.staffCount);
}
function isScoreMeasureIndexInputV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["expectedDocumentId", "expectedDocumentVersion"]) && isStableCapabilityId(item.expectedDocumentId) && isNonNegativeSafeInteger(item.expectedDocumentVersion);
}
function isScoreMeasureIndexV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["documentId", "documentVersion", "measureIds"]) && isStableCapabilityId(item.documentId) && isNonNegativeSafeInteger(item.documentVersion) && Array.isArray(item.measureIds) && item.measureIds.length > 0 && item.measureIds.every(isStableCapabilityId) && new Set(item.measureIds).size === item.measureIds.length;
}
function isScoreMeasureRangeInputV1(value) {
  const item = record12(value);
  return item !== void 0 && hasOnlyKeys2(item, ["startMeasureId", "endMeasureId", "maxMeasures"]) && isStableCapabilityId(item.startMeasureId) && isStableCapabilityId(item.endMeasureId) && isPositiveSafeInteger(item.maxMeasures) && item.maxMeasures <= 32;
}
function isScoreMeasureRangeMeasureV1(value) {
  const item = record12(value);
  if (item === void 0 || !hasOnlyKeys2(item, ["measureId", "meter", "pickupDuration"]) || !isStableCapabilityId(item.measureId)) return false;
  const meter = record12(item.meter);
  return meter !== void 0 && hasOnlyKeys2(meter, ["numerator", "denominator"]) && isPositiveSafeInteger(meter.numerator) && isPositiveSafeInteger(meter.denominator) && (item.pickupDuration === null || isExactFraction2(item.pickupDuration));
}
function isScoreMeasureRangeV1(value) {
  const item = record12(value);
  if (item === void 0 || !hasOnlyKeys2(item, [
    "documentId",
    "documentVersion",
    "startMeasureId",
    "endMeasureId",
    "measureCount",
    "measures"
  ]) || !isStableCapabilityId(item.documentId) || !isNonNegativeSafeInteger(item.documentVersion) || !isStableCapabilityId(item.startMeasureId) || !isStableCapabilityId(item.endMeasureId) || !isPositiveSafeInteger(item.measureCount) || item.measureCount > 32 || !Array.isArray(item.measures) || item.measures.length !== item.measureCount || !item.measures.every(isScoreMeasureRangeMeasureV1)) return false;
  const measureIds = item.measures.map((measure) => measure.measureId);
  return new Set(measureIds).size === measureIds.length && measureIds[0] === item.startMeasureId && measureIds.at(-1) === item.endMeasureId;
}

// ../../apps/workbench/src/services/score-read-port.ts
var EMPTY_INPUT = Object.freeze({});
function unavailable() {
  return Object.freeze({
    status: "unavailable",
    code: "score.session-unavailable",
    message: "\u5F53\u524D\u5DE5\u4F5C\u533A\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u4E50\u8C31\u4F1A\u8BDD"
  });
}
function hostFailure(error) {
  if (!(error instanceof WorkbenchRequestError)) return void 0;
  const code = error.issue?.code ?? "score.read-failed";
  const retryable = error.issue?.retryable ?? error.status >= 500;
  return Object.freeze({
    status: retryable ? "unavailable" : "failed",
    code,
    message: error.issue?.message ?? error.message
  });
}
var ScoreReadClient = class {
  #host;
  #workspaceId;
  constructor(host, workspaceId) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }
  readSummary(expectedDocument = null) {
    const method = this.#host.readScoreSummary === void 0 ? void 0 : (workspaceId) => this.#host.readScoreSummary(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreSummaryV1, expectedDocument);
  }
  readMetadata(expectedDocument = null) {
    const method = this.#host.readScoreMetadata === void 0 ? void 0 : (workspaceId) => this.#host.readScoreMetadata(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreMetadataV1, expectedDocument);
  }
  readStructure(expectedDocument = null) {
    const method = this.#host.readScoreStructure === void 0 ? void 0 : (workspaceId) => this.#host.readScoreStructure(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreStructureV1, expectedDocument);
  }
  async readMeasureIndex(input, expectedDocument = null) {
    if (!isScoreMeasureIndexInputV1(input)) {
      throw new Error("\u4E50\u8C31\u5C0F\u8282\u7D22\u5F15\u8BFB\u53D6\u8BF7\u6C42\u65E0\u6548");
    }
    const { expectedDocumentId, expectedDocumentVersion } = input;
    if (expectedDocument !== null && (expectedDocument.documentId !== expectedDocumentId || expectedDocument.documentVersion !== expectedDocumentVersion)) {
      throw new Error("\u4E50\u8C31\u5C0F\u8282\u7D22\u5F15\u8BF7\u6C42\u4E0E\u5F53\u524D\u6587\u6863\u4E0D\u5339\u914D");
    }
    const method = this.#host.readScoreMeasureIndex === void 0 ? void 0 : (workspaceId, value) => this.#host.readScoreMeasureIndex(workspaceId, value);
    const result = await this.read(method, input, isScoreMeasureIndexV1, null);
    if (result.status === "ready" && (result.data.documentId !== expectedDocumentId || result.data.documentVersion !== expectedDocumentVersion)) {
      throw new Error("\u4E50\u8C31\u5C0F\u8282\u7D22\u5F15\u8BFB\u53D6\u7ED3\u679C\u4E0E\u8BF7\u6C42\u4E0D\u5339\u914D");
    }
    return result;
  }
  async readMeasureRange(input, expectedDocument = null) {
    if (!isScoreMeasureRangeInputV1(input)) {
      throw new Error("\u4E50\u8C31\u5C0F\u8282\u8303\u56F4\u8BFB\u53D6\u8BF7\u6C42\u65E0\u6548");
    }
    const { startMeasureId, endMeasureId, maxMeasures } = input;
    const method = this.#host.readScoreMeasureRange === void 0 ? void 0 : (workspaceId, value) => this.#host.readScoreMeasureRange(workspaceId, value);
    const result = await this.read(method, input, isScoreMeasureRangeV1, expectedDocument);
    if (result.status === "ready" && (result.data.startMeasureId !== startMeasureId || result.data.endMeasureId !== endMeasureId || result.data.measureCount > maxMeasures)) {
      throw new Error("\u4E50\u8C31\u5C0F\u8282\u8303\u56F4\u8BFB\u53D6\u7ED3\u679C\u4E0E\u8BF7\u6C42\u4E0D\u5339\u914D");
    }
    return result;
  }
  async read(method, input, isData, expectedDocument) {
    if (method === void 0) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u4E50\u8C31\u7C7B\u578B\u5316\u8BFB\u53D6\u7AEF\u53E3");
    let value;
    try {
      value = input === EMPTY_INPUT ? await method(this.#workspaceId) : await method(this.#workspaceId, input);
    } catch (error) {
      const failure = hostFailure(error);
      if (failure !== void 0) return failure;
      throw error;
    }
    if (value === null) return unavailable();
    if (!isData(value)) throw new Error("\u4E50\u8C31\u7C7B\u578B\u5316\u8BFB\u53D6\u7ED3\u679C\u65E0\u6548");
    if (!matchesCapabilityDocumentPrecondition(value, expectedDocument)) {
      throw new Error("\u4E50\u8C31\u8BFB\u53D6\u7ED3\u679C\u4E0E\u8BF7\u6C42\u6587\u6863\u4E0D\u5339\u914D");
    }
    return Object.freeze({ status: "ready", data: value });
  }
};

// ../../apps/workbench/src/services/score-edit-port.ts
var ScoreEditClient = class {
  #host;
  #workspaceId;
  constructor(host, workspaceId) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }
  async edit(input) {
    if (!isScoreEditRequest(input)) throw new Error("\u7F16\u8F91\u8BF7\u6C42\u65E0\u6548");
    const value = await this.#host.edit(this.#workspaceId, {
      requestId: input.requestId,
      documentId: input.documentId,
      expectedVersion: input.expectedVersion,
      action: input.action
    });
    if (!isScoreSessionRead(value)) throw new Error("\u7F16\u8F91\u7ED3\u679C\u65E0\u6548");
    return value;
  }
};

// ../../apps/workbench/src/services/score-change-set-port.ts
var ScoreChangeSetPortError = class extends Error {
  outcome;
  constructor(message, outcome) {
    super(message);
    this.outcome = outcome;
  }
};
var ScoreChangeSetClient = class {
  #host;
  #workspaceId;
  constructor(host, workspaceId) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }
  async prepareTempoChange(input, context) {
    if (!isScorePrepareTempoChangeInputV1(input)) {
      throw new ScoreChangeSetPortError(
        "Score tempo ChangeSet input is invalid",
        "definite-failure"
      );
    }
    const request = Object.freeze({ tempoBpm: input.tempoBpm });
    const precondition = this.capturePrecondition(context);
    const changeSet = await this.prepare(
      precondition,
      this.#host.prepareScoreTempoChange,
      request,
      isScoreTempoChangeSetV1
    );
    if (changeSet.documentId !== precondition.documentId || changeSet.baseDocumentVersion !== precondition.documentVersion || changeSet.afterTempoBpm !== request.tempoBpm) {
      throw new ScoreChangeSetPortError(
        "Prepared tempo ChangeSet does not match the request",
        "definite-failure"
      );
    }
    return changeSet;
  }
  async prepareMetadataTransaction(input, context) {
    if (!isScoreUpdateMetadataInputV1(input)) {
      throw new ScoreChangeSetPortError(
        "Score metadata ChangeSet input is invalid",
        "definite-failure"
      );
    }
    const request = Object.freeze({ ...input });
    const precondition = this.capturePrecondition(context);
    const changeSet = await this.prepare(
      precondition,
      this.#host.prepareScoreMetadataTransaction,
      request,
      isScoreMetadataTransactionChangeSetV1
    );
    if (changeSet.documentId !== precondition.documentId || changeSet.baseDocumentVersion !== precondition.documentVersion || changeSet.after.title !== (request.title ?? changeSet.before.title) || changeSet.after.tempoBpm !== (request.tempoBpm ?? changeSet.before.tempoBpm)) {
      throw new ScoreChangeSetPortError(
        "Prepared metadata ChangeSet does not match the request",
        "definite-failure"
      );
    }
    return changeSet;
  }
  capturePrecondition(context) {
    if (typeof context !== "object" || context === null || Array.isArray(context) || typeof context.preparationInvocationId !== "string" || context.preparationInvocationId.length === 0 || typeof context.workspaceId !== "string" || context.workspaceId.length === 0 || typeof context.documentPrecondition !== "object" || context.documentPrecondition === null || Array.isArray(context.documentPrecondition) || typeof context.documentPrecondition.documentId !== "string" || context.documentPrecondition.documentId.length === 0 || context.documentPrecondition.documentId.length > 256 || !Number.isSafeInteger(context.documentPrecondition.documentVersion) || context.documentPrecondition.documentVersion < 0) {
      throw new ScoreChangeSetPortError(
        "Score ChangeSet preparation context is invalid",
        "definite-failure"
      );
    }
    if (context.workspaceId !== this.#workspaceId) {
      throw new ScoreChangeSetPortError("Score ChangeSet workspace does not match", "definite-failure");
    }
    return Object.freeze({
      documentId: context.documentPrecondition.documentId,
      documentVersion: context.documentPrecondition.documentVersion
    });
  }
  async prepare(precondition, method, input, isResult) {
    if (method === void 0) {
      throw new ScoreChangeSetPortError("Score ChangeSet preparation port is unavailable", "unknown");
    }
    let value;
    try {
      value = await method.call(this.#host, this.#workspaceId, precondition, input);
    } catch (error) {
      if (error instanceof WorkbenchRequestError) {
        throw new ScoreChangeSetPortError(error.issue?.message ?? error.message, "definite-failure");
      }
      throw new ScoreChangeSetPortError("Score ChangeSet preparation outcome is unknown", "unknown");
    }
    if (value === null) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation requires an open score document",
        "definite-failure"
      );
    }
    if (!isResult(value)) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation returned invalid data",
        "definite-failure"
      );
    }
    return value;
  }
};

// ../../apps/workbench/src/services/application-capability-gateway.ts
var ApplicationCapabilityGatewayError = class extends Error {
  code;
  outcome;
  constructor(code, message, outcome, options) {
    super(message, options);
    this.name = "ApplicationCapabilityGatewayError";
    this.code = code;
    this.outcome = outcome;
  }
};
var ApplicationCapabilityGateway = class {
  #directory;
  #transport;
  #invokers = /* @__PURE__ */ new Map();
  constructor(directory, transport) {
    this.#directory = directory;
    this.#transport = transport;
  }
  forCaller(caller) {
    const existing = this.#invokers.get(caller);
    if (existing) return existing;
    const invoker = Object.freeze({
      invokeCapability: (request) => this.#invoke(caller, request)
    });
    this.#invokers.set(caller, invoker);
    return invoker;
  }
  async #invoke(caller, request) {
    const capability = this.#directory.get(request.capabilityId);
    if (!capability) throw new ApplicationCapabilityGatewayError(
      "capability-unavailable",
      `Application Capability is not active: ${request.capabilityId}`,
      "definite-failure"
    );
    if (!capability.callers.includes(caller)) throw new ApplicationCapabilityGatewayError(
      "caller-not-allowed",
      `Application Capability does not allow ${caller}: ${request.capabilityId}`,
      "definite-failure"
    );
    if (capability.contractVersion !== request.contractVersion) throw new ApplicationCapabilityGatewayError(
      "contract-version-mismatch",
      `Application Capability contract version is unavailable: ${request.capabilityId}@${request.contractVersion}`,
      "definite-failure"
    );
    try {
      if (!capability.validateInput(request.input)) throw new ApplicationCapabilityGatewayError(
        "invalid-input",
        `Application Capability input is invalid: ${request.capabilityId}`,
        "definite-failure"
      );
    } catch (error) {
      if (error instanceof ApplicationCapabilityGatewayError) throw error;
      throw new ApplicationCapabilityGatewayError(
        "invalid-input",
        `Application Capability input validator failed: ${request.capabilityId}`,
        "definite-failure",
        { cause: error }
      );
    }
    let value;
    try {
      if (caller === "agent") value = await this.#transport.invokeAgentCapability(request);
      else value = await this.#transport.invokeCapability(request);
    } catch (error) {
      throw new ApplicationCapabilityGatewayError(
        "dispatch-outcome-unknown",
        `Application Capability dispatch outcome is unknown: ${request.capabilityId}`,
        "unknown",
        { cause: error }
      );
    }
    let result = null;
    try {
      const isOutput = (output) => capability.validateOutput(output);
      if (isCapabilityResult(value, isOutput)) result = value;
    } catch (error) {
      throw new ApplicationCapabilityGatewayError(
        "invalid-result",
        `Application Capability output validator failed: ${request.capabilityId}`,
        "unknown",
        { cause: error }
      );
    }
    if (result === null) throw new ApplicationCapabilityGatewayError(
      "invalid-result",
      `Application Capability returned an invalid result: ${request.capabilityId}`,
      "unknown"
    );
    if (result.invocationId !== request.invocationId || result.capabilityId !== request.capabilityId || result.contractVersion !== request.contractVersion) {
      throw new ApplicationCapabilityGatewayError(
        "result-identity-mismatch",
        `Application Capability result identity does not match the invocation: ${request.capabilityId}`,
        "unknown"
      );
    }
    if (result.status === "completed" && !matchesCapabilityDocumentPrecondition(result.data, request.documentPrecondition, "same-document")) {
      throw new ApplicationCapabilityGatewayError(
        "result-identity-mismatch",
        `Application Capability result does not match the requested document: ${request.capabilityId}`,
        "unknown"
      );
    }
    return result;
  }
};

// ../../apps/workbench/node_modules/@brilliant-guitar/agent-runtime/dist/contracts/agent-provider-credential.js
function record13(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys5(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function isAgentProviderCredentialSnapshot(value) {
  const snapshot = record13(value);
  return snapshot !== null && onlyKeys5(snapshot, ["providerId", "present", "status", "message"]) && isAgentProviderId(snapshot.providerId) && typeof snapshot.present === "boolean" && (snapshot.status === "configured" || snapshot.status === "missing" || snapshot.status === "unavailable") && snapshot.status === "configured" === snapshot.present && typeof snapshot.message === "string" && snapshot.message.length > 0 && snapshot.message.length <= 240;
}
function isAgentProviderCredentialSecret(value) {
  return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= 5 * 512 && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
function unavailableAgentProviderCredential(providerId) {
  return Object.freeze({
    providerId,
    present: false,
    status: "unavailable",
    message: "\u7CFB\u7EDF\u51ED\u636E\u5E93\u4EC5\u5728\u684C\u9762\u5BBF\u4E3B\u4E2D\u53EF\u7528"
  });
}

// ../../apps/workbench/node_modules/@brilliant-guitar/agent-runtime/dist/contracts/agent-provider-turn.js
var DEFAULT_AGENT_PROVIDER_TURN_LIMITS = Object.freeze({
  timeoutMs: 45e3,
  maxOutputTokens: 1500
});
function record14(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys6(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function validText2(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
function validTokenCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isAgentProviderDecisionEnvelopeV1(value) {
  const envelope = record14(value);
  if (envelope === null || !onlyKeys6(envelope, ["schemaVersion", "providerId", "modelId", "providerRequestId", "decision", "usage"]) || envelope.schemaVersion !== 1 || !validText2(envelope.providerId, 160) || !validText2(envelope.modelId, 160) || !validText2(envelope.providerRequestId, 256))
    return false;
  if (envelope.usage === null)
    return true;
  const usage = record14(envelope.usage);
  return usage !== null && onlyKeys6(usage, ["inputTokens", "outputTokens", "totalTokens"]) && validTokenCount(usage.inputTokens) && validTokenCount(usage.outputTokens) && validTokenCount(usage.totalTokens) && usage.totalTokens >= usage.inputTokens && usage.totalTokens >= usage.outputTokens;
}
function isAgentProviderStreamEventV1(value) {
  const event = record14(value);
  if (event === null || !validText2(event.runId, 160) || !validText2(event.turnId, 160) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.type !== "string")
    return false;
  const base = ["type", "runId", "turnId", "sequence"];
  if (event.type === "response.started" || event.type === "response.completed") {
    return onlyKeys6(event, base);
  }
  if (event.type === "response.text-delta") {
    return onlyKeys6(event, [...base, "delta"]) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.tool-input-delta") {
    return onlyKeys6(event, [...base, "callId", "delta"]) && validText2(event.callId, 256) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.usage") {
    return onlyKeys6(event, [...base, "inputTokens", "outputTokens", "totalTokens"]) && validTokenCount(event.inputTokens) && validTokenCount(event.outputTokens) && validTokenCount(event.totalTokens) && event.totalTokens === event.inputTokens + event.outputTokens;
  }
  if (event.type === "response.failed") {
    return onlyKeys6(event, [...base, "code"]) && validText2(event.code, 256);
  }
  return false;
}

// ../../apps/workbench/node_modules/@brilliant-guitar/agent-runtime/dist/contracts/agent-model-stream.js
function record15(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function onlyKeys7(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function validText3(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
function validUsage(value) {
  const usage = record15(value);
  return usage !== null && onlyKeys7(usage, ["inputTokens", "outputTokens", "totalTokens"]) && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0 && Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0 && usage.totalTokens === usage.inputTokens + usage.outputTokens;
}
function validArguments(value) {
  const visit = (candidate) => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return true;
    if (typeof candidate === "number")
      return Number.isFinite(candidate);
    if (Array.isArray(candidate))
      return candidate.every(visit);
    const object = record15(candidate);
    return object !== null && Object.values(object).every(visit);
  };
  return record15(value) !== null && visit(value);
}
function validOutputBlock(value) {
  const block = record15(value);
  if (block === null || typeof block.type !== "string")
    return false;
  if (block.type === "text") {
    return onlyKeys7(block, ["type", "text"]) && typeof block.text === "string" && block.text.length > 0 && block.text.length <= 32768 && !block.text.includes("\0");
  }
  return block.type === "tool-call" && onlyKeys7(block, ["type", "callId", "name", "arguments"]) && validText3(block.callId, 256) && validText3(block.name, 256) && validArguments(block.arguments);
}
function isAgentModelStreamEnvelopeV1(value) {
  const envelope = record15(value);
  if (envelope === null || !onlyKeys7(envelope, ["schemaVersion", "providerId", "modelId", "providerRequestId", "output", "usage"]) || envelope.schemaVersion !== 1 || !validText3(envelope.providerId, 160) || !validText3(envelope.modelId, 160) || !validText3(envelope.providerRequestId, 256) || !Array.isArray(envelope.output) || envelope.output.length === 0 || !envelope.output.every(validOutputBlock))
    return false;
  const callIds = /* @__PURE__ */ new Set();
  for (const block of envelope.output) {
    if (block.type === "tool-call") {
      if (callIds.has(block.callId))
        return false;
      callIds.add(block.callId);
    }
  }
  return envelope.usage === null || validUsage(envelope.usage);
}
function isAgentModelStreamEventV1(value) {
  const event = record15(value);
  if (event === null || !validText3(event.runId, 160) || !validText3(event.turnId, 160) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.type !== "string")
    return false;
  const base = ["type", "runId", "turnId", "sequence"];
  if (event.type === "response.started" || event.type === "response.completed")
    return onlyKeys7(event, base);
  if (event.type === "response.text-delta") {
    return onlyKeys7(event, [...base, "delta"]) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.tool-input-delta") {
    return onlyKeys7(event, [...base, "callId", "delta"]) && validText3(event.callId, 256) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.usage") {
    return onlyKeys7(event, [...base, "inputTokens", "outputTokens", "totalTokens"]) && validUsage({ inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens });
  }
  return event.type === "response.failed" && onlyKeys7(event, [...base, "code"]) && validText3(event.code, 256);
}

// ../../apps/workbench/src/services/workbench-client.ts
var SESSION_WORKSPACE_KEY = "brilliant.workbench.session.v1";
var DESKTOP_WORKSPACE_KEY = "brilliant.workbench.desktop.v1";
var EMPTY_APPLICATION_CAPABILITIES = Object.freeze({
  get: () => void 0,
  list: () => Object.freeze([])
});
function resolveWorkbenchWorkspaceId(nativeFiles, sessionStore = globalThis.sessionStorage, persistentStore = globalThis.localStorage, createId = () => crypto.randomUUID()) {
  try {
    if (!nativeFiles) {
      const stored = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
      const workspaceId2 = isWorkspaceId(stored) ? stored : createId();
      sessionStore?.setItem(SESSION_WORKSPACE_KEY, workspaceId2);
      return workspaceId2;
    }
    const persisted = persistentStore?.getItem(DESKTOP_WORKSPACE_KEY);
    const legacySession = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
    const workspaceId = isWorkspaceId(persisted) ? persisted : isWorkspaceId(legacySession) ? legacySession : createId();
    persistentStore?.setItem(DESKTOP_WORKSPACE_KEY, workspaceId);
    return workspaceId;
  } catch {
    return createId();
  }
}
var WorkbenchClient = class {
  bridge;
  workspaceId;
  scoreReads;
  scoreEdits;
  scoreChangeSets;
  agentCapabilityInvoker;
  constructor(bridge = createWorkbenchHostBridge(), capabilities = EMPTY_APPLICATION_CAPABILITIES) {
    this.bridge = bridge;
    this.workspaceId = resolveWorkbenchWorkspaceId(bridge.nativeFiles === true);
    const gateway = new ApplicationCapabilityGateway(capabilities, bridge);
    this.scoreReads = new ScoreReadClient(this.bridge, this.workspaceId);
    this.scoreEdits = new ScoreEditClient(this.bridge, this.workspaceId);
    this.scoreChangeSets = new ScoreChangeSetClient(this.bridge, this.workspaceId);
    this.agentCapabilityInvoker = gateway.forCaller("agent");
  }
  readScoreSummary() {
    return this.legacyScoreRead("score.read-summary", this.scoreReads.readSummary());
  }
  readScoreMetadata() {
    return this.legacyScoreRead("score.read-metadata", this.scoreReads.readMetadata());
  }
  readScoreStructure() {
    return this.legacyScoreRead("score.read-structure", this.scoreReads.readStructure());
  }
  readScoreMeasureIndex(input) {
    return this.legacyScoreRead("score.read-measure-index", this.scoreReads.readMeasureIndex(input));
  }
  readScoreMeasureRange(input) {
    return this.legacyScoreRead("score.read-measure-range", this.scoreReads.readMeasureRange(input));
  }
  /** Typed score port for UI controllers and direct Agent adapters. */
  scoreReadPort() {
    return this.scoreReads;
  }
  /** Typed score edit port for UI controllers and first-party UI plugins. */
  scoreEditPort() {
    return this.scoreEdits;
  }
  /** Typed read-only preparation port for authoritative Agent ChangeSets. */
  scoreChangeSetPort() {
    return this.scoreChangeSets;
  }
  getWorkspaceId() {
    return this.workspaceId;
  }
  agentCapabilities() {
    return Object.freeze({
      invokeCapability: (request) => {
        if (request.workspaceId !== this.workspaceId) throw new Error("Agent Capability \u5DE5\u4F5C\u533A\u4E0D\u5339\u914D");
        return this.agentCapabilityInvoker.invokeCapability(request);
      }
    });
  }
  async legacyScoreRead(capabilityId, resultPromise) {
    const identity = {
      invocationId: crypto.randomUUID(),
      capabilityId,
      contractVersion: 1
    };
    const result = await resultPromise;
    return result.status === "ready" ? Object.freeze({ ...identity, status: "completed", data: result.data }) : Object.freeze({ ...identity, status: "unavailable", code: result.code, message: result.message });
  }
  session(value, requiredMessage) {
    if (value === null) {
      if (requiredMessage) throw new Error(requiredMessage);
      return null;
    }
    if (!isScoreSessionRead(value)) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u64CD\u4F5C\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5");
    return value;
  }
  async edit(input) {
    return this.scoreEdits.edit(input);
  }
  async read() {
    return this.session(await this.bridge.read(this.workspaceId));
  }
  async create(input, requestId, expectedDocumentId) {
    return this.session(
      await this.bridge.create(this.workspaceId, input, requestId, expectedDocumentId),
      "\u65E0\u6CD5\u786E\u8BA4\u521B\u5EFA\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5"
    );
  }
  async exportDocument() {
    return this.bridge.exportDocument(this.workspaceId);
  }
  async createGuarded(input, requestId, expected) {
    if (!isDocumentReplacementPrecondition(expected)) throw new Error("\u4F5C\u54C1\u66FF\u6362\u9884\u6761\u4EF6\u65E0\u6548");
    if (!this.bridge.createGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u65B0\u5EFA\u4F5C\u54C1");
    return this.session(await this.bridge.createGuarded(this.workspaceId, input, requestId, expected), "\u65E0\u6CD5\u786E\u8BA4\u521B\u5EFA\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5");
  }
  async importDocument(document2) {
    const session = await this.bridge.importDocument(this.workspaceId, document2);
    if (!isScoreSessionRead(session)) throw new Error("\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
    return session;
  }
  usesNativeFiles() {
    return this.bridge.nativeFiles === true;
  }
  async openNativeDocument() {
    if (!this.bridge.openNativeDocument) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u539F\u751F\u6253\u5F00\u6587\u4EF6");
    const result = await this.bridge.openNativeDocument(this.workspaceId);
    return this.nativeFileResult(result);
  }
  async openNativeDocumentGuarded(expected) {
    if (!isDocumentReplacementPrecondition(expected)) throw new Error("\u4F5C\u54C1\u66FF\u6362\u9884\u6761\u4EF6\u65E0\u6548");
    if (!this.bridge.openNativeDocumentGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u6253\u5F00\u4F5C\u54C1");
    return this.nativeFileResult(await this.bridge.openNativeDocumentGuarded(this.workspaceId, expected));
  }
  nativeFileResult(result) {
    if (result === null) return null;
    const session = this.session(result.session, "\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion) || result.savedVersion < 0) throw new Error("\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
    if (session.persistence && (session.persistence.savedVersion !== result.savedVersion || session.persistence.dirty)) {
      throw new Error("\u6587\u4EF6\u68C0\u67E5\u70B9\u7ED3\u679C\u65E0\u6548");
    }
    const warnings = result.warnings;
    if (warnings !== void 0 && (!Array.isArray(warnings) || warnings.length > 4 || warnings.some((warning) => !isWorkbenchIssue(warning) || warning.severity !== "warning"))) throw new Error("\u6587\u4EF6\u6253\u5F00\u8B66\u544A\u7ED3\u679C\u65E0\u6548");
    return { session, name: result.name, savedVersion: result.savedVersion, ...warnings?.length ? { warnings: Object.freeze([...warnings]) } : {} };
  }
  recentSnapshot(value) {
    if (!isRecentDocumentsSnapshotV1(value)) throw new Error("\u6700\u8FD1\u6587\u4EF6\u76EE\u5F55\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async listRecentDocuments() {
    if (!this.bridge.listRecentDocuments) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u6700\u8FD1\u6587\u4EF6\u76EE\u5F55");
    return this.recentSnapshot(await this.bridge.listRecentDocuments());
  }
  async removeRecentDocument(recordId) {
    if (!isRecentRecordId(recordId)) throw new Error("\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55ID\u65E0\u6548");
    if (!this.bridge.removeRecentDocument) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u79FB\u9664\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55");
    return this.recentSnapshot(await this.bridge.removeRecentDocument(recordId));
  }
  async openRecentDocumentGuarded(recordId, expected) {
    if (!isRecentRecordId(recordId) || !isDocumentReplacementPrecondition(expected)) throw new Error("\u6700\u8FD1\u6587\u4EF6\u6253\u5F00\u53C2\u6570\u65E0\u6548");
    if (!this.bridge.openRecentDocumentGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u6253\u5F00\u6700\u8FD1\u6587\u4EF6");
    const result = this.nativeFileResult(await this.bridge.openRecentDocumentGuarded(this.workspaceId, recordId, expected));
    if (!result) throw new Error("\u6700\u8FD1\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
    return result;
  }
  async recordCurrentFile(expected) {
    if (!isDocumentReplacementPrecondition(expected) || expected.kind !== "document") throw new Error("\u767B\u8BB0\u6700\u8FD1\u6587\u4EF6\u9700\u8981\u5F53\u524D\u4F5C\u54C1\u8EAB\u4EFD");
    if (!this.bridge.recordCurrentFile) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u767B\u8BB0\u6700\u8FD1\u6587\u4EF6");
    return this.recentSnapshot(await this.bridge.recordCurrentFile(this.workspaceId, expected));
  }
  async saveNativeDocument(suggestedName, saveAs) {
    if (!this.bridge.saveNativeDocument) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u539F\u751F\u4FDD\u5B58\u6587\u4EF6");
    const result = await this.bridge.saveNativeDocument(this.workspaceId, suggestedName, saveAs);
    return this.nativeFileResult(result);
  }
  async saveNativeDocumentGuarded(suggestedName, saveAs, expected) {
    if (!isDocumentReplacementPrecondition(expected) || expected.kind !== "document" || typeof saveAs !== "boolean") {
      throw new Error("\u4FDD\u5B58\u9700\u8981\u6709\u6548\u7684\u4F5C\u54C1\u8EAB\u4EFD\u548C\u7248\u672C");
    }
    if (!this.bridge.saveNativeDocumentGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u4FDD\u5B58\u4F5C\u54C1");
    return this.nativeFileResult(await this.bridge.saveNativeDocumentGuarded(this.workspaceId, suggestedName, saveAs, expected));
  }
  onNativeCloseRequested(handler) {
    return this.bridge.onNativeCloseRequested?.(handler) ?? Promise.resolve(() => {
    });
  }
  async closeNativeWindow() {
    if (!this.bridge.closeNativeWindow) return;
    await this.bridge.closeNativeWindow(this.workspaceId);
  }
  onNativeCloseRequestedGuarded(handler) {
    if (!this.bridge.onNativeCloseRequestedGuarded) return Promise.reject(new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u5173\u95ED"));
    return this.bridge.onNativeCloseRequestedGuarded(handler);
  }
  async closeNativeWindowGuarded(expected) {
    if (!isNativeClosePrecondition(expected)) throw new Error("\u5173\u95ED\u9700\u8981\u6709\u6548\u7684\u4F1A\u8BDD\u8EAB\u4EFD\u548C\u7248\u672C");
    if (!this.bridge.closeNativeWindowGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u5173\u95ED");
    const result = await this.bridge.closeNativeWindowGuarded(this.workspaceId, expected);
    if (typeof result !== "boolean") throw new Error("\u65E0\u6CD5\u786E\u8BA4\u7A97\u53E3\u5173\u95ED\u7ED3\u679C");
    return result;
  }
  async readApplicationSettings() {
    if (!this.bridge.readApplicationSettings) return {
      settings: DEFAULT_APPLICATION_SETTINGS,
      persisted: false,
      recoveredFromInvalid: false
    };
    const value = await this.bridge.readApplicationSettings();
    const snapshot = normalizeApplicationSettingsSnapshot(value);
    if (snapshot === null) throw new Error("\u5E94\u7528\u914D\u7F6E\u8BFB\u53D6\u7ED3\u679C\u65E0\u6548");
    return snapshot;
  }
  async writeApplicationSettings(settings) {
    if (!isApplicationSettingsV1(settings)) throw new Error("\u5E94\u7528\u914D\u7F6E\u683C\u5F0F\u65E0\u6548");
    if (!this.bridge.writeApplicationSettings) return settings;
    const value = await this.bridge.writeApplicationSettings(settings);
    if (!isApplicationSettingsV1(value)) throw new Error("\u5E94\u7528\u914D\u7F6E\u4FDD\u5B58\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async resetApplicationSettings() {
    if (!this.bridge.resetApplicationSettings) return DEFAULT_APPLICATION_SETTINGS;
    const value = await this.bridge.resetApplicationSettings();
    if (!isApplicationSettingsV1(value)) throw new Error("\u9ED8\u8BA4\u5E94\u7528\u914D\u7F6E\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async readAgentProviderCredentialStatus(providerId) {
    if (!isAgentProviderId(providerId)) throw new Error("\u6A21\u578B Provider \u6807\u8BC6\u65E0\u6548");
    if (!this.bridge.readAgentProviderCredentialStatus) return unavailableAgentProviderCredential(providerId);
    const value = await this.bridge.readAgentProviderCredentialStatus(providerId);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId) {
      throw new Error("Provider \u51ED\u636E\u72B6\u6001\u7ED3\u679C\u65E0\u6548");
    }
    return value;
  }
  async setAgentProviderCredential(providerId, secret) {
    if (!isAgentProviderId(providerId)) throw new Error("\u6A21\u578B Provider \u6807\u8BC6\u65E0\u6548");
    if (!isAgentProviderCredentialSecret(secret)) throw new Error("Provider \u51ED\u636E\u683C\u5F0F\u65E0\u6548");
    if (!this.bridge.setAgentProviderCredential) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u7CFB\u7EDF\u51ED\u636E\u5E93");
    const value = await this.bridge.setAgentProviderCredential(providerId, secret);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId || !value.present) {
      throw new Error("Provider \u51ED\u636E\u4FDD\u5B58\u7ED3\u679C\u65E0\u6548");
    }
    return value;
  }
  async deleteAgentProviderCredential(providerId) {
    if (!isAgentProviderId(providerId)) throw new Error("\u6A21\u578B Provider \u6807\u8BC6\u65E0\u6548");
    if (!this.bridge.deleteAgentProviderCredential) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u7CFB\u7EDF\u51ED\u636E\u5E93");
    const value = await this.bridge.deleteAgentProviderCredential(providerId);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId || value.present) {
      throw new Error("Provider \u51ED\u636E\u5220\u9664\u7ED3\u679C\u65E0\u6548");
    }
    return value;
  }
  async decideAgentProvider(request, signal, observer) {
    if (!isAgentProviderId(request.providerId)) throw new Error("\u6A21\u578B Provider \u6807\u8BC6\u65E0\u6548");
    if (!this.bridge.decideAgentProvider) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u6A21\u578B Provider");
    let streamError = null;
    const value = await this.bridge.decideAgentProvider(request, signal, (event) => {
      if (streamError !== null) return;
      if (!isAgentProviderStreamEventV1(event) || event.runId !== request.runId || event.turnId !== request.turnId) {
        streamError = new Error("\u6A21\u578B Provider \u6D41\u5F0F\u4E8B\u4EF6\u65E0\u6548");
        return;
      }
      try {
        observer?.(event);
      } catch {
      }
    });
    if (streamError !== null) throw streamError;
    if (!isAgentProviderDecisionEnvelopeV1(value) || value.providerId !== request.providerId || value.modelId !== request.modelId) throw new Error("\u6A21\u578B Provider \u51B3\u7B56\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async streamAgentModel(request, signal, observer) {
    if (!isAgentProviderId(request.providerId)) throw new Error("\u6A21\u578B Provider \u6807\u8BC6\u65E0\u6548");
    if (!this.bridge.streamAgentModel) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u539F\u59CB\u6A21\u578B\u6D41");
    let streamError = null;
    const value = await this.bridge.streamAgentModel(request, signal, (event) => {
      if (streamError !== null) return;
      if (!isAgentModelStreamEventV1(event) || event.runId !== request.runId || event.turnId !== request.turnId) {
        streamError = new Error("\u539F\u59CB\u6A21\u578B\u6D41\u4E8B\u4EF6\u65E0\u6548");
        return;
      }
      try {
        observer?.(event);
      } catch {
      }
    });
    if (streamError !== null) throw streamError;
    if (!isAgentModelStreamEnvelopeV1(value) || value.providerId !== request.providerId || value.modelId !== request.modelId) throw new Error("\u539F\u59CB\u6A21\u578B\u6D41\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async readWorkspaceConfiguration() {
    if (!this.bridge.readWorkspaceConfiguration) return {
      configuration: DEFAULT_WORKSPACE_CONFIGURATION,
      persisted: false,
      recoveredFromInvalid: false
    };
    const value = await this.bridge.readWorkspaceConfiguration(this.workspaceId);
    if (!isWorkspaceConfigurationSnapshotV1(value)) throw new Error("\u5DE5\u4F5C\u533A\u914D\u7F6E\u8BFB\u53D6\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async writeWorkspaceConfiguration(configuration) {
    if (!isWorkspaceConfigurationV1(configuration)) throw new Error("\u5DE5\u4F5C\u533A\u914D\u7F6E\u683C\u5F0F\u65E0\u6548");
    if (!this.bridge.writeWorkspaceConfiguration) return configuration;
    const value = await this.bridge.writeWorkspaceConfiguration(this.workspaceId, configuration);
    if (!isWorkspaceConfigurationV1(value)) throw new Error("\u5DE5\u4F5C\u533A\u914D\u7F6E\u4FDD\u5B58\u7ED3\u679C\u65E0\u6548");
    return value;
  }
  async resetWorkspaceConfiguration() {
    if (!this.bridge.resetWorkspaceConfiguration) return DEFAULT_WORKSPACE_CONFIGURATION;
    const value = await this.bridge.resetWorkspaceConfiguration(this.workspaceId);
    if (!isWorkspaceConfigurationV1(value)) throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u533A\u914D\u7F6E\u7ED3\u679C\u65E0\u6548");
    return value;
  }
};

// ../../apps/workbench/src/services/document-file.ts
function fileStem(value) {
  const stem = value.replace(/(?:\.bgp\.json|\.json|\.svg)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  return stem.slice(0, 80).trim().replace(/[. ]+$/g, "") || "\u672A\u547D\u540D\u4E50\u8C31";
}
function checkpointMatches(session, checkpoint) {
  if (session?.persistence) {
    return session.persistence.savedVersion !== null && !session.persistence.dirty;
  }
  return Boolean(session && checkpoint && checkpoint.documentId === session.documentId && checkpoint.documentVersion === session.documentVersion);
}
function hasUnsavedDocument(session, checkpoint) {
  if (!session || checkpointMatches(session, checkpoint)) return false;
  if (session.persistence?.savedVersion !== void 0 && session.persistence.savedVersion !== null) {
    return session.persistence.dirty;
  }
  return session.documentVersion > 0 || session.measureCount !== 1 || session.title !== "\u672A\u547D\u540D\u4E50\u8C31";
}
function reconcileSavedSession(saving, current, receipt) {
  if (!current || current.documentId !== saving.documentId || receipt.documentId !== saving.documentId || receipt.documentVersion !== saving.documentVersion) return null;
  if (saving.persistence) {
    const id = saving.persistence.sessionId;
    if (current.persistence?.sessionId !== id || receipt.persistence?.sessionId !== id) return null;
  } else if (current !== saving && current.documentVersion <= saving.documentVersion) {
    return null;
  }
  return current.documentVersion > receipt.documentVersion ? current : receipt;
}

// ../../apps/workbench/src/services/initial-score.ts
async function readOrCreateInitialScore(client, requestId) {
  const current = await client.read();
  if (current) return current;
  try {
    return await client.create({ title: "", measureCount: 1 }, requestId, null);
  } catch (error) {
    if (error instanceof WorkbenchRequestError && error.status === 409) {
      const existing = await client.read();
      if (existing) return existing;
    }
    throw error;
  }
}

// ../../apps/workbench/src/ui/notify-observers.ts
function notifyObservers(listeners) {
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result !== void 0) void Promise.resolve(result).catch(() => {
      });
    } catch {
    }
  }
}

// ../../shared/notation/measure-edit.ts
function equalMeter(left, right) {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}
function measureMeterTargets(measures, measureId, scope) {
  const start = measures.findIndex((item) => item.id === measureId);
  if (start < 0) return [];
  const target = measures[start];
  const targets = [target];
  if (scope === "meter-run") {
    for (const measure of measures.slice(start + 1)) {
      if (!equalMeter(measure.meter, target.meter)) break;
      targets.push(measure);
    }
  }
  return targets;
}

// ../../shared/notation/key-signature.ts
function keySignatureStateAtMeasure(view, measureId) {
  const target = view.measures.findIndex((measure) => measure.id === measureId);
  if (target < 0) return null;
  const changes = view.keySignatureChanges ?? [];
  let low = 0, high = changes.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const change2 = changes[middle];
    if (change2.measureIndex <= target) {
      low = middle + 1;
    } else high = middle - 1;
  }
  const change = changes[high], changed = change?.measureIndex === target;
  return {
    fifths: change?.fifths ?? 0,
    changed,
    previousFifths: changed ? changes[high - 1]?.fifths ?? 0 : change?.fifths ?? 0
  };
}
function keySignatureChangeIsNoOp(view, measureId, change) {
  const state = keySignatureStateAtMeasure(view, measureId);
  return !!state && (change.kind === "set" ? state.fifths === change.fifths : !state.changed);
}

// ../../apps/workbench/src/services/readonly-score-document-session.ts
function createReadonlyScoreDocumentSession({ client, createId = () => crypto.randomUUID(), initialization = "ensure-document", nativeClose = false }) {
  if (initialization !== "ensure-document" && initialization !== "read-existing") throw new TypeError("initialization \u5FC5\u987B\u662F ensure-document \u6216 read-existing");
  let current;
  let checkpoint = null;
  let failure = null;
  let warnings = Object.freeze([]);
  let busy = false, disposed = false, epoch = 0;
  let initial = null;
  let unlistenClose;
  let closeRegistration = null;
  const initialId = createId();
  const readListeners = /* @__PURE__ */ new Set(), stateListeners = /* @__PURE__ */ new Set();
  const notify = notifyObservers;
  function subscribe(listeners, listener) {
    if (disposed) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
    if (typeof listener !== "function") throw new TypeError("\u4F5C\u54C1\u8BA2\u9605\u8005\u5FC5\u987B\u662F\u51FD\u6570");
    const deliver = () => {
      if (!disposed) return listener();
    };
    listeners.add(deliver);
    return () => {
      listeners.delete(deliver);
    };
  }
  const dirty = () => hasUnsavedDocument(current ?? null, checkpoint) || Boolean(current && !checkpointMatches(current, checkpoint) && (current.notation.kind === "unsupported" || current.notation.measures.some((measure) => measure.events.length > 0)));
  const snapshot = () => Object.freeze({
    status: disposed ? "disposed" : failure ? "error" : busy ? "loading" : current ? "ready" : "empty",
    busy,
    documentId: current?.documentId ?? null,
    documentVersion: current?.documentVersion ?? null,
    title: current?.title ?? "",
    dirty: dirty(),
    saved: checkpointMatches(current ?? null, checkpoint),
    measureCount: current?.measureCount ?? 0,
    tempoBpm: current?.metadata?.tempoBpm ?? (current?.notation.kind === "staff" ? current.notation.tempoBpm : null),
    metadata: current?.metadata ? Object.freeze({ ...current.metadata, authors: Object.freeze([...current.metadata.authors]) }) : null,
    undoDepth: current?.undoDepth ?? 0,
    redoDepth: current?.redoDepth ?? 0,
    message: failure?.message ?? null,
    warnings
  });
  function accept(value, replacement = false) {
    if (value !== null && !isScoreSessionRead(value)) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u4F5C\u54C1\u8BFB\u53D6\u7ED3\u679C");
    if (!replacement && current && value?.documentId === current.documentId && value.documentVersion < current.documentVersion) {
      throw new Error("\u4F5C\u54C1\u8BFB\u53D6\u7248\u672C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
    }
    current = value;
    failure = null;
    warnings = Object.freeze([
      ...replacement ? [] : warnings.filter((warning) => warning.code !== "file.recovery-unavailable"),
      ...value?.warnings ?? []
    ]);
  }
  async function loadInitial() {
    const token = epoch;
    const assertCurrent = () => {
      if (disposed || token !== epoch) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
    };
    const guardedClient = {
      read() {
        assertCurrent();
        return client.read();
      },
      create(input, requestId, expectedDocumentId) {
        assertCurrent();
        return client.create(input, requestId, expectedDocumentId);
      }
    };
    return initialization === "read-existing" ? guardedClient.read() : readOrCreateInitialScore(guardedClient, initialId);
  }
  function ensureLoaded() {
    if (disposed) return Promise.reject(new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E"));
    if (initial) return initial;
    if (failure) return Promise.reject(failure);
    if (current !== void 0) return Promise.resolve(current);
    busy = true;
    const token = ++epoch;
    initial = loadInitial().then((value) => {
      if (disposed || token !== epoch) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
      accept(value);
      return current ?? null;
    }).catch((error) => {
      if (!disposed && token === epoch) failure = error instanceof Error ? error : new Error("\u4F5C\u54C1\u8BFB\u53D6\u5931\u8D25");
      throw error;
    }).finally(() => {
      if (!disposed && token === epoch) {
        busy = false;
        initial = null;
        notify(stateListeners);
      }
    });
    notify(stateListeners);
    return initial;
  }
  async function run(operation, cancelled = false, nextCheckpoint, replacement = false) {
    if (disposed) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
    if (busy) return { ok: false, code: "document.busy", message: "\u4F5C\u54C1\u64CD\u4F5C\u5C1A\u672A\u5B8C\u6210" };
    busy = true;
    const token = ++epoch;
    notify(stateListeners);
    try {
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      const next = await operation();
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      if (cancelled && next === null) return { ok: true, changed: false, cancelled: true };
      accept(next, replacement);
      if (nextCheckpoint) checkpoint = nextCheckpoint();
      notify(readListeners);
      return { ok: true, changed: true };
    } catch (error) {
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      failure = error instanceof Error ? error : new Error("\u4F5C\u54C1\u64CD\u4F5C\u5931\u8D25");
      notify(readListeners);
      return { ok: false, code: "document.operation-failed", message: failure.message };
    } finally {
      if (!disposed && token === epoch) {
        busy = false;
        notify(stateListeners);
      }
    }
  }
  function replacementGuard() {
    if (disposed) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
    if (busy) return { ok: false, code: "document.busy", message: "\u4F5C\u54C1\u64CD\u4F5C\u5C1A\u672A\u5B8C\u6210" };
    if (failure || current === void 0) return { ok: false, code: "document.not-ready", message: "\u8BF7\u5148\u91CD\u65B0\u8BFB\u53D6\u4F5C\u54C1" };
    if (dirty()) return { ok: false, code: "document.unsaved", message: "\u5F53\u524D\u4F5C\u54C1\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF0C\u6682\u4E0D\u66FF\u6362\uFF1B\u8BF7\u4FDD\u7559\u5F53\u524D\u4F1A\u8BDD" };
    return null;
  }
  const replacementPrecondition = () => current ? { kind: "document", documentId: current.documentId, documentVersion: current.documentVersion } : { kind: "empty" };
  async function recentRequest(operation) {
    if (disposed) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
    const result = await operation();
    if (disposed) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
    return result;
  }
  function runFileOpen(operation, cancellable) {
    let opened = null;
    return run(async () => {
      opened = await operation();
      if (!opened && !cancellable) throw new Error("\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
      return opened?.session ?? null;
    }, cancellable, () => {
      if (!opened) throw new Error("\u6587\u4EF6\u6253\u5F00\u7ED3\u679C\u65E0\u6548");
      warnings = Object.freeze([...opened.session.warnings ?? [], ...opened.warnings ?? []]);
      return { documentId: opened.session.documentId, documentVersion: opened.savedVersion, name: opened.name };
    }, true);
  }
  function editGuard(projection = "staff") {
    if (disposed) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
    if (busy) return { ok: false, code: "document.busy", message: "\u4F5C\u54C1\u64CD\u4F5C\u5C1A\u672A\u5B8C\u6210" };
    if (failure || !current) return { ok: false, code: "document.not-ready", message: "\u8BF7\u5148\u8BFB\u53D6\u4F5C\u54C1" };
    const supported = projection === "staff" ? current.notation.kind === "staff" : projection === "tablature" ? current.tablature?.kind === "tablature" : current.notation.kind === "staff" || current.tablature?.kind === "tablature";
    if (!supported) return {
      ok: false,
      code: projection === "tablature" ? "document.tablature-unavailable" : "document.not-ready",
      message: "\u5F53\u524D\u4F5C\u54C1\u6CA1\u6709\u53EF\u7528\u7684\u7F16\u8F91\u8C31\u5F0F"
    };
    if (!client.edit) return { ok: false, code: "document.edit-unavailable", message: "\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u7F16\u8F91\u63A5\u53E3" };
    return null;
  }
  async function applyEdit(input) {
    const edit = client.edit?.bind(client);
    if (!edit) return { ok: false, code: "document.edit-unavailable", message: "\u5F53\u524D\u5BBF\u4E3B\u672A\u63D0\u4F9B\u7F16\u8F91\u63A5\u53E3" };
    const request = structuredClone({
      requestId: input.requestId,
      documentId: input.documentId,
      expectedVersion: input.expectedVersion,
      action: input.action
    });
    const targetEventId = request.action.kind === "set-fretted-position" ? request.action.eventId : null;
    const targetNote = current?.tablature?.kind === "tablature" ? current.tablature.measures.flatMap((measure) => measure.events).find((event) => event.id === targetEventId)?.content : null;
    const targetNoteId = targetNote?.kind === "note" ? targetNote.noteId : null;
    const accepted = {};
    const result = await run(async () => {
      const next = await edit(request);
      if (!isScoreSessionRead(next) || next.documentId !== request.documentId || next.documentVersion <= request.expectedVersion) {
        throw new Error("\u7F16\u8F91\u7ED3\u679C\u4E0D\u5339\u914D\u5F53\u524D\u4F5C\u54C1\u6216\u6CA1\u6709\u63A8\u8FDB\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
      }
      if (request.action.kind === "set-document-metadata" && (!next.metadata || documentMetadataKey(next.metadata) !== documentMetadataKey(request.action.metadata))) {
        throw new Error("\u4F5C\u54C1\u4FE1\u606F\u56DE\u6267\u7F3A\u5931\u6216\u4E0D\u5339\u914D\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
      }
      if (request.action.kind === "set-fretted-position") {
        const action = request.action, tab = next.tablature;
        const event = tab?.kind === "tablature" && tab.partId === action.partId ? tab.measures.flatMap((measure) => measure.events).find((event2) => event2.id === action.eventId) : null;
        if (!event || event.content.kind !== "note" || event.content.noteId !== targetNoteId || event.content.position.stringNumber !== action.position.stringNumber || event.content.position.fret !== action.position.fret) {
          throw new Error("\u5F26\u54C1\u56DE\u6267\u7F3A\u5931\u6216\u4E0D\u5339\u914D\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
        }
      }
      accepted.value = next;
      return next;
    });
    return result.ok && accepted.value ? { ...result, session: accepted.value } : result;
  }
  async function history(kind) {
    const guard = editGuard("either");
    if (guard) return guard;
    const value = current;
    if (!(kind === "undo" ? value.undoDepth : value.redoDepth)) return { ok: false, code: "document.history-empty", message: "\u5F53\u524D\u6CA1\u6709\u53EF\u6062\u590D\u7684\u5386\u53F2" };
    const request = { requestId: createId(), documentId: value.documentId, expectedVersion: value.documentVersion, action: { kind } };
    if (!isScoreEditRequest(request)) return { ok: false, code: "document.invalid-input", message: "\u5386\u53F2\u8BF7\u6C42\u65E0\u6548" };
    return applyEdit(request);
  }
  async function closeNativeWindow() {
    if (disposed) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
    if (busy) return { ok: false, code: "document.busy", message: "\u4F5C\u54C1\u64CD\u4F5C\u5C1A\u672A\u5B8C\u6210" };
    busy = true;
    const token = ++epoch;
    notify(stateListeners);
    let dispatched = false;
    try {
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      if (!client.closeNativeWindowGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u5173\u95ED");
      if (current === void 0 || failure) {
        const value = await client.read();
        if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
        accept(value);
        notify(readListeners);
      }
      const expected = nativeClosePrecondition(current ?? null);
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      dispatched = await client.closeNativeWindowGuarded(expected);
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      return dispatched ? { ok: true, changed: false } : { ok: true, changed: false, cancelled: true };
    } catch (error) {
      if (disposed || token !== epoch) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      failure = error instanceof Error ? error : new Error("\u65E0\u6CD5\u5B89\u5168\u5173\u95ED\u5F53\u524D\u5DE5\u4F5C\u533A");
      notify(readListeners);
      return { ok: false, code: "document.close-failed", message: failure.message };
    } finally {
      if (!disposed && token === epoch && !dispatched) {
        busy = false;
        notify(stateListeners);
      }
    }
  }
  function ensureCloseListener() {
    if (unlistenClose) return Promise.resolve();
    if (closeRegistration) return closeRegistration;
    closeRegistration = Promise.resolve().then(() => {
      if (disposed) return;
      if (!client.onNativeCloseRequestedGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u5173\u95ED\u76D1\u542C");
      return client.onNativeCloseRequestedGuarded(async () => {
        await closeNativeWindow();
      });
    }).then((dispose) => {
      if (disposed) dispose?.();
      else unlistenClose = dispose;
    }).finally(() => {
      closeRegistration = null;
    });
    return closeRegistration;
  }
  if (nativeClose) {
    void ensureCloseListener().catch((error) => {
      if (disposed) return;
      failure = error instanceof Error ? error : new Error("\u65E0\u6CD5\u76D1\u542C\u7A97\u53E3\u5173\u95ED");
      notify(readListeners);
      notify(stateListeners);
    });
  }
  return Object.freeze({
    read: ensureLoaded,
    subscribe: (listener) => subscribe(readListeners, listener),
    snapshot,
    subscribeState: (listener) => subscribe(stateListeners, listener),
    canReplace: () => !disposed && !busy && !failure && current !== void 0 && !dirty(),
    canReload: () => !disposed && !busy,
    canUndo: () => !editGuard("either") && Boolean(current?.undoDepth),
    canRedo: () => !editGuard("either") && Boolean(current?.redoDepth),
    canSave: () => !disposed && !busy && !failure && Boolean(current) && dirty() && client.usesNativeFiles() && typeof client.saveNativeDocumentGuarded === "function",
    canSaveAs: () => !disposed && !busy && !failure && Boolean(current) && client.usesNativeFiles() && typeof client.saveNativeDocumentGuarded === "function",
    undo: () => history("undo"),
    redo: () => history("redo"),
    closeNativeWindow,
    async save(saveAs = false) {
      if (typeof saveAs !== "boolean") return { ok: false, code: "document.invalid-input", message: "\u4FDD\u5B58\u53C2\u6570\u65E0\u6548" };
      if (disposed) return { ok: false, code: "document.disposed", message: "\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E" };
      if (busy) return { ok: false, code: "document.busy", message: "\u4F5C\u54C1\u64CD\u4F5C\u5C1A\u672A\u5B8C\u6210" };
      if (failure || !current) return { ok: false, code: "document.not-ready", message: "\u8BF7\u5148\u91CD\u65B0\u8BFB\u53D6\u4F5C\u54C1" };
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "\u8BF7\u5728\u684C\u9762\u5E94\u7528\u4E2D\u4FDD\u5B58\u4F5C\u54C1" };
      if (!client.saveNativeDocumentGuarded) return { ok: false, code: "document.save-unavailable", message: "\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u4FDD\u5B58" };
      const saving = current;
      const expected = { kind: "document", documentId: saving.documentId, documentVersion: saving.documentVersion };
      const name = fileStem(checkpoint?.name ?? current.title);
      let saved = null;
      return run(async () => {
        saved = await client.saveNativeDocumentGuarded(name, saveAs, expected);
        if (saved === null) return null;
        if (!isScoreSessionRead(saved.session) || saved.session.documentId !== expected.documentId || saved.session.documentVersion !== expected.documentVersion || saved.savedVersion !== expected.documentVersion || typeof saved.name !== "string" || !saved.name) throw new Error("\u4FDD\u5B58\u7ED3\u679C\u4E0D\u5339\u914D\u5F53\u524D\u4F5C\u54C1\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
        if (saving.persistence && (!reconcileSavedSession(saving, current ?? null, saved.session) || saved.session.persistence?.savedVersion !== saved.savedVersion || saved.session.persistence.dirty)) {
          throw new Error("\u4FDD\u5B58\u7ED3\u679C\u4E0D\u5339\u914D\u5F53\u524D\u4F1A\u8BDD\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6");
        }
        return saved.session;
      }, true, () => {
        warnings = Object.freeze([...saved.session.warnings ?? [], ...saved.warnings ?? []]);
        return { documentId: saved.session.documentId, documentVersion: saved.savedVersion, name: saved.name };
      });
    },
    async append(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "append") return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u97F3\u7B26\u6216\u4F11\u6B62\u8F93\u5165" };
      if (input.documentId !== current.documentId || input.expectedVersion !== current.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      return applyEdit(input);
    },
    async setDocumentMetadata(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-document-metadata" || Object.keys(input).some((key) => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u4F5C\u54C1\u4FE1\u606F\u4FEE\u6539" };
      }
      const value = current;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6" };
      }
      if (!value.metadata) return { ok: false, code: "document.metadata-unavailable", message: "\u5BBF\u4E3B\u672A\u63D0\u4F9B\u5B8C\u6574\u4F5C\u54C1\u4FE1\u606F\uFF0C\u8BF7\u66F4\u65B0\u5BBF\u4E3B" };
      if (documentMetadataKey(input.action.metadata) === documentMetadataKey(value.metadata)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async setFrettedPosition(input) {
      const guard = editGuard("tablature");
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-fretted-position" || Object.keys(input).some((key) => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u5F26\u54C1\u4FEE\u6539" };
      }
      const value = current, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      const tab = value.tablature;
      if (tab?.kind !== "tablature") return { ok: false, code: "document.tablature-unavailable", message: "\u5F53\u524D\u5BBF\u4E3B\u6216\u4F5C\u54C1\u5C1A\u4E0D\u80FD\u7F16\u8F91Tab" };
      if (action.partId !== tab.partId) return { ok: false, code: "document.part-stale", message: "\u76EE\u6807\u58F0\u90E8\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      if (!isFrettedPosition(action.position, tab)) return { ok: false, code: "document.invalid-input", message: "\u5F26\u54C1\u8D85\u51FA\u5F53\u524D\u4E50\u5668\u8303\u56F4" };
      const event = tab.measures.flatMap((measure) => measure.events).find((event2) => event2.id === action.eventId);
      if (!event || event.content.kind !== "note") return { ok: false, code: "document.selection-stale", message: "\u8BF7\u91CD\u65B0\u9009\u62E9\u5355\u4E2A\u97F3\u7B26" };
      if (event.content.position.stringNumber === action.position.stringNumber && event.content.position.fret === action.position.fret) {
        return { ok: true, changed: false, session: value };
      }
      return applyEdit(input);
    },
    async setStaffClef(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-staff-clef" || Object.keys(input).some((key) => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u8C31\u53F7\u4FEE\u6539" };
      }
      const value = current, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      if (value.notation.kind !== "staff" || action.staffId !== value.notation.staffId) {
        return { ok: false, code: "document.staff-stale", message: "\u76EE\u6807\u8C31\u8868\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      if (action.clef === value.notation.clef) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async setKeySignature(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-key-signature" || Object.keys(input).some((key) => !["requestId", "documentId", "expectedVersion", "action"].includes(key))) {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u8C03\u53F7\u4FEE\u6539" };
      }
      const value = current, action = input.action;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      if (value.notation.kind !== "staff" || action.partId !== value.notation.partId || !value.notation.measures.some((measure) => measure.id === action.measureId)) {
        return { ok: false, code: "document.key-signature-stale", message: "\u76EE\u6807\u58F0\u90E8\u6216\u5C0F\u8282\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      if (keySignatureChangeIsNoOp(value.notation, action.measureId, action.change)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async editMeasure(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || !["insert-measure", "remove-measure", "set-measure-meter"].includes(input.action.kind)) {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u5C0F\u8282\u7ED3\u6784\u548C\u62CD\u53F7\u4FEE\u6539" };
      }
      const value = current;
      if (input.documentId !== value.documentId || input.expectedVersion !== value.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      const action = input.action;
      if (value.notation.kind !== "staff" || !("measureId" in action)) return { ok: false, code: "document.invalid-input", message: "\u5C0F\u8282\u8BF7\u6C42\u65E0\u6548" };
      const measure = value.notation.measures.find((item) => item.id === action.measureId);
      if (!measure) return { ok: false, code: "document.measure-stale", message: "\u76EE\u6807\u5C0F\u8282\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      if (action.kind === "remove-measure" && value.notation.measures.length <= 1) {
        return { ok: false, code: "document.measure-required", message: "\u4E50\u8C31\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u5C0F\u8282" };
      }
      if (action.kind === "set-measure-meter") {
        if (equalMeter(measure.meter, action.meter)) return { ok: true, changed: false, session: value };
        if (measureMeterTargets(value.notation.measures, action.measureId, action.scope).length > 100) {
          return { ok: false, code: "document.measure-budget", message: "\u5355\u6B21\u62CD\u53F7\u4E8B\u52A1\u6700\u591A\u4FEE\u6539 100 \u4E2A\u5C0F\u8282\uFF0C\u8BF7\u7F29\u5C0F\u8303\u56F4" };
        }
      }
      return applyEdit(input);
    },
    async deleteEvent(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "delete-event") {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u5220\u9664\u5355\u4E2A\u4E8B\u4EF6" };
      }
      if (input.documentId !== current.documentId || input.expectedVersion !== current.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      return applyEdit(input);
    },
    async deleteRange(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "delete-range") {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u8303\u56F4\u5220\u9664" };
      }
      if (input.documentId !== current.documentId || input.expectedVersion !== current.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      return applyEdit(input);
    },
    async pasteFragment(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "paste-fragment") {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u97F3\u4E50\u7247\u6BB5\u7C98\u8D34" };
      }
      if (input.documentId !== current.documentId || input.expectedVersion !== current.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D" };
      }
      return applyEdit(input);
    },
    async setEventProperties(input) {
      const guard = editGuard();
      if (guard) return guard;
      if (!isScoreEditRequest(input) || input.action.kind !== "set-event-properties") {
        return { ok: false, code: "document.invalid-input", message: "\u672C\u5165\u53E3\u53EA\u63A5\u53D7\u5355\u4E2A\u4E8B\u4EF6\u5C5E\u6027" };
      }
      if (input.documentId !== current.documentId || input.expectedVersion !== current.documentVersion) {
        return { ok: false, code: "document.edit-stale", message: "\u4F5C\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      const value = current, action = input.action;
      const event = value.notation.kind === "staff" ? value.notation.measures.flatMap((measure) => measure.events).find((event2) => event2.id === action.eventId) : void 0;
      if (!event) return { ok: false, code: "document.selection-stale", message: "\u9009\u4E2D\u4E8B\u4EF6\u5DF2\u4E0D\u5B58\u5728" };
      if (event.content.kind !== action.properties.content.kind) {
        return { ok: false, code: "document.invalid-input", message: "\u5C5E\u6027\u7F16\u8F91\u4E0D\u80FD\u5207\u6362\u97F3\u7B26\u548C\u4F11\u6B62\u7B26\u7C7B\u578B" };
      }
      if (equalEventProperties(event, action.properties)) return { ok: true, changed: false, session: value };
      return applyEdit(input);
    },
    async newScore(input = { title: "", measureCount: 1 }) {
      const guard = replacementGuard();
      if (guard) return guard;
      if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "document.invalid-input", message: "\u65B0\u5EFA\u4F5C\u54C1\u53C2\u6570\u65E0\u6548" };
      const value = input;
      if (Object.keys(value).some((key) => !["title", "measureCount"].includes(key)) || typeof value.title !== "string" || typeof value.measureCount !== "number") {
        return { ok: false, code: "document.invalid-input", message: "\u65B0\u5EFA\u4F5C\u54C1\u53C2\u6570\u65E0\u6548" };
      }
      const accepted = { title: value.title, measureCount: value.measureCount };
      if (Object.keys(validateNewScoreInput(accepted)).length) return { ok: false, code: "document.invalid-input", message: "\u65B0\u5EFA\u4F5C\u54C1\u53C2\u6570\u8D85\u51FA\u652F\u6301\u8303\u56F4" };
      const expected = replacementPrecondition();
      return run(
        () => client.createGuarded(accepted, createId(), expected),
        false,
        () => null,
        true
      );
    },
    async open() {
      const guard = replacementGuard();
      if (guard) return guard;
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "\u8BF7\u5728\u684C\u9762\u5E94\u7528\u4E2D\u6253\u5F00\u4F5C\u54C1" };
      const expected = replacementPrecondition();
      return runFileOpen(() => client.openNativeDocumentGuarded(expected), true);
    },
    async openRecent(recordId) {
      const guard = replacementGuard();
      if (guard) return guard;
      if (!isRecentRecordId(recordId)) return { ok: false, code: "document.invalid-input", message: "\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55ID\u65E0\u6548" };
      if (!client.usesNativeFiles()) return { ok: false, code: "document.native-required", message: "\u8BF7\u5728\u684C\u9762\u5E94\u7528\u4E2D\u6253\u5F00\u4F5C\u54C1" };
      const expected = replacementPrecondition();
      return runFileOpen(async () => {
        if (!client.openRecentDocumentGuarded) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D7\u4FDD\u62A4\u6253\u5F00\u6700\u8FD1\u6587\u4EF6");
        return client.openRecentDocumentGuarded(recordId, expected);
      }, false);
    },
    recent: Object.freeze({
      list: () => recentRequest(() => {
        if (!client.listRecentDocuments) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u6700\u8FD1\u6587\u4EF6\u76EE\u5F55");
        return client.listRecentDocuments();
      }),
      remove: (recordId) => recentRequest(() => {
        if (!isRecentRecordId(recordId)) throw new Error("\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55ID\u65E0\u6548");
        if (!client.removeRecentDocument) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u79FB\u9664\u6700\u8FD1\u6587\u4EF6\u8BB0\u5F55");
        return client.removeRecentDocument(recordId);
      }),
      async retryRegistration() {
        if (disposed || busy || failure || !current) throw new Error("\u5F53\u524D\u4F5C\u54C1\u5C1A\u4E0D\u53EF\u767B\u8BB0");
        if (!client.recordCurrentFile) throw new Error("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u767B\u8BB0\u6700\u8FD1\u6587\u4EF6");
        const expected = replacementPrecondition(), token = ++epoch;
        busy = true;
        notify(stateListeners);
        try {
          if (disposed || token !== epoch) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
          const result = await client.recordCurrentFile(expected);
          if (disposed || token !== epoch) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
          warnings = Object.freeze(warnings.filter((warning) => warning.code !== "file.recent-unavailable"));
          return result;
        } finally {
          if (!disposed && token === epoch) {
            busy = false;
            notify(stateListeners);
          }
        }
      }
    }),
    reload: () => run(async () => {
      if (nativeClose) await ensureCloseListener();
      if (disposed) throw new Error("\u4F5C\u54C1\u4F1A\u8BDD\u5DF2\u91CA\u653E");
      return current === void 0 ? loadInitial() : client.read();
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      busy = false;
      unlistenClose?.();
      unlistenClose = void 0;
      readListeners.clear();
      stateListeners.clear();
      current = void 0;
      failure = null;
      checkpoint = null;
      warnings = Object.freeze([]);
    }
  });
}

// ../../apps/workbench/src/services/desktop-readonly-score-session.ts
function createDesktopReadonlyScoreSession({ initialization = "ensure-document" } = {}) {
  return createReadonlyScoreDocumentSession({
    client: new WorkbenchClient(new TauriWorkbenchHostBridge()),
    initialization,
    nativeClose: true
  });
}

// ../../apps/workbench/src/services/desktop-startup-window.ts
var defaults = { welcome: { width: 1040, height: 700 }, workspace: { width: 1440, height: 900 } };
var minimums = { welcome: { width: 760, height: 520 }, workspace: { width: 960, height: 640 } };
var decorationHeightReserve = 40;
function createDesktopStartupWindow({ window: port = getCurrentWindow(), monitor = currentMonitor } = {}) {
  let active = true, busy = false, mode = "welcome";
  const saved = {};
  const current = () => {
    if (!active) throw new Error("\u542F\u52A8\u7A97\u53E3\u9002\u914D\u5DF2\u91CA\u653E");
  };
  async function read() {
    const size = await port.innerSize();
    current();
    const scale = await port.scaleFactor();
    current();
    const maximized = await port.isMaximized();
    current();
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("\u7A97\u53E3\u7F29\u653E\u56E0\u5B50\u65E0\u6548");
    const logical = size.toLogical(scale);
    return { width: logical.width, height: logical.height, maximized };
  }
  async function apply(next, geometry) {
    const display = await monitor();
    current();
    const work = display?.workArea.size.toLogical(display.scaleFactor);
    const width = Math.min(geometry.width, work?.width ?? geometry.width);
    const height = Math.min(geometry.height, work ? Math.max(1, work.height - decorationHeightReserve) : geometry.height);
    await port.unmaximize();
    current();
    await port.setMinSize(new LogicalSize(Math.min(minimums[next].width, width), Math.min(minimums[next].height, height)));
    current();
    await port.setSize(new LogicalSize(width, height));
    current();
    if (geometry.maximized) {
      await port.maximize();
      current();
    }
  }
  return Object.freeze({
    async present(next) {
      current();
      if (next !== "welcome" && next !== "workspace") throw new Error("\u672A\u77E5\u542F\u52A8\u7A97\u53E3\u6A21\u5F0F");
      if (busy) throw new Error("\u7A97\u53E3\u5207\u6362\u5C1A\u672A\u5B8C\u6210");
      if (next === mode) return;
      busy = true;
      const previousMode = mode;
      let previous = null;
      try {
        previous = await read();
        current();
        saved[mode] = previous.maximized ? { ...saved[mode] ?? defaults[mode], maximized: true } : previous;
        await apply(next, saved[next] ?? { ...defaults[next], maximized: false });
        current();
        mode = next;
      } catch (error) {
        if (active && previous) {
          try {
            await apply(previousMode, saved[previousMode] ?? previous);
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "\u7A97\u53E3\u8C03\u6574\u548C\u6062\u590D\u5747\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u542F\u52A8\u5E94\u7528");
          }
        }
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose() {
      active = false;
    }
  });
}
export {
  TauriPluginSettingsStorage,
  createDesktopReadonlyScoreSession,
  createDesktopStartupWindow,
  createReadonlyScoreDocumentSession,
  isTauri
};
