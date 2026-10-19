import assert from "node:assert/strict";
import test from "node:test";
import { LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Window } from "@tauri-apps/api/window";
import { createDesktopStartupWindow } from "../src/services/desktop-startup-window.ts";

function fixture() {
  const calls: { name: string; value?: unknown }[] = [];
  let size = new PhysicalSize(1560, 1050), scale = 1.5, maximized = false;
  let setFailure: (() => void | Promise<void>) | null = null;
  const window = {
    async innerSize() { calls.push({ name: "read" }); return size; },
    async scaleFactor() { return scale; },
    async isMaximized() { return maximized; },
    async unmaximize() { calls.push({ name: "unmaximize" }); maximized = false; },
    async setMinSize(value: Parameters<Window["setMinSize"]>[0]) {
      calls.push({ name: "min", value });
    },
    async setSize(value: Parameters<Window["setSize"]>[0]) {
      calls.push({ name: "size", value });
      if (setFailure) await setFailure();
      assert.ok(value instanceof LogicalSize); size = value.toPhysical(scale);
    },
    async maximize() { calls.push({ name: "maximize" }); maximized = true; },
  };
  let work = new PhysicalSize(2880, 1620);
  const app = createDesktopStartupWindow({ window, monitor: async () => ({ name: "test", scaleFactor: 1.5,
    size: work, position: new PhysicalPosition(0, 0), workArea: { size: work, position: new PhysicalPosition(0, 0) } }) });
  const sizes = () => calls.filter(call => call.name === "size").map(call => call.value);
  return { app, calls, sizes, setState(width: number, height: number, max = false) { size = new PhysicalSize(width, height); maximized = max; },
    setWork(width: number, height: number) { work = new PhysicalSize(width, height); },
    fail(value: typeof setFailure) { setFailure = value; }, setScale(value: number) { scale = value; } };
}

test("one native window converts physical DPI and remembers independent welcome/workspace restored sizes", async () => {
  const f = fixture();
  await f.app.present("welcome"); assert.equal(f.calls.length, 0);
  await f.app.present("workspace");
  assert.deepEqual(f.sizes(), [new LogicalSize(1440, 900)]);
  f.setState(1800, 1200);
  await f.app.present("welcome"); await f.app.present("workspace");
  assert.deepEqual(f.sizes(), [new LogicalSize(1440, 900), new LogicalSize(1040, 700), new LogicalSize(1200, 800)]);
  assert.deepEqual(f.calls.slice(0, 4).map(call => call.name), ["read", "unmaximize", "min", "size"]);
  f.app.dispose();
});

test("maximized mode restores its last nonmaximized size and actual maximized flag", async () => {
  const f = fixture();
  await f.app.present("workspace"); f.setState(2800, 1500, true);
  await f.app.present("welcome"); await f.app.present("workspace");
  assert.deepEqual(f.sizes().at(-1), new LogicalSize(1440, 900));
  assert.equal(f.calls.at(-1)?.name, "maximize");
  f.app.dispose();
});

test("small monitor work area clamps logical size and minimum without exceeding available height", async () => {
  const f = fixture(); f.setWork(1200, 900);
  await f.app.present("workspace");
  assert.deepEqual(f.sizes().at(-1), new LogicalSize(800, 560));
  assert.deepEqual(f.calls.find(call => call.name === "min")?.value, new LogicalSize(800, 560));
  f.app.dispose();
});

test("failed target resize restores the previous mode and can retry without a new window", async () => {
  const f = fixture(); let remaining = 1;
  f.fail(() => { if (remaining-- > 0) throw new Error("resize refused"); });
  await assert.rejects(f.app.present("workspace"), /resize refused/);
  assert.deepEqual(f.sizes(), [new LogicalSize(1440, 900), new LogicalSize(1040, 700)]);
  f.fail(null); await f.app.present("workspace");
  assert.deepEqual(f.sizes().at(-1), new LogicalSize(1440, 900)); f.app.dispose();
});

test("failed resize and failed rollback are explicit aggregate errors", async () => {
  const f = fixture(); f.fail(() => { throw new Error("OS refused"); });
  await assert.rejects(f.app.present("workspace"), error => error instanceof AggregateError && error.errors.length === 2);
  f.app.dispose();
});

test("disposal during an issued native operation prevents follow-up operations and rollback", async () => {
  const f = fixture(); let resolve!: () => void, reached!: () => void;
  const pending = new Promise<void>(yes => { resolve = yes; });
  const arrived = new Promise<void>(yes => { reached = yes; });
  f.fail(() => { reached(); return pending; });
  const changing = f.app.present("workspace"); await arrived;
  await assert.rejects(f.app.present("welcome"), /尚未完成/);
  const count = f.calls.length; f.app.dispose(); resolve();
  await assert.rejects(changing, /已释放/); assert.equal(f.calls.length, count);
  await assert.rejects(f.app.present("welcome"), /已释放/);
});

test("invalid physical scale fails before native mutations", async () => {
  const f = fixture(); f.setScale(0);
  await assert.rejects(f.app.present("workspace"), /缩放因子无效/);
  assert.deepEqual(f.calls.map(call => call.name), ["read"]); f.app.dispose();
});
