import assert from "node:assert/strict";
import test from "node:test";
import { createStageViewport } from "../src/host/stage-viewport.js";
import { createWorkspaceViewState } from "../src/host/workspace-view-state.js";

function withHiddenViewport(run) {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, writable: true, value: 1440 }, innerHeight: { configurable: true, writable: true, value: 900 } });
  const css = new Map(), handlers = new Map();
  const rect = { x: 40, y: 154, width: 901, height: 730 };
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  const value = key => parseFloat(css.get(key) ?? 0);
  let hidden = false, scrollX = 0, scrollY = 0;
  const shell = { style: { setProperty: (key, next) => css.set(key, next) } };
  const stage = { getBoundingClientRect: () => ({ ...(hidden ? zero : rect) }) };
  const scroll = {
    get clientWidth() { return hidden ? 0 : rect.width; }, get clientHeight() { return hidden ? 0 : rect.height; },
    get scrollLeft() { return scrollX; }, set scrollLeft(next) { scrollX = hidden ? 0 : Math.max(0, Math.round(next)); },
    get scrollTop() { return scrollY; }, set scrollTop(next) { scrollY = hidden ? 0 : Math.max(0, Math.round(next)); },
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name),
  };
  const paper = { getBoundingClientRect: () => hidden ? { ...zero } : {
    x: rect.x + value("--paper-left") + value("--paper-pan-x") - scrollX,
    y: rect.y + value("--paper-top") + value("--paper-pan-y") - scrollY,
    width: value("--paper-width"), height: value("--paper-width") * 990 / 700,
  } };
  const viewport = createStageViewport({ shell, stage, scroll, paper });
  try {
    viewport.initialize(); viewport.zoom(100);
    run({ viewport, paper, rect, css, scroll,
      hide() { hidden = true; scrollX = scrollY = 0; handlers.get("scroll")(); },
      show() { hidden = false; },
      read(offset) { scroll.scrollTop = offset; handlers.get("scroll")(); },
    });
  } finally {
    viewport.dispose();
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

for (const when of ["before", "during"]) for (const offset of [0, 160]) test(`hidden ${when} preservation keeps the last measurable paper and ${offset}px reading`, () => withHiddenViewport(f => {
  f.read(offset);
  const baseline = f.paper.getBoundingClientRect(), beforeStyles = [...f.css];
  if (when === "before") f.hide();
  f.viewport.preserve(() => {
    if (when === "during") f.hide();
    Object.assign(f.rect, { x: 270, y: 274, width: 671, height: 610 });
  });
  f.viewport.preserve(() => {});
  assert.deepEqual([...f.css], beforeStyles, "zero-size hidden geometry must not replace a valid projection");
  f.show(); f.viewport.preserve(() => {});
  assert.deepEqual(f.paper.getBoundingClientRect(), baseline, "resume restores the screen rectangle after hidden geometry settled");
  f.viewport.preserve(() => Object.assign(f.rect, { x: 40, y: 154, width: 901, height: 730 }));
  assert.deepEqual(f.paper.getBoundingClientRect(), baseline);
  assert.equal(f.scroll.scrollTop, offset, "the original reading offset survives the geometry roundtrip");
}));

test("a window change while hidden recenters only when measurable and preserves reading Y", () => withHiddenViewport(f => {
  f.read(160);
  const baseline = f.paper.getBoundingClientRect();
  f.hide();
  globalThis.innerWidth = 1600;
  f.viewport.preserve(() => Object.assign(f.rect, { width: 1061 }), { recenter: true });
  f.viewport.preserve(() => {});
  f.show(); f.viewport.preserve(() => {});
  const resumed = f.paper.getBoundingClientRect();
  assert.equal(resumed.x + resumed.width / 2, f.rect.x + f.rect.width / 2);
  assert.equal(resumed.y, baseline.y);
  assert.equal(resumed.width, baseline.width);
}));

test("accepted zoom while hidden is projected on resume without replacing reading Y", () => withHiddenViewport(f => {
  f.read(160);
  const baseline = f.paper.getBoundingClientRect();
  f.hide(); f.viewport.preserve(() => {});
  assert.equal(f.viewport.zoom(120).ok, true);
  f.show(); f.viewport.preserve(() => {});
  const resumed = f.paper.getBoundingClientRect();
  assert.equal(resumed.width, 840);
  assert.equal(resumed.y, baseline.y);
  assert.equal(resumed.x + resumed.width / 2, f.rect.x + f.rect.width / 2);
}));

test("reading fit uses stage width independently of page height and explicit page fit resets reading", () => withHiddenViewport(f => {
  f.viewport.fit("width");
  const widthFit = f.paper.getBoundingClientRect();
  assert.equal(widthFit.width, 861, "reading uses available width beyond the old 700px cap");
  f.rect.height = 480;
  f.viewport.fit("width");
  assert.equal(f.paper.getBoundingClientRect().width, widthFit.width, "a shorter viewport must not shrink reading type");
  f.read(160);
  f.viewport.fit("page");
  const page = f.paper.getBoundingClientRect();
  assert.ok(page.height <= f.rect.height - 40);
  assert.equal(page.y, f.rect.y + 20);
  assert.equal(f.scroll.scrollTop, 0, "explicit fit shows the beginning rather than retaining an old scroll offset");
  const zoom = f.viewport.zoomValue();
  f.read(10); f.viewport.fit("page");
  assert.equal(f.viewport.zoomValue(), zoom);
  assert.equal(f.scroll.scrollTop, 0, "fit must recenter even at the same accepted zoom");
  f.viewport.zoom(138.5);
  f.viewport.preserve(() => { f.rect.width -= 200; f.rect.height -= 60; });
  assert.equal(f.viewport.zoomValue(), 138.5, "ordinary sidebar/viewport changes keep manual zoom");
}));

test("legacy no-argument fit and zoom fit still show the complete page", () => withHiddenViewport(f => {
  f.viewport.fit();
  const legacy = f.paper.getBoundingClientRect();
  assert.ok(legacy.height <= f.rect.height - 40);
  f.viewport.fit("width");
  assert.ok(f.paper.getBoundingClientRect().width > legacy.width);
  f.viewport.zoom("fit");
  assert.deepEqual(f.paper.getBoundingClientRect(), legacy);
}));

test("hidden or invalid fit rejects without replacing the accepted reading zoom", () => withHiddenViewport(f => {
  const previous = f.viewport.zoomValue();
  assert.equal(f.viewport.fit("unknown").code, "view.invalid-fit-mode");
  f.hide();
  assert.equal(f.viewport.fit("page").code, "view.unmeasurable");
  assert.equal(f.viewport.zoomValue(), previous);
}));

for (const region of ["top", "left"]) for (const readingOffset of [0, 160]) test(`${region} region roundtrip releases temporary scroll compensation and keeps ${readingOffset}px reading`, () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, value: 1440 }, innerHeight: { configurable: true, value: 900 } });
  try {
    const css = new Map(), handlers = new Map();
    const value = key => parseFloat(css.get(key) ?? 0);
    const rect = { x: 40, y: 154, width: 553, height: 730 };
    const scrollKey = region === "top" ? "scrollTop" : "scrollLeft";
    const coordinate = region === "top" ? "y" : "x";
    const inset = region === "top" ? "--paper-top" : "--paper-left";
    const shell = { style: { setProperty: (key, next) => css.set(key, next) } };
    let scrollX = 0, scrollY = 0;
    const scroll = {
      get clientWidth() { return rect.width; }, get clientHeight() { return rect.height; },
      get scrollLeft() { return scrollX; }, set scrollLeft(next) { scrollX = Math.max(0, next); },
      get scrollTop() { return scrollY; }, set scrollTop(next) {
        const extent = Math.max(value("--paper-top") + value("--paper-width") * 990 / 700 + 20, value("--paper-scroll-height"));
        scrollY = Math.max(0, Math.min(next, extent - this.clientHeight));
      },
      addEventListener: (name, handler) => handlers.set(name, handler),
      removeEventListener: name => handlers.delete(name),
    };
    const stage = { getBoundingClientRect: () => ({ ...rect }) };
    const paper = { getBoundingClientRect: () => ({
      x: rect.x + value("--paper-left") + value("--paper-pan-x") - scrollX,
      y: rect.y + value("--paper-top") + value("--paper-pan-y") - scrollY,
      width: value("--paper-width"), height: value("--paper-width") * 990 / 700,
    }) };
    const viewport = createStageViewport({ shell, stage, scroll, paper });
    try {
      viewport.initialize(); viewport.zoom(144.6);
      scroll[scrollKey] = readingOffset; handlers.get("scroll")();
      const baseline = paper.getBoundingClientRect();
      viewport.preserve(() => Object.assign(rect, region === "top" ? { y: 354, height: 530 } : { x: 240, width: 353 }));
      assert.deepEqual(paper.getBoundingClientRect(), baseline, "growing the region must preserve the screen rectangle");
      viewport.preserve(() => Object.assign(rect, region === "top" ? { y: 154, height: 730 } : { x: 40, width: 553 }));
      assert.deepEqual(paper.getBoundingClientRect(), baseline, "returning must preserve the same reading position");
      assert.equal(scroll[scrollKey], readingOffset, "temporary region compensation must not become permanent reading offset");
      assert.equal(value(inset), 20, "the returned stage must not retain a blank compensation margin");
      scroll[scrollKey] = 0; handlers.get("scroll")();
      assert.equal(paper.getBoundingClientRect()[coordinate], region === "top" ? 174 : 60, "reading to the start must reveal the original paper edge");
    } finally { viewport.dispose(); }
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("window growth preserves the preceding screen Y despite native scroll clamping", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, writable: true, value: 1280 }, innerHeight: { configurable: true, writable: true, value: 720 } });
  try {
    const css = new Map(), handlers = new Map();
    const value = (key, fallback = 0) => parseFloat(css.get(key) ?? fallback);
    const rect = { x: 44, y: 34, width: 896, height: 626, right: 940 };
    let scrollY = 0, scrollX = 0;
    const shell = { style: { setProperty: (key, val) => css.set(key, val) } };
    const stage = { getBoundingClientRect: () => ({ ...rect }) };
    const scroll = {
      get clientWidth() { return rect.width; }, get clientHeight() { return rect.height; },
      get scrollTop() { return scrollY; },
      set scrollTop(y) {
        const extent = Math.max(value("--paper-top", 20) + value("--paper-width", 542) * 990 / 700 + 20, value("--paper-scroll-height"));
        scrollY = Math.max(0, Math.min(y, extent - this.clientHeight));
      },
      get scrollLeft() { return scrollX; }, set scrollLeft(x) { scrollX = x; },
      addEventListener: (event, handler) => handlers.set(event, handler),
      removeEventListener: event => handlers.delete(event),
    };
    const paper = { getBoundingClientRect() {
      const width = value("--paper-width", 542);
      return { x: rect.x + value("--paper-left", 20) + value("--paper-pan-x") - scrollX,
        y: rect.y + value("--paper-top", 20) + value("--paper-pan-y") - scrollY, width, height: width * 990 / 700 };
    } };
    const view = createStageViewport({ shell, stage, scroll, paper });
    view.initialize();
    assert.equal(paper.getBoundingClientRect().width, 855, "default reading fits width rather than page height");
    view.zoom(100);
    scroll.scrollTop = 360;
    handlers.get("scroll")();
    const baseline = paper.getBoundingClientRect();
    assert.equal(baseline.y, -306);
    globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
    Object.assign(rect, { width: 1056, height: 806, right: 1100 });
    scroll.scrollTop = scroll.scrollTop; // The browser clamps before dispatching resize.
    handlers.get("scroll")();
    assert.notEqual(paper.getBoundingClientRect().y, baseline.y);
    view.preserve(() => {}, { recenter: true });
    const resized = paper.getBoundingClientRect();
    assert.equal(resized.y, baseline.y);
    assert.equal(resized.width, 700);
    assert.equal(resized.x + resized.width / 2, 44 + 1056 / 2);
    view.preserve(() => Object.assign(rect, { x: 284, width: 816 }));
    assert.deepEqual(paper.getBoundingClientRect(), resized);
    assert.equal(view.zoom("bad").ok, false);
    assert.deepEqual(paper.getBoundingClientRect(), resized);
    assert.ok(scroll.scrollLeft > 0, "sidebar compensation leaves the paper start reachable by native scroll");
    scroll.scrollLeft = 0;
    handlers.get("scroll")();
    assert.ok(paper.getBoundingClientRect().x >= rect.x, "scrolling to the start reveals the paper left edge");
    const beforeHeader = paper.getBoundingClientRect();
    view.preserve(() => Object.assign(rect, { y: rect.y + 120, height: rect.height - 120 }));
    assert.equal(paper.getBoundingClientRect().y, beforeHeader.y, "header growth preserves the preceding screen Y");
    scroll.scrollTop = 0;
    handlers.get("scroll")();
    assert.ok(paper.getBoundingClientRect().y >= rect.y, "scrolling to the start reveals the paper top edge");
    view.dispose();
    assert.equal(handlers.size, 0);
    assert.equal(view.zoom(100).code, "view.disposed");
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("fit mode uses the stage width when the window center is outside a narrow stage", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, writable: true, value: 637 }, innerHeight: { configurable: true, writable: true, value: 764 } });
  try {
    const css = new Map(), handlers = new Map();
    const rect = { x: 40, y: 74, width: 327, height: 618, right: 367 };
    const shell = { style: { setProperty: (key, val) => css.set(key, val) } };
    const stage = { getBoundingClientRect: () => ({ ...rect }) };
    const scroll = { scrollLeft: 0, scrollTop: 0, clientWidth: rect.width, clientHeight: rect.height,
      addEventListener: (event, handler) => handlers.set(event, handler), removeEventListener: event => handlers.delete(event) };
    const paper = { getBoundingClientRect() { const width = parseFloat(css.get("--paper-width") ?? 542); return { x: rect.x, y: rect.y, width, height: width * 990 / 700 }; } };
    const view = createStageViewport({ shell, stage, scroll, paper });
    view.initialize();
    assert.equal(parseFloat(css.get("--paper-width")), 287);
    assert.ok(parseFloat(css.get("--paper-width")) > 80);
    view.dispose();
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("independent region geometry updates preserve the paper screen rectangle", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, writable: true, value: 1440 }, innerHeight: { configurable: true, writable: true, value: 900 } });
  try {
    const css = new Map(), handlers = new Map();
    const stageRect = { x: 284, y: 34, width: 872, height: 806 };
    const value = key => parseFloat(css.get(key) ?? 0);
    const shell = { style: { setProperty: (key, next) => css.set(key, String(next)) } };
    const stage = { getBoundingClientRect: () => ({ ...stageRect, right: stageRect.x + stageRect.width }) };
    const scroll = { scrollLeft: 0, scrollTop: 0, clientWidth: stageRect.width, clientHeight: stageRect.height,
      addEventListener: (name, listener) => handlers.set(name, listener), removeEventListener: name => handlers.delete(name) };
    const paper = { getBoundingClientRect: () => {
      const width = value("--paper-width");
      return { x: stageRect.x + value("--paper-left") + value("--paper-pan-x") - scroll.scrollLeft,
        y: stageRect.y + value("--paper-top") + value("--paper-pan-y") - scroll.scrollTop, width,
        height: width * 990 / 700 };
    } };
    const viewport = createStageViewport({ shell, stage, scroll, paper });
    viewport.initialize(); viewport.zoom(100);
    const baseline = paper.getBoundingClientRect();
    for (const update of [
      { x: 364, width: 792 },  // opening or widening the left region
      { x: 284, width: 672 },  // changing the right region
      { y: 74, height: 766 },  // opening the top band
      { y: 34, height: 706 },  // opening the bottom band
    ]) {
      viewport.preserve(() => Object.assign(stageRect, update));
      assert.deepEqual(paper.getBoundingClientRect(), baseline, JSON.stringify(update));
    }
    viewport.dispose();
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("native scroll rounding cannot move the paper during fractional region compensation", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, value: 1440 }, innerHeight: { configurable: true, value: 900 } });
  try {
    const css = new Map(), handlers = new Map();
    const rect = { x: 40, y: 34, width: 901, height: 806 };
    const value = key => parseFloat(css.get(key) ?? 0);
    const shell = { style: { setProperty: (key, next) => css.set(key, next) } };
    let scrollX = 0, scrollY = 0;
    const scroll = {
      get clientWidth() { return rect.width; }, get clientHeight() { return rect.height; },
      get scrollLeft() { return scrollX; }, set scrollLeft(next) { scrollX = Math.max(0, Math.round(next)); },
      get scrollTop() { return scrollY; }, set scrollTop(next) { scrollY = Math.max(0, Math.round(next)); },
      addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener: name => handlers.delete(name),
    };
    const stage = { getBoundingClientRect: () => ({ ...rect }) };
    const paper = { getBoundingClientRect: () => ({
      x: rect.x + value("--paper-left") + value("--paper-pan-x") - scrollX,
      y: rect.y + value("--paper-top") + value("--paper-pan-y") - scrollY,
      width: value("--paper-width"), height: value("--paper-width") * 990 / 700,
    }) };
    const viewport = createStageViewport({ shell, stage, scroll, paper });
    viewport.initialize(); viewport.zoom(100);
    const baseline = paper.getBoundingClientRect();
    assert.equal(baseline.x, 140.5);
    for (const change of [{ x: 200, y: 100.25 }, { x: 380, y: 200.5 }, { x: 40, y: 34 }, { x: 270, y: 154 }]) {
      viewport.preserve(() => Object.assign(rect, change));
      assert.deepEqual(paper.getBoundingClientRect(), baseline, JSON.stringify(change));
    }
    assert.ok(scrollX > 0 && scrollY > 0, "offscreen content remains reachable through native scrolling");
    viewport.dispose();
    assert.equal(handlers.size, 0);
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("CSS padding quantization cannot accumulate drift across repeated region changes", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, value: 1440 }, innerHeight: { configurable: true, value: 900 } });
  try {
    const css = new Map(), value = key => parseFloat(css.get(key) ?? 0);
    const padding = key => Math.floor(value(key) * 64) / 64;
    const rect = { x: 40, y: 154, width: 901, height: 730 };
    const shell = { style: { setProperty: (key, next) => css.set(key, next) } };
    let scrollX = 0, scrollY = 0;
    const scroll = {
      get clientWidth() { return rect.width; }, get clientHeight() { return rect.height; },
      get scrollLeft() { return scrollX; }, set scrollLeft(next) { scrollX = Math.max(0, Math.round(next)); },
      get scrollTop() { return scrollY; }, set scrollTop(next) { scrollY = Math.max(0, Math.round(next)); },
      addEventListener() {}, removeEventListener() {},
    };
    const stage = { getBoundingClientRect: () => ({ ...rect }) };
    const paper = { getBoundingClientRect: () => ({
      x: rect.x + padding("--paper-left") + value("--paper-pan-x") - scrollX,
      y: rect.y + padding("--paper-top") + value("--paper-pan-y") - scrollY,
      width: value("--paper-width"), height: value("--paper-width") * 990 / 700,
    }) };
    const viewport = createStageViewport({ shell, stage, scroll, paper });
    try {
      viewport.initialize(); viewport.zoom(100);
      const baseline = paper.getBoundingClientRect();
      for (let i = 0; i < 40; i++) {
        viewport.preserve(() => Object.assign(rect, { x: 200.2, y: 354.2 }));
        viewport.preserve(() => Object.assign(rect, { x: 40, y: 154 }));
      }
      const actual = paper.getBoundingClientRect();
      assert.ok(Math.abs(actual.x - baseline.x) < 1e-8, "layout rounding must not accumulate horizontal movement");
      assert.ok(Math.abs(actual.y - baseline.y) < 1e-8, "layout rounding must not accumulate vertical movement");
    } finally { viewport.dispose(); }
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Ctrl+wheel adjusts the shared continuous zoom, ordinary wheel still scrolls, and disposal removes it", () => {
  const prior = ["innerWidth", "innerHeight"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperties(globalThis, { innerWidth: { configurable: true, writable: true, value: 900 }, innerHeight: { configurable: true, writable: true, value: 1000 } });
  try {
  const css = new Map(), handlers = new Map(), calls = [];
  const rect = { x: 40, y: 30, width: 900, height: 1000, right: 940 };
  const value = key => parseFloat(css.get(key) ?? 0);
  const shell = { style: { setProperty: (key, next) => css.set(key, String(next)) } };
  const stage = { getBoundingClientRect: () => ({ ...rect }) };
  let scrollX = 0, scrollY = 0;
  const scroll = {
    clientWidth: rect.width, clientHeight: rect.height,
    get scrollLeft() { return scrollX; }, set scrollLeft(next) { scrollX = next; },
    get scrollTop() { return scrollY; }, set scrollTop(next) { scrollY = next; },
    addEventListener: (name, listener) => handlers.set(name, listener),
    removeEventListener: name => handlers.delete(name),
  };
  const paper = { getBoundingClientRect: () => ({ x: rect.x + value("--paper-left") + value("--paper-pan-x"),
    y: rect.y + value("--paper-top") + value("--paper-pan-y"), width: value("--paper-width"), height: value("--paper-width") * 990 / 700 }) };
  const view = createWorkspaceViewState({ initialZoom: 100 });
  const viewport = createStageViewport({ shell, stage, scroll, paper, view,
    execute(id, payload) { calls.push([id, payload]); return view.adjustZoom(payload.delta); } });
  viewport.initialize();
  const initial = view.read.snapshot().zoom;
  let prevented = false;
  handlers.get("wheel")({ ctrlKey: false, deltaY: -100, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(view.read.snapshot().zoom, initial);
  handlers.get("wheel")({ ctrlKey: true, deltaY: -100, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(calls, [["frame.workspace.view.zoomBy", { delta: 5 }]]);
  assert.equal(view.read.snapshot().zoom, Math.min(400, initial + 5));
  view.setZoom(100);
  handlers.get("wheel")({ ctrlKey: true, deltaY: -10, preventDefault() {} });
  assert.equal(view.read.snapshot().zoom, 100.5, "滚动量决定增量，而非每次跳同一档");
  for (let i = 0; i < 4; i++) handlers.get("wheel")({ ctrlKey: true, deltaY: -0.5, preventDefault() {} });
  assert.equal(view.read.snapshot().zoom, 100.6, "不足显示精度的细小滚动量累计生效");
  handlers.get("wheel")({ ctrlKey: true, deltaY: 1, deltaMode: 1, preventDefault() {} });
  assert.equal(view.read.snapshot().zoom, 99.8, "按行滚动转换为同一单位");
  view.setZoom(400);
  handlers.get("wheel")({ ctrlKey: true, deltaY: -1, preventDefault() {} });
  assert.equal(view.read.snapshot().zoom, 400);
  view.setZoom(25);
  handlers.get("wheel")({ ctrlKey: true, deltaY: 1, preventDefault() {} });
  assert.equal(view.read.snapshot().zoom, 25);
  viewport.dispose();
  assert.equal(handlers.has("wheel"), false);
  assert.equal(viewport.zoom(100).code, "view.disposed");
  assert.equal(view.setZoom(120).ok, true, "视口释放不释放传入的宿主状态");
  view.dispose();
  } finally {
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
