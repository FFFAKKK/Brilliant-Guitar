// Generated visual preview. Edit src/startup-center-preview.js and tools/startup-center-page.html.
"use strict";
(() => {
  // src/runtime/runtime-support.js
  var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  function captureConfig(value, path = "config", ancestors = /* @__PURE__ */ new Set()) {
    if (value == null || ["string", "boolean", "number", "function"].includes(typeof value)) return value;
    if (typeof value !== "object" || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error(`${path}: \u914D\u7F6E\u53EA\u80FD\u5305\u542B\u666E\u901A\u5BF9\u8C61\u3001\u6570\u7EC4\u3001\u503C\u548C\u51FD\u6570\u94A9\u5B50`);
    }
    if (ancestors.has(value)) throw new Error(`${path}: \u914D\u7F6E\u5B58\u5728\u5FAA\u73AF\u5F15\u7528`);
    ancestors.add(value);
    try {
      const result = Array.isArray(value) ? Array.from(value, (item, index) => captureConfig(item, `${path}[${index}]`, ancestors)) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, captureConfig(item, `${path}.${key}`, ancestors)]));
      return Object.freeze(result);
    } finally {
      ancestors.delete(value);
    }
  }
  function notifyObservers(listeners, onObserverError) {
    const failed = (error) => {
      try {
        const result = onObserverError?.(error);
        if (result !== void 0) Promise.resolve(result).catch(() => {
        });
      } catch {
      }
    };
    for (const listener of [...listeners]) {
      try {
        const result = listener();
        if (result !== void 0) Promise.resolve(result).catch(failed);
      } catch (error) {
        failed(error);
      }
    }
  }

  // src/startup/plugin-startup-plan.js
  var ID = /^[a-z][\w-]*(\.[a-z][\w-]*)*$/;
  var own = (object, key) => Object.hasOwn(object, key);
  var assert = (condition, message2) => {
    if (!condition) throw new Error(message2);
  };
  function keys(value, allowed, label) {
    assert(isRecord(value), `${label} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    for (const key of Object.keys(value)) assert(allowed.includes(key), `${label} \u542B\u672A\u77E5\u5B57\u6BB5 ${key}`);
  }
  function validateSetting(field, value) {
    if (field.type === "number") {
      assert(
        typeof value === "number" && Number.isSafeInteger(value) && value >= field.min && value <= field.max,
        `${field.label}\uFF1A\u8BF7\u8F93\u5165 ${field.min}\u2013${field.max} \u7684\u6574\u6570`
      );
    } else {
      assert(field.options.some((option) => option[0] === value), `${field.label}\uFF1A\u8BF7\u9009\u62E9\u6709\u6548\u9009\u9879`);
    }
    return value;
  }
  function definePluginDirectory(raw) {
    assert(Array.isArray(raw) && raw.length > 0, "\u63D2\u4EF6\u76EE\u5F55\u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4");
    const entries = raw.map((item) => {
      keys(item, ["id", "name", "icon", "summary", "builtin", "required", "reason", "enabled", "source", "contributions", "dependencies", "fields"], "\u63D2\u4EF6\u76EE\u5F55\u9879");
      for (const key of ["id", "name", "icon", "summary", "source"]) assert(typeof item[key] === "string" && item[key].trim(), `\u76EE\u5F55 ${key} \u9700\u8981\u975E\u7A7A\u5B57\u7B26\u4E32`);
      assert(ID.test(item.id), "\u76EE\u5F55\u63D2\u4EF6 id \u65E0\u6548");
      for (const key of ["builtin", "required", "enabled"]) assert(typeof item[key] === "boolean", `${item.id}.${key} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
      assert(!item.required || item.enabled && typeof item.reason === "string" && item.reason.trim(), `${item.id} \u5FC5\u9700\u7B56\u7565\u9700\u8981\u542F\u7528\u9ED8\u8BA4\u503C\u4E0E\u539F\u56E0`);
      assert(Array.isArray(item.dependencies) && item.dependencies.every((id) => typeof id === "string" && ID.test(id)), `${item.id} \u4F9D\u8D56\u5FC5\u987B\u662F\u63D2\u4EF6 id \u6570\u7EC4`);
      assert(new Set(item.dependencies).size === item.dependencies.length, `${item.id} \u4F9D\u8D56\u4E0D\u80FD\u91CD\u590D`);
      assert(Array.isArray(item.contributions), `${item.id} \u8D21\u732E\u5FC5\u987B\u662F\u6570\u7EC4`);
      for (const contribution of item.contributions) {
        keys(contribution, ["icon", "label"], "\u8D21\u732E");
        assert([contribution.icon, contribution.label].every((value) => typeof value === "string" && value.trim()), "\u8D21\u732E\u9700\u8981\u56FE\u6807\u4E0E\u540D\u79F0");
      }
      assert(Array.isArray(item.fields), `${item.id} \u53C2\u6570\u5B9A\u4E49\u5FC5\u987B\u662F\u6570\u7EC4`);
      assert(new Set(item.fields.map((field) => field.key)).size === item.fields.length, `${item.id} \u53C2\u6570\u4E0D\u80FD\u91CD\u590D`);
      for (const field of item.fields) {
        keys(field, ["key", "label", "type", "initial", "min", "max", "options"], "\u53C2\u6570\u5B9A\u4E49");
        assert(typeof field.key === "string" && ID.test(field.key) && typeof field.label === "string" && field.label.trim(), "\u53C2\u6570\u9700\u8981\u6709\u6548 key \u548C\u540D\u79F0");
        assert(["number", "select"].includes(field.type), "\u4E0D\u652F\u6301\u7684\u53C2\u6570\u7C7B\u578B");
        if (field.type === "number") assert(Number.isSafeInteger(field.min) && Number.isSafeInteger(field.max) && field.min <= field.max, "\u53C2\u6570\u8303\u56F4\u65E0\u6548");
        else assert(Array.isArray(field.options) && field.options.length > 0 && field.options.every((option) => Array.isArray(option) && option.length === 2 && option.every((value) => typeof value === "string" && value.trim())) && new Set(field.options.map((option) => option[0])).size === field.options.length, "\u53C2\u6570\u9009\u9879\u65E0\u6548");
        validateSetting(field, field.initial);
      }
      return item;
    });
    const byId = new Map(entries.map((item) => [item.id, item]));
    assert(byId.size === entries.length, "\u63D2\u4EF6\u76EE\u5F55 id \u4E0D\u80FD\u91CD\u590D");
    const visited = /* @__PURE__ */ new Set(), visiting = /* @__PURE__ */ new Set();
    function visit(id) {
      assert(byId.has(id), `\u76EE\u5F55\u4F9D\u8D56\u7F3A\u5931\uFF1A${id}`);
      assert(!visiting.has(id), `\u76EE\u5F55\u4F9D\u8D56\u5FAA\u73AF\uFF1A${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      byId.get(id).dependencies.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }
    entries.forEach((item) => visit(item.id));
    const directory = captureConfig(entries);
    function dataOnly(value) {
      assert(typeof value !== "function" && typeof value !== "undefined", "\u76EE\u5F55\u6295\u5F71\u53EA\u80FD\u5305\u542B\u6570\u636E");
      if (value && typeof value === "object") Object.values(value).forEach(dataOnly);
    }
    dataOnly(directory);
    validateStartupPlan(directory, { format: 1, revision: 0, plugins: {} });
    return directory;
  }
  function validatePluginSettings(item, raw) {
    assert(isRecord(raw), `${item.id}.settings \u5FC5\u987B\u662F\u5BF9\u8C61`);
    for (const key of Object.keys(raw)) assert(item.fields.some((field) => field.key === key), `${item.id} \u542B\u672A\u77E5\u53C2\u6570 ${key}`);
    return captureConfig(Object.fromEntries(item.fields.map((field) => [
      field.key,
      validateSetting(field, own(raw, field.key) ? raw[field.key] : field.initial)
    ])));
  }
  function validateStartupPlan(directory, raw) {
    keys(raw, ["format", "revision", "plugins"], "\u542F\u52A8\u8BA1\u5212");
    assert(raw.format === 1, "\u4E0D\u652F\u6301\u7684\u542F\u52A8\u8BA1\u5212\u683C\u5F0F");
    assert(Number.isSafeInteger(raw.revision) && raw.revision >= 0, "\u542F\u52A8\u8BA1\u5212 revision \u65E0\u6548");
    assert(isRecord(raw.plugins), "\u542F\u52A8\u8BA1\u5212 plugins \u5FC5\u987B\u662F\u5BF9\u8C61");
    const known = new Set(directory.map((item) => item.id));
    for (const id of Object.keys(raw.plugins)) assert(known.has(id), `\u542F\u52A8\u8BA1\u5212\u542B\u672A\u77E5\u63D2\u4EF6 ${id}`);
    const plugins = Object.fromEntries(directory.map((item) => {
      const entry = own(raw.plugins, item.id) ? raw.plugins[item.id] : { enabled: item.enabled, settings: {} };
      keys(entry, ["enabled", "settings"], item.id);
      assert(typeof entry.enabled === "boolean", `${item.id}.enabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
      assert(!item.required || entry.enabled, `${item.name} \u4E3A\u5FC5\u9700\u63D2\u4EF6\uFF0C\u4E0D\u80FD\u505C\u7528`);
      const settings = validatePluginSettings(item, entry.settings);
      return [item.id, { enabled: entry.enabled, settings }];
    }));
    for (const item of directory) if (plugins[item.id].enabled) {
      for (const id of item.dependencies) assert(plugins[id].enabled, `${item.name} \u9700\u8981\u542F\u7528 ${directory.find((entry) => entry.id === id).name}`);
    }
    return captureConfig({ format: 1, revision: raw.revision, plugins });
  }
  var defaultStartupPlan = (directory) => validateStartupPlan(directory, { format: 1, revision: 0, plugins: {} });
  function readStartupPlan(directory, store) {
    if (!store || typeof store.read !== "function") throw new TypeError("\u542F\u52A8\u914D\u7F6E\u9700\u8981 read() \u5B58\u50A8\u7AEF\u53E3");
    const raw = store.read();
    if (raw && typeof raw.then === "function") {
      void Promise.resolve(raw).catch(() => void 0);
      throw new Error("\u540C\u6B65 read() \u4E0D\u80FD\u8FD4\u56DE Promise\uFF1B\u8BF7\u4F7F\u7528 async \u6A21\u5F0F");
    }
    return raw === null ? defaultStartupPlan(directory) : validateStartupPlan(directory, raw);
  }
  async function readStartupPlanAsync(directory, store) {
    if (!store || typeof store.read !== "function") throw new TypeError("\u542F\u52A8\u914D\u7F6E\u9700\u8981 read() \u5B58\u50A8\u7AEF\u53E3");
    const raw = await store.read();
    return raw === null ? defaultStartupPlan(directory) : validateStartupPlan(directory, raw);
  }

  // src/host/backup-plugin-directory.js
  var BACKUP_PLUGIN_DIRECTORY = definePluginDirectory([
    {
      id: "frame.builtin",
      name: "\u5DE5\u4F5C\u533A\u57FA\u7840",
      icon: "library",
      summary: "\u57FA\u7840\u9875\u9762\u4E0E\u5BBF\u4E3B\u754C\u9762",
      builtin: true,
      required: true,
      reason: "\u56DB\u680F\u5DE5\u4F5C\u533A\u9700\u8981\u57FA\u7840\u9875\u9762",
      enabled: true,
      source: "\u5907\u4EFD\u6846\u67B6",
      contributions: [{ icon: "page", label: "\u57FA\u7840\u9875\u9762" }],
      dependencies: [],
      fields: []
    },
    {
      id: "frame.layout",
      name: "\u5DE5\u4F5C\u533A\u5E03\u5C40",
      icon: "layout",
      summary: "\u56DB\u680F\u4E0E\u5E03\u5C40\u8BBE\u7F6E",
      builtin: true,
      required: true,
      reason: "\u56DB\u680F\u5DE5\u4F5C\u533A\u9700\u8981\u5E03\u5C40\u7BA1\u7406",
      enabled: true,
      source: "\u5907\u4EFD\u6846\u67B6",
      contributions: [{ icon: "layout", label: "\u5E03\u5C40\u8BBE\u7F6E" }],
      dependencies: ["frame.builtin"],
      fields: []
    },
    {
      id: "notation.core",
      name: "\u6838\u5FC3\u8C31\u9762",
      icon: "note",
      summary: "\u4E2D\u592E\u4E94\u7EBF\u8C31\u89C6\u56FE",
      builtin: true,
      required: true,
      reason: "\u5DE5\u4F5C\u533A\u9700\u8981\u552F\u4E00\u4E2D\u592E\u8C31\u9762\u89C6\u56FE",
      enabled: true,
      source: "\u5171\u4EAB\u8BB0\u8C31\u4E0E\u5907\u4EFD\u6838\u5FC3\u8C31\u9762",
      contributions: [{ icon: "page", label: "\u4E94\u7EBF\u8C31\u89C6\u56FE" }],
      dependencies: [],
      fields: []
    },
    {
      id: "frame.plugins",
      name: "\u63D2\u4EF6\u72B6\u6001",
      icon: "library",
      summary: "\u672C\u6B21\u4F1A\u8BDD\u7684\u767B\u8BB0\u4E0E\u8D21\u732E",
      builtin: true,
      required: false,
      enabled: true,
      source: "\u5907\u4EFD\u6846\u67B6",
      contributions: [{ icon: "library", label: "\u53EA\u8BFB\u72B6\u6001\u9875" }],
      dependencies: ["frame.builtin"],
      fields: []
    },
    {
      id: "frame.score-info",
      name: "\u8C31\u9762\u4FE1\u606F",
      icon: "page",
      summary: "\u6587\u6863\u6982\u89C8\u4E0E\u5C0F\u8282\u5217\u8868",
      builtin: true,
      required: false,
      enabled: false,
      source: "\u5907\u4EFD\u6846\u67B6 \xB7 \u63A5\u5165\u9A8C\u8BC1\u63D2\u4EF6",
      contributions: [{ icon: "left", label: "\u4FE1\u606F\u9762\u677F" }, { icon: "page", label: "\u53EA\u8BFB\u4FE1\u606F\u547D\u4EE4" }],
      dependencies: ["notation.core"],
      fields: [
        { key: "mode", label: "\u663E\u793A\u5185\u5BB9", type: "select", initial: "summary", options: [["summary", "\u6982\u89C8"], ["measures", "\u5C0F\u8282"]] },
        { key: "measureLimit", label: "\u5C0F\u8282\u6761\u6570", type: "number", initial: 8, min: 1, max: 32 }
      ]
    }
  ]);

  // src/startup/plugin-startup-controller.js
  var copy = (value) => JSON.parse(JSON.stringify(value));
  var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  var message = (error) => error instanceof Error ? error.message : String(error);
  function createPluginStartupController({ directory, store, storageMode = "sync" } = {}) {
    if (!store || typeof store.read !== "function" || typeof store.write !== "function") throw new TypeError("\u542F\u52A8\u7BA1\u7406\u9700\u8981 read/write \u5B58\u50A8\u7AEF\u53E3");
    if (!["sync", "async"].includes(storageMode)) throw new TypeError("storageMode \u5FC5\u987B\u662F sync \u6216 async");
    let baseline = defaultStartupPlan(directory), draft = copy(baseline), issue = "", loadIssue = "", saved = false;
    let phase = "ready", epoch = 0;
    const invalid = /* @__PURE__ */ new Map();
    const refusal = () => phase === "disposed" ? { ok: false, code: "startup.disposed", error: "\u542F\u52A8\u7BA1\u7406\u5DF2\u91CA\u653E" } : phase !== "ready" ? { ok: false, code: "startup.busy", error: "\u8BF7\u7B49\u5F85\u914D\u7F6E\u64CD\u4F5C\u5B8C\u6210" } : null;
    const current = (token) => phase !== "disposed" && token === epoch;
    const plugin = (id) => {
      const item = directory.find((entry) => entry.id === id);
      if (!item) throw new Error(`\u672A\u77E5\u63D2\u4EF6 ${id}`);
      return item;
    };
    function acceptLoad(next, token) {
      if (!current(token)) return refusal();
      baseline = next;
      draft = copy(next);
      invalid.clear();
      issue = loadIssue = "";
      saved = false;
      phase = "ready";
      return { ok: true };
    }
    function failLoad(error, token) {
      if (!current(token)) return refusal();
      loadIssue = message(error);
      issue = loadIssue;
      phase = "ready";
      return { ok: false, error: loadIssue };
    }
    function reload() {
      const denied = refusal();
      if (denied) return denied;
      phase = "loading";
      const token = ++epoch;
      if (storageMode === "async") return (async () => {
        try {
          return acceptLoad(await readStartupPlanAsync(directory, store), token);
        } catch (error) {
          return failLoad(error, token);
        }
      })();
      try {
        return acceptLoad(readStartupPlan(directory, store), token);
      } catch (error) {
        return failLoad(error, token);
      }
    }
    function planError() {
      try {
        validateStartupPlan(directory, draft);
        return "";
      } catch (error) {
        return message(error);
      }
    }
    function snapshot() {
      const dirtyIds = directory.filter((item) => !equal(draft.plugins[item.id], baseline.plugins[item.id]) || item.fields.some((field) => invalid.has(`${item.id}:${field.key}`))).map((item) => item.id);
      const validationError = planError(), idle = phase === "ready";
      return captureConfig({
        draft,
        baseline,
        dirtyIds,
        invalid: Object.fromEntries(invalid),
        issue: issue || validationError,
        phase,
        saved,
        canEdit: idle,
        canSave: idle && dirtyIds.length > 0 && !loadIssue && !invalid.size && !validationError,
        canStart: idle && !loadIssue && !dirtyIds.length && !validationError,
        canReload: idle && !!issue
      });
    }
    function prepareSave(actual) {
      if (!equal(actual, baseline)) throw new Error("\u914D\u7F6E\u5DF2\u5728\u5176\u4ED6\u9875\u9762\u6539\u53D8\uFF0C\u91CD\u65B0\u8BFB\u53D6\u5C06\u64A4\u9500\u5F53\u524D\u8349\u7A3F");
      return validateStartupPlan(directory, { ...draft, revision: baseline.revision + 1 });
    }
    function acceptSave(next, token) {
      if (!current(token)) return refusal();
      baseline = next;
      draft = copy(next);
      saved = true;
      issue = "";
      phase = "ready";
      return { ok: true, revision: next.revision };
    }
    function failSave(error, token) {
      if (!current(token)) return refusal();
      issue = `\u4FDD\u5B58\u5931\u8D25\uFF1A${message(error)}`;
      phase = "ready";
      return { ok: false, error: issue };
    }
    function save() {
      const denied = refusal();
      if (denied) return denied;
      if (!snapshot().canSave) return { ok: false, error: loadIssue || planError() || "\u8BF7\u5148\u4FEE\u6B63\u53C2\u6570" };
      phase = "saving";
      const token = ++epoch;
      const options = Object.freeze({ expectedRevision: baseline.revision });
      if (storageMode === "async") return (async () => {
        try {
          const actual = await readStartupPlanAsync(directory, store);
          if (!current(token)) return refusal();
          const next = prepareSave(actual);
          const result = await store.write(next, Object.freeze({ ...options, isCurrent: () => current(token) }));
          if (result !== void 0) throw new Error("\u542F\u52A8\u7BA1\u7406 write() \u5B8C\u6210\u540E\u9700\u8981\u8FD4\u56DE void");
          return acceptSave(next, token);
        } catch (error) {
          return failSave(error, token);
        }
      })();
      try {
        const next = prepareSave(readStartupPlan(directory, store));
        const result = store.write(next, options);
        if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => void 0);
        if (result !== void 0) throw new Error("\u540C\u6B65 write() \u9700\u8981\u8FD4\u56DE void\uFF1BPromise \u7AEF\u53E3\u8BF7\u4F7F\u7528 async \u6A21\u5F0F");
        return acceptSave(next, token);
      } catch (error) {
        return failSave(error, token);
      }
    }
    const ready = Promise.resolve(reload());
    return Object.freeze({
      directory,
      snapshot,
      reload,
      save,
      ready,
      dispose() {
        if (phase !== "disposed") {
          phase = "disposed";
          epoch++;
        }
      },
      setEnabled(id, enabled) {
        const denied = refusal();
        if (denied) return denied;
        const item = plugin(id);
        if (typeof enabled !== "boolean") throw new TypeError("enabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
        if (item.required && !enabled) return { ok: false, error: `${item.name} \u4E3A\u5FC5\u9700\u63D2\u4EF6\uFF0C\u4E0D\u80FD\u505C\u7528` };
        draft.plugins[id].enabled = enabled;
        issue = loadIssue;
        saved = false;
        return { ok: true };
      },
      setSetting(id, key, raw) {
        const denied = refusal();
        if (denied) return denied;
        const field = plugin(id).fields.find((item) => item.key === key);
        if (!field) throw new Error(`\u672A\u77E5\u53C2\u6570 ${id}.${key}`);
        const errorKey = `${id}:${key}`;
        try {
          if (field.type === "number" && (typeof raw !== "number" && (typeof raw !== "string" || !raw.trim()))) throw new Error(`${field.label}\uFF1A\u8BF7\u8F93\u5165\u6574\u6570`);
          const value = validateSetting(field, field.type === "number" ? Number(raw) : raw);
          draft.plugins[id].settings[key] = value;
          invalid.delete(errorKey);
          issue = loadIssue;
          saved = false;
          return { ok: true };
        } catch (error) {
          invalid.set(errorKey, { raw: String(raw), message: message(error) });
          issue = loadIssue;
          saved = false;
          return { ok: false, error: message(error) };
        }
      },
      discard() {
        const denied = refusal();
        if (denied) return denied;
        draft = copy(baseline);
        invalid.clear();
        issue = loadIssue;
        saved = false;
        return { ok: true };
      }
    });
  }

  // src/runtime/style-boundary.js
  var FRAME_UI_ATTRIBUTE = "data-frame-ui";

  // src/shell/icon-svg.js
  function renderIconSvg(content, size) {
    return `<svg ${FRAME_UI_ATTRIBUTE}="" class="icon" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
  }

  // src/shell/icons.js
  var paths = {
    library: '<rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2"/><path d="M13.75 11v5.5M11 13.75h5.5"/>',
    layout: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 7.5h14M7.5 7.5V16"/>',
    bell: '<path d="M6 13.5V9a4 4 0 0 1 8 0v4.5l1.2 1.5H4.8z"/><path d="M8.5 17h3"/>',
    close: '<path d="M6 6l8 8M14 6l-8 8"/>',
    minimize: '<path d="M5 10h10"/>',
    maximize: '<rect x="5" y="5" width="10" height="10" rx="1"/>',
    chevron: '<path d="M7 8.5l3 3 3-3"/>',
    more: '<circle cx="5.5" cy="10" r=".9"/><circle cx="10" cy="10" r=".9"/><circle cx="14.5" cy="10" r=".9"/>',
    collapseLeft: '<path d="M12 6l-4 4 4 4"/>',
    collapseRight: '<path d="M8 6l4 4-4 4"/>',
    collapseDown: '<path d="M6 8l4 4 4-4"/>',
    reset: '<path d="M4.5 10a5.5 5.5 0 1 0 1.7-4"/><path d="M4.5 4v3h3"/>'
  };
  function icon(name, size = 18) {
    return renderIconSvg(paths[name] ?? "", size);
  }

  // src/fixtures/preview-icons.js
  var paths2 = {
    measureBefore: '<path d="M8 4v12M17 4v12M8 7h9M8 10h9M8 13h9M2 10h4M4 8v4"/>',
    measureAfter: '<path d="M3 4v12M12 4v12M3 7h9M3 10h9M3 13h9M14 10h4M16 8v4"/>',
    measureRemove: '<path d="M3 4v12M17 4v12M3 7h14M3 13h14M7 10h6"/>',
    meterRun: '<path d="M3 5v10M9 5v10M15 5v10M3 7h12M3 12h12m1-6 3 4-3 4"/>',
    copy: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V3H3v10h4"/>',
    cut: '<circle cx="5" cy="14" r="2.5"/><circle cx="15" cy="14" r="2.5"/><path d="m6 12 8-9M14 12 6 3"/>',
    paste: '<rect x="4" y="5" width="12" height="12" rx="1.5"/><rect x="7" y="2" width="6" height="5" rx="1"/><path d="M7 11h6M7 14h4"/>',
    app: '<path d="M7 15V5h7v8"/><ellipse cx="5.5" cy="15" rx="2.5" ry="1.8"/><ellipse cx="12.5" cy="13" rx="2.5" ry="1.8"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    settings: '<path d="m8 3-.5 2-2 1-2-.5-1 3 1.5 1.5-.2 2-1.3 1.5 2 2.5 2-.7 1.7 1 1 2 3-.4.4-2 1.6-1.3 2 .2 1-3-1.4-1.5-.2-2 1.2-1.7-2-2.1-2 .5-1.5-1.2-.5-2z"/><circle cx="10" cy="10" r="2.5"/>',
    top: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 7h14"/>',
    left: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M7 3v14"/>',
    right: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M13 3v14"/>',
    bottom: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 13h14"/>',
    note: '<path d="M11 14V4l5-1v10"/><ellipse cx="8.5" cy="14" rx="2.5" ry="1.8"/><ellipse cx="13.5" cy="13" rx="2.5" ry="1.8"/>',
    grid: '<path d="M4 4h12v12H4zM4 8h12M4 12h12M8 4v12M12 4v12"/>',
    page: '<path d="M5 3h7l3 3v11H5zM12 3v4h3M8 10h4M8 13h4"/>',
    chat: '<path d="M3 4h14v10H8l-4 3v-3H3zM6 8h8M6 11h5"/>',
    tone: '<path d="M4 8v4M8 4v12M12 6v8M16 8v4"/>',
    check: '<path d="m4 10 4 4 8-8"/>',
    drag: '<path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" stroke-width="3"/>',
    half: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12"/>',
    full: '<rect x="3" y="4" width="14" height="12" rx="1"/>',
    up: '<path d="m6 12 4-4 4 4"/>',
    down: '<path d="m6 8 4 4 4-4"/>',
    play: '<path d="m7 4 9 6-9 6z"/>',
    pause: '<path d="M7 5v10M13 5v10"/>',
    stop: '<rect x="5" y="5" width="10" height="10"/>',
    metronome: '<path d="m7 3-3 14h12L12 3zM10 13l5-8M6 14h8"/>',
    timerReset: '<path d="M7 3h6M10 3v2M5 7a6 6 0 1 0 10 1M5 7V4M5 7h3"/><path d="M10 8v3l2 1"/>',
    undo: '<path d="M6 6H3v-3M3 6h9a5 5 0 0 1 0 10"/>',
    select: '<path d="m5 3 10 8-5 1-2 5z"/>',
    fit: '<path d="M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4"/><rect x="7" y="7" width="6" height="6"/>',
    alignLeft: '<path d="M4 3v14M7 6h9M7 10h6M7 14h9"/>',
    alignRight: '<path d="M16 3v14M4 6h9M7 10h6M4 14h9"/>',
    combine: '<rect x="3" y="3" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/><path d="M12 3h5v5M3 12v5h5"/>',
    balance: '<path d="M4 6h12M6 10h8M4 14h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="16" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="10" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/><circle cx="4" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor"/>',
    compress: '<path d="M4 7h12M4 13h12M7 4v6M13 10v6M7 10l-3-3M7 10l3-3M13 10l-3 3M13 10l3 3"/>',
    search: '<circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 5 5"/>',
    info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6h.01"/>',
    scrollZoom: '<path d="M6 4v12M4 6l2-2 2 2M4 14l2 2 2-2M14 7v6M12 9l2-2 2 2M12 11l2 2 2-2"/>',
    pencil: '<path d="m4 13 9-9 3 3-9 9-4 1zM11 6l3 3"/>'
  };
  function icon2(name, size = 16) {
    if (!paths2[name]) return icon(name, size);
    return renderIconSvg(paths2[name], size);
  }

  // src/startup/plugin-startup-view.js
  var mounted = /* @__PURE__ */ new WeakSet();
  function mountPluginStartupView({ root: root2, controller, selectedId = null, onStart = null, canResume = () => false, onStateChange = null }) {
    if (mounted.has(root2)) throw new Error("\u542F\u52A8\u7BA1\u7406\u9875\u5DF2\u6302\u8F7D");
    const document2 = root2.ownerDocument;
    let active = true, launching = false, operationIssue = "";
    const plugins = controller.directory;
    let selected = plugins.some((item) => item.id === selectedId) ? selectedId : plugins[0]?.id;
    let state, draft, invalid;
    function syncState() {
      state = controller.snapshot();
      draft = state.draft.plugins;
      invalid = new Map(Object.entries(state.invalid));
    }
    syncState();
    const rows = /* @__PURE__ */ new Map(), groups = [], cleanups = [], detailCleanups = [];
    const node = (id) => root2.querySelector("#" + id);
    const list = node("startup-list"), detail = node("startup-detail");
    const search = node("startup-search"), filter = node("startup-filter");
    const feedback = node("startup-feedback"), save = node("startup-apply"), discard = node("startup-discard");
    const retry = node("startup-retry"), start = node("startup-open");
    if (![list, detail, search, filter, feedback, save, discard].every(Boolean)) throw new Error("\u542F\u52A8\u7BA1\u7406\u9875\u7F3A\u5C11\u5FC5\u8981\u63A7\u4EF6");
    mounted.add(root2);
    function listen(target, event, callback, scope = cleanups) {
      target.addEventListener(event, callback);
      scope.push(() => target.removeEventListener(event, callback));
    }
    function el(tag, attrs = {}, ...children) {
      const node2 = document2.createElement(tag);
      node2.setAttribute("data-frame-ui", "");
      for (const [key, value] of Object.entries(attrs)) node2.setAttribute(key, value);
      node2.append(...children);
      return node2;
    }
    function icon3(name, size = 16) {
      const span = el("span", { class: "startup-icon", "aria-hidden": "true" });
      span.innerHTML = icon2(name, size);
      return span;
    }
    root2.querySelectorAll("[data-preview-icon]").forEach((node2) => node2.replaceWith(icon3(node2.dataset.previewIcon)));
    const empty = el("p", { class: "startup-empty", hidden: "" }, "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6");
    const changed = (plugin) => state.dirtyIds.includes(plugin.id);
    function updateFooter() {
      const count = plugins.filter(changed).length, dirty = count > 0;
      feedback.dataset.dirty = String(dirty);
      feedback.textContent = launching ? "\u6B63\u5728\u542F\u52A8\u2026" : state.phase === "loading" ? "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" : state.phase === "saving" ? "\u6B63\u5728\u4FDD\u5B58\u2026" : state.issue || operationIssue || (dirty ? count + " \u9879\u4FEE\u6539 \xB7 \u4E0B\u6B21\u542F\u52A8\u751F\u6548" : state.saved ? "\u5DF2\u4FDD\u5B58 \xB7 \u4E0B\u6B21\u542F\u52A8\u751F\u6548" : "\u542F\u505C\u5728\u4E0B\u6B21\u542F\u52A8\u751F\u6548");
      feedback.dataset.error = String(!!(state.issue || operationIssue));
      save.hidden = discard.hidden = !dirty;
      save.disabled = !state.canSave || launching;
      discard.disabled = !state.canEdit || launching;
      save.title = state.canSave ? "\u4FDD\u5B58\u4E0B\u6B21\u542F\u52A8\u914D\u7F6E" : "\u5148\u4FEE\u6B63\u53C2\u6570\u6216\u5B58\u50A8\u95EE\u9898";
      if (retry) {
        retry.hidden = !state.canReload && !operationIssue;
        retry.disabled = !state.canEdit || launching;
      }
      if (start) {
        start.hidden = !onStart;
        start.disabled = !state.canStart && !canResume() || launching;
      }
      if (onStateChange) notifyObservers([onStateChange]);
    }
    function updateList() {
      const query = search.value.trim().toLowerCase();
      for (const plugin of plugins) {
        const row = rows.get(plugin.id), on = draft[plugin.id].enabled;
        row.container.hidden = !(plugin.name.toLowerCase().includes(query) || plugin.id.includes(query) || plugin.summary.includes(query)) || filter.value === "enabled" && !on || filter.value === "disabled" && on;
        row.container.dataset.selected = String(plugin.id === selected);
        row.container.dataset.dirty = String(changed(plugin));
        row.select.setAttribute("aria-pressed", String(plugin.id === selected));
        if (row.toggle) {
          row.toggle.disabled = !state.canEdit || launching;
          row.toggle.setAttribute("aria-checked", String(on));
          row.toggle.setAttribute("aria-label", plugin.name + "\uFF1A\u4E0B\u6B21\u542F\u52A8" + (on ? "\u542F\u7528" : "\u505C\u7528"));
          row.toggle.title = on ? "\u4E0B\u6B21\u542F\u52A8\u505C\u7528" : "\u4E0B\u6B21\u542F\u52A8\u542F\u7528";
        }
      }
      for (const group of groups) {
        const count = group.ids.filter((id) => !rows.get(id).container.hidden).length;
        group.node.hidden = count === 0;
        group.count.textContent = String(count);
      }
      empty.hidden = [...rows.values()].some((row) => !row.container.hidden);
      if (!selected || rows.get(selected)?.container.hidden) {
        const first = plugins.find((plugin) => !rows.get(plugin.id).container.hidden);
        if (first) {
          selected = first.id;
          rows.get(selected).select.setAttribute("aria-pressed", "true");
          rows.get(selected).container.dataset.selected = "true";
        }
        renderDetail(first ?? null);
      } else if (detail.dataset.plugin !== selected) renderDetail();
    }
    function renderDetail(plugin = plugins.find((item) => item.id === selected)) {
      detailCleanups.splice(0).forEach((stop) => stop());
      detail.replaceChildren();
      detail.dataset.plugin = plugin?.id ?? "";
      if (!plugin) {
        detail.append(el("p", { class: "startup-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6"));
        return;
      }
      const heading = el(
        "div",
        { class: "startup-detail-heading" },
        el("span", { class: "startup-glyph" }, icon3(plugin.icon, 20)),
        el("h2", {}, plugin.name)
      );
      const facts = el(
        "div",
        { class: "startup-facts" },
        el("span", { class: "startup-fact" }, icon3(plugin.builtin ? "page" : "library"), plugin.builtin ? "\u5185\u7F6E" : "\u6269\u5C55")
      );
      if (plugin.required) facts.append(el("span", { class: "startup-fact", title: plugin.reason }, icon3("lock"), "\u5FC5\u9700"));
      detail.append(heading, el("p", { class: "startup-detail-summary" }, plugin.summary), facts);
      const contributions = el(
        "section",
        { class: "startup-section", "aria-label": "\u754C\u9762\u8D21\u732E" },
        el("h3", {}, "\u8D21\u732E"),
        el(
          "div",
          { class: "startup-contributions" },
          ...plugin.contributions.map((item) => el("span", { class: "startup-contribution" }, icon3(item.icon), item.label))
        )
      );
      detail.append(contributions);
      if (plugin.fields.length) {
        const settings = el("section", { class: "startup-section", "aria-label": plugin.name + "\u8BBE\u7F6E" }, el("h3", {}, "\u8BBE\u7F6E"));
        for (const field of plugin.fields) {
          const key = plugin.id + ":" + field.key, id = plugin.id + "-" + field.key;
          const input = field.type === "number" ? el("input", { id, type: "number", min: field.min, max: field.max, step: 1 }) : el("select", { id }, ...field.options.map(([value, label]) => el("option", { value }, label)));
          input.value = invalid.has(key) ? invalid.get(key).raw : String(draft[plugin.id].settings[field.key]);
          input.disabled = !state.canEdit || launching;
          input.setAttribute("aria-invalid", String(invalid.has(key)));
          const error = el(
            "p",
            { id: id + "-error", class: "startup-setting-error", role: "alert" },
            invalid.get(key)?.message ?? ""
          );
          error.hidden = !invalid.has(key);
          input.setAttribute("aria-describedby", id + "-error");
          listen(input, field.type === "number" ? "input" : "change", () => {
            operationIssue = "";
            const result = controller.setSetting(plugin.id, field.key, input.value);
            syncState();
            input.setAttribute("aria-invalid", String(!result.ok));
            error.hidden = result.ok;
            error.textContent = result.ok ? "" : result.error;
            rows.get(plugin.id).container.dataset.dirty = String(changed(plugin));
            updateFooter();
          }, detailCleanups);
          settings.append(el("div", { class: "startup-setting" }, el("label", { for: id }, field.label), input), error);
        }
        detail.append(settings);
      }
      const technical = el("details", { class: "startup-technical" }, el("summary", {}, "\u6280\u672F\u4FE1\u606F"));
      const info = el(
        "dl",
        {},
        el("dt", {}, "\u6807\u8BC6"),
        el("dd", {}, plugin.id),
        el("dt", {}, "\u914D\u7F6E\u4FEE\u8BA2"),
        el("dd", {}, String(state.baseline.revision)),
        el("dt", {}, "\u6765\u6E90"),
        el("dd", {}, plugin.source),
        el("dt", {}, "\u63A5\u53E3"),
        el("dd", {}, "\u5907\u4EFD\u5185\u90E8 UI v1")
      );
      if (plugin.dependencies.length) info.append(el("dt", {}, "\u4F9D\u8D56"), el("dd", {}, plugin.dependencies.map((id) => plugins.find((item) => item.id === id).name).join("\u3001")));
      if (plugin.reason) info.append(el("dt", {}, "\u5FC5\u9700\u539F\u56E0"), el("dd", {}, plugin.reason));
      technical.append(info);
      detail.append(technical);
    }
    for (const [builtin, label] of [[true, "\u5185\u7F6E"], [false, "\u6269\u5C55"]]) {
      const group = el("section", { class: "startup-group", "aria-label": label + "\u63D2\u4EF6" });
      const count = el("span", { class: "startup-group-count", "aria-hidden": "true" });
      group.append(el("h2", { class: "startup-group-label" }, label, count));
      const ids = [];
      for (const plugin of plugins.filter((item) => item.builtin === builtin)) {
        ids.push(plugin.id);
        const select = el(
          "button",
          { class: "startup-select", type: "button", "aria-label": "\u67E5\u770B" + plugin.name, "aria-pressed": "false" },
          el("span", { class: "startup-glyph" }, icon3(plugin.icon, 20)),
          el(
            "span",
            { class: "startup-plugin-text" },
            el("strong", { class: "startup-plugin-name" }, plugin.name),
            el("span", { class: "startup-plugin-summary" }, plugin.summary)
          )
        );
        const container = el("div", { class: "startup-row", "data-plugin-id": plugin.id }, select);
        let toggle = null;
        if (plugin.required) container.append(el("span", { class: "startup-required", role: "img", "aria-label": plugin.name + "\u5FC5\u9700\uFF0C\u4E0D\u80FD\u505C\u7528", title: plugin.reason }, icon3("lock")));
        else {
          toggle = el(
            "button",
            { class: "startup-toggle", type: "button", role: "switch", "aria-checked": "false" },
            el("span", { class: "startup-toggle-track", "aria-hidden": "true" })
          );
          listen(toggle, "click", () => {
            operationIssue = "";
            controller.setEnabled(plugin.id, !draft[plugin.id].enabled);
            syncState();
            updateList();
            updateFooter();
            if (container.hidden) search.focus();
          });
          container.append(toggle);
        }
        listen(select, "click", () => {
          selected = plugin.id;
          updateList();
          renderDetail();
        });
        rows.set(plugin.id, { container, select, toggle });
        group.append(container);
      }
      groups.push({ node: group, ids, count });
      list.append(group);
    }
    list.append(empty);
    listen(search, "input", updateList);
    listen(filter, "change", updateList);
    function updateControls() {
      for (const tag of ["input", "select"]) detail.querySelectorAll(tag).forEach((input) => {
        input.disabled = !state.canEdit || launching;
      });
    }
    function refresh({ detailChanged = true } = {}) {
      if (!active) return;
      syncState();
      updateList();
      if (detailChanged) renderDetail();
      updateFooter();
      updateControls();
    }
    function operation(run, { reload = false } = {}) {
      operationIssue = "";
      const result = run();
      refresh({ detailChanged: false });
      const completed = () => {
        if (!active) return;
        refresh({ detailChanged: reload || controller.snapshot().saved });
        if (state.saved) search.focus();
      };
      if (result && typeof result.then === "function") result.then(completed, (error) => {
        if (active) {
          operationIssue = error?.message ?? String(error);
          refresh({ detailChanged: false });
        }
      });
      else completed();
    }
    listen(discard, "click", () => {
      operation(controller.discard, { reload: true });
      search.focus();
    });
    listen(save, "click", () => {
      operation(controller.save);
    });
    if (retry) listen(retry, "click", () => {
      operation(controller.reload, { reload: true });
    });
    if (start && onStart) listen(start, "click", () => {
      if (!state.canStart && !canResume() || launching) return;
      operationIssue = "";
      launching = true;
      refresh({ detailChanged: false });
      const completed = (error) => {
        if (!active) return;
        launching = false;
        if (error) operationIssue = `\u5DE5\u4F5C\u533A\u542F\u52A8\u5931\u8D25\uFF1A${error?.message ?? error}`;
        refresh({ detailChanged: false });
      };
      try {
        const result = onStart();
        if (result && typeof result.then === "function") result.then(() => completed(), completed);
        else completed();
      } catch (error) {
        completed(error);
      }
    });
    updateList();
    renderDetail();
    updateFooter();
    if (state.phase === "loading") controller.ready.then(() => refresh());
    return Object.freeze({
      refresh,
      notifyError(text) {
        if (active) {
          operationIssue = text;
          updateFooter();
        }
      },
      dispose() {
        if (!active) return;
        active = false;
        detailCleanups.splice(0).forEach((stop) => stop());
        cleanups.splice(0).forEach((stop) => stop());
        list.replaceChildren();
        detail.replaceChildren();
        mounted.delete(root2);
      }
    });
  }

  // src/startup/startup-center-view.js
  var mounted2 = /* @__PURE__ */ new WeakSet();
  function mountStartupCenterView({ root: root2, application, appearance = null, visualOnly = false }) {
    if (mounted2.has(root2)) throw new Error("\u542F\u52A8\u4E2D\u5FC3\u5DF2\u6302\u8F7D");
    const document2 = root2.ownerDocument, node = (id) => root2.querySelector("#" + id);
    const tabs = [...root2.querySelectorAll("[data-launch-page]")];
    const pages = new Map(["recent", "plugins", "settings"].map((id) => [id, node("launch-" + id)]));
    const list = node("launch-file-list"), search = node("launch-search"), empty = node("launch-empty");
    const preview = node("launch-score-card"), title = node("launch-preview-title"), meta = node("launch-preview-meta");
    const openSelected = node("launch-open-selected"), status = node("launch-status");
    const density = node("launch-density"), fontSize = node("launch-font-size");
    const appearanceStatus = node("launch-appearance-status");
    const newButton = node("launch-new"), openButton = node("launch-open"), pluginRoot = node("startup-root");
    const resume = node("launch-continue"), retry = node("launch-retry"), refresh = node("launch-refresh"), remove = node("launch-remove");
    if (tabs.length !== 3 || [
      ...pages.values(),
      list,
      search,
      empty,
      preview,
      title,
      meta,
      openSelected,
      status,
      density,
      fontSize,
      newButton,
      openButton,
      pluginRoot,
      ...!visualOnly ? [resume, retry, refresh, remove, appearanceStatus, appearance] : []
    ].some((value) => !value)) {
      throw new Error("\u542F\u52A8\u4E2D\u5FC3\u7F3A\u5C11\u63A7\u4EF6");
    }
    if (visualOnly && appearance) throw new Error("\u72EC\u7ACB\u89C6\u89C9\u9884\u89C8\u4E0D\u80FD\u63A5\u5165\u4EA7\u54C1\u5916\u89C2\u5B58\u50A8");
    let active = true, page = "recent", selectedId = null, visible = [], listKey = null, localIssue = "";
    const cleanups = [], rowCleanups = [];
    const listen = (target, event, callback, scope = cleanups) => {
      target.addEventListener(event, callback);
      scope.push(() => target.removeEventListener(event, callback));
    };
    const element = (tag, attributes = {}, ...children) => {
      const value = document2.createElement(tag);
      value.setAttribute("data-frame-ui", "");
      for (const [key, text] of Object.entries(attributes)) value.setAttribute(key, text);
      value.append(...children);
      return value;
    };
    const glyph = (name) => {
      const value = element("span", { class: "launch-icon", "aria-hidden": "true" });
      value.innerHTML = icon2(name, 18);
      return value;
    };
    const pluginView = mountPluginStartupView({ root: pluginRoot, controller: application.controller, selectedId: "frame.score-info", onStateChange: () => render() });
    mounted2.add(root2);
    root2.querySelectorAll("[data-launch-icon]").forEach((value) => value.replaceWith(glyph(value.getAttribute("data-launch-icon"))));
    if (!visualOnly) preview.replaceChildren(element("span", { class: "launch-file-placeholder", title: "\u6682\u65E0\u4F5C\u54C1\u7F29\u7565\u56FE", "aria-label": "\u4F5C\u54C1\u6587\u4EF6" }, glyph("page")));
    const nav = root2.querySelector('[role="tablist"]'), media = document2.defaultView?.matchMedia?.("(max-width: 440px)");
    if (nav && media) {
      const orientation = () => nav.setAttribute("aria-orientation", media.matches ? "horizontal" : "vertical");
      orientation();
      listen(media, "change", orientation);
    }
    function showPage(next, focus = false) {
      if (!active || !pages.has(next)) return;
      page = next;
      for (const [id, panel] of pages) panel.hidden = id !== next;
      for (const tab of tabs) {
        const selected = tab.getAttribute("data-launch-page") === next;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
      }
    }
    function updatePreview(model) {
      const selected = visible.find((item) => item.id === selectedId);
      preview.hidden = !selected;
      title.textContent = selected?.name ?? "";
      meta.textContent = selected ? ".bgp.json" : "";
      openSelected.disabled = !selected || !model.canChoose;
      const label = selected ? "\u6253\u5F00" + selected.name + (visualOnly ? "\uFF08\u9884\u89C8\uFF09" : "") : "\u6CA1\u6709\u6240\u9009\u4F5C\u54C1";
      openSelected.setAttribute("aria-label", label);
      openSelected.title = label;
      if (remove) {
        remove.hidden = !selected;
        remove.disabled = model.busy || model.recent.busy;
      }
      list.querySelectorAll(visualOnly ? "[data-example-id]" : "[data-record-id]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.getAttribute(visualOnly ? "data-example-id" : "data-record-id") === selectedId));
      });
    }
    function invoke(action) {
      if (!active) return;
      localIssue = "";
      try {
        Promise.resolve(action()).then((result) => {
          if (active && result?.ok === false) {
            localIssue = result.message;
            render();
          }
        }, (error) => {
          if (active) {
            localIssue = error?.message ?? String(error);
            render();
          }
        });
      } catch (error) {
        localIssue = error?.message ?? String(error);
        render();
      }
    }
    function render() {
      if (!active) return;
      const model = application.snapshot(), entries = model.recent.entries;
      if (appearance) {
        const state = appearance.snapshot();
        density.value = state.value.density;
        fontSize.value = String(state.value.fontSize);
        root2.setAttribute("data-density", state.value.density);
        root2.style.setProperty("--launch-font-size", state.value.fontSize + "px");
        density.disabled = fontSize.disabled = !state.canEdit;
        appearanceStatus.disabled = !state.canRetry;
        appearanceStatus.dataset.error = String(!!state.issue);
        appearanceStatus.title = state.issue ? state.issue + (state.retryKind === "reload" ? "\uFF1B\u70B9\u51FB\u91CD\u65B0\u8BFB\u53D6" : "\uFF1B\u70B9\u51FB\u91CD\u8BD5\u4FDD\u5B58") : state.phase !== "ready" ? "\u6B63\u5728\u5904\u7406\u542F\u52A8\u4E2D\u5FC3\u8BBE\u7F6E" : state.persisted ? "\u542F\u52A8\u4E2D\u5FC3\u8BBE\u7F6E\u5DF2\u4FDD\u5B58" : "\u542F\u52A8\u4E2D\u5FC3\u9ED8\u8BA4\u8BBE\u7F6E\uFF1B\u66F4\u6539\u81EA\u52A8\u4FDD\u5B58";
        appearanceStatus.setAttribute("aria-label", appearanceStatus.title);
        appearanceStatus.innerHTML = icon2(state.issue ? "undo" : state.phase !== "ready" ? "timerReset" : state.persisted ? "check" : "info");
      }
      const query = search.value.trim().toLowerCase(), key = JSON.stringify([entries, query]);
      if (key !== listKey) {
        listKey = key;
        rowCleanups.splice(0).forEach((stop) => stop());
        list.replaceChildren();
        visible = entries.filter((item) => (item.name + " " + (item.folder ?? item.location)).toLowerCase().includes(query));
        if (!visible.some((item) => item.id === selectedId)) selectedId = visible[0]?.id ?? null;
        for (const item of visible) {
          const date = item.time ?? new Date(item.lastOpenedAt).toLocaleDateString("zh-CN");
          const row = element(
            "button",
            {
              class: "launch-file",
              type: "button",
              [visualOnly ? "data-example-id" : "data-record-id"]: item.id,
              "aria-label": "\u9884\u89C8" + item.name,
              "aria-pressed": String(item.id === selectedId)
            },
            element("span", { class: "launch-file-glyph", "aria-hidden": "true" }, glyph("page")),
            element(
              "span",
              { class: "launch-file-text" },
              element("span", { class: "launch-file-name" }, item.name),
              element("span", { class: "launch-file-folder", title: item.folder ?? item.location }, item.folder ?? item.location)
            ),
            element("span", { class: "launch-file-date" }, date)
          );
          listen(row, "click", () => {
            selectedId = item.id;
            updatePreview(application.snapshot());
          }, rowCleanups);
          listen(row, "dblclick", () => {
            if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "recent", recordId: item.id }));
          }, rowCleanups);
          list.append(row);
        }
      }
      empty.hidden = visible.length > 0;
      empty.textContent = model.recent.issue ? "\u6700\u8FD1\u4F5C\u54C1\u8BFB\u53D6\u5931\u8D25" : query ? "\u6CA1\u6709\u5339\u914D\u7684\u4F5C\u54C1" : "\u6682\u65E0\u6700\u8FD1\u4F5C\u54C1";
      newButton.disabled = openButton.disabled = !model.canChoose;
      root2.setAttribute("aria-busy", String(model.busy));
      const issue = model.issue || localIssue || model.recent.issue || model.document.warnings?.[0]?.message;
      if (visualOnly) status.textContent = model.message;
      else {
        status.replaceChildren(glyph(issue ? "info" : model.busy || model.recent.loading ? "timerReset" : "check"));
        status.title = issue || (model.busy ? "\u6B63\u5728\u5904\u7406" : "\u5C31\u7EEA");
        status.setAttribute("aria-label", status.title);
        status.dataset.error = String(!!issue);
      }
      if (resume) {
        resume.hidden = !model.canContinue;
        resume.disabled = model.busy;
      }
      if (retry) {
        retry.hidden = !model.canRetryStart && !(model.issue && (!model.prepared || model.document.status === "error"));
        retry.disabled = model.busy || model.requiresRestart;
        retry.title = model.canRetryStart ? "\u91CD\u8BD5\u5DE5\u4F5C\u533A\u542F\u52A8" : "\u91CD\u65B0\u8BFB\u53D6\u4F5C\u54C1";
        retry.setAttribute("aria-label", retry.title);
      }
      if (refresh) {
        refresh.disabled = model.recent.loading || model.recent.busy || model.busy;
        refresh.title = model.recent.issue || "\u5237\u65B0\u6700\u8FD1\u4F5C\u54C1";
      }
      updatePreview(model);
    }
    for (const [index, tab] of tabs.entries()) {
      listen(tab, "click", () => showPage(tab.getAttribute("data-launch-page")));
      listen(tab, "keydown", (event) => {
        if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : tabs.length - 1)) % tabs.length;
        showPage(tabs[next].getAttribute("data-launch-page"), true);
      });
    }
    listen(search, "input", render);
    listen(newButton, "click", () => {
      if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "new" }));
    });
    listen(openButton, "click", () => {
      if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "open" }));
    });
    listen(openSelected, "click", () => {
      if (selectedId && application.snapshot().canChoose) invoke(() => application.enter({ kind: "recent", recordId: selectedId }));
    });
    if (resume) listen(resume, "click", () => invoke(() => application.enter({ kind: "continue" })));
    if (retry) listen(retry, "click", () => invoke(() => application.snapshot().canRetryStart ? application.retryStart() : application.prepare()));
    if (refresh) listen(refresh, "click", () => invoke(application.refreshRecents));
    if (remove) listen(remove, "click", () => {
      if (selectedId) invoke(() => application.removeRecent(selectedId));
    });
    const changeAppearance = (patch) => {
      if (appearance?.snapshot().canEdit) void appearance.set(patch);
    };
    listen(density, "change", () => {
      if (!["compact", "comfortable"].includes(density.value)) return;
      if (appearance) changeAppearance({ density: density.value });
      else root2.setAttribute("data-density", density.value);
    });
    listen(fontSize, "change", () => {
      if (!["12", "13", "14"].includes(fontSize.value)) return;
      if (appearance) changeAppearance({ fontSize: Number(fontSize.value) });
      else root2.style.setProperty("--launch-font-size", fontSize.value + "px");
    });
    if (appearance) {
      listen(appearanceStatus, "click", () => {
        if (appearance.snapshot().canRetry) void appearance.retry();
      });
      cleanups.push(appearance.subscribe(render));
    }
    cleanups.push(application.subscribe(render));
    render();
    showPage("recent");
    return Object.freeze({
      showPage,
      refresh: render,
      snapshot: () => Object.freeze({ page, selectedId, visibleIds: visible.map((item) => item.id), plugins: application.controller.snapshot(), scope: visualOnly ? "visual-only" : "application" }),
      dispose() {
        if (!active) return;
        active = false;
        cleanups.splice(0).forEach((stop) => stop());
        rowCleanups.splice(0).forEach((stop) => stop());
        try {
          pluginView.dispose();
        } finally {
          list.replaceChildren();
          mounted2.delete(root2);
        }
      }
    });
  }

  // src/startup-center-preview.js
  var examples = Object.freeze([
    { id: "melody", name: "\u65CB\u5F8B\u7EC3\u4E60", folder: "\u7EC3\u4E60 / \u4E94\u7EBF\u8C31", time: "\u4ECA\u5929" },
    { id: "arpeggio", name: "\u5206\u89E3\u548C\u5F26", folder: "\u7EC3\u4E60 / \u5409\u4ED6", time: "\u6628\u5929" },
    { id: "phrase", name: "\u4E50\u53E5\u8349\u7A3F", folder: "\u521B\u4F5C / \u8349\u7A3F", time: "\u5468\u4E8C" },
    { id: "rhythm", name: "\u8282\u594F\u7EC3\u4E60", folder: "\u7EC3\u4E60 / \u8282\u594F", time: "\u5468\u4E00" }
  ].map(Object.freeze));
  function mountStartupCenterVisual({ root: root2 }) {
    let acceptedPlan = null, message2 = "\u89C6\u89C9\u9884\u89C8";
    const listeners = /* @__PURE__ */ new Set();
    const controller = createPluginStartupController({ directory: BACKUP_PLUGIN_DIRECTORY, store: {
      read: () => acceptedPlan === null ? null : structuredClone(acceptedPlan),
      write: (value) => {
        acceptedPlan = structuredClone(value);
      }
    } });
    let view;
    try {
      view = mountStartupCenterView({ root: root2, visualOnly: true, application: {
        controller,
        snapshot: () => ({ message: message2, canChoose: true, busy: false, recent: { entries: examples }, document: { status: "empty" } }),
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        enter(intent) {
          message2 = (intent.kind === "new" ? "\u65B0\u5EFA\u4F5C\u54C1" : intent.kind === "open" ? "\u6253\u5F00\u4F5C\u54C1" : "\u6253\u5F00" + examples.find((item) => item.id === intent.recordId).name) + " \xB7 \u89C6\u89C9\u9884\u89C8";
          notifyObservers(listeners);
          return { ok: true };
        }
      } });
    } catch (error) {
      controller.dispose();
      throw error;
    }
    return Object.freeze({
      showPage: view.showPage,
      snapshot: view.snapshot,
      dispose() {
        try {
          view.dispose();
        } finally {
          controller.dispose();
          listeners.clear();
        }
      }
    });
  }

  // src/startup-center-entry.js
  var root = globalThis.document?.getElementById("launch-root");
  if (root) {
    try {
      const preview = mountStartupCenterVisual({ root });
      const pagehide = (event) => {
        if (!event.persisted) {
          preview.dispose();
          window.removeEventListener("pagehide", pagehide);
        }
      };
      window.addEventListener("pagehide", pagehide);
    } catch (error) {
      const message2 = document.createElement("p");
      message2.setAttribute("role", "alert");
      message2.textContent = "\u542F\u52A8\u4E2D\u5FC3\u9884\u89C8\u52A0\u8F7D\u5931\u8D25\uFF1A" + error.message;
      root.replaceChildren(message2);
    }
  }
})();
