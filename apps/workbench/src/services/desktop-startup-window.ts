import { LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow, type Window } from "@tauri-apps/api/window";

type Mode = "welcome" | "workspace";
type Geometry = { width: number; height: number; maximized: boolean };
type WindowPort = Pick<Window, "innerSize" | "scaleFactor" | "isMaximized" | "setMinSize" | "setSize" | "unmaximize" | "maximize">;
const defaults = { welcome: { width: 1040, height: 700 }, workspace: { width: 1440, height: 900 } };
const minimums = { welcome: { width: 760, height: 520 }, workspace: { width: 960, height: 640 } };
// Reserve logical height for native title-bar decoration; this is not a DPI scale.
const decorationHeightReserve = 40;

/** One current window; no document/plugin ownership and no persistent geometry format. */
export function createDesktopStartupWindow({ window: port = getCurrentWindow(), monitor = currentMonitor }: {
  window?: WindowPort; monitor?: typeof currentMonitor;
} = {}) {
  let active = true, busy = false, mode: Mode = "welcome";
  const saved: Partial<Record<Mode, Geometry>> = {};
  const current = () => { if (!active) throw new Error("启动窗口适配已释放"); };
  async function read(): Promise<Geometry> {
    const size = await port.innerSize(); current();
    const scale = await port.scaleFactor(); current();
    const maximized = await port.isMaximized(); current();
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("窗口缩放因子无效");
    const logical = size.toLogical(scale);
    return { width: logical.width, height: logical.height, maximized };
  }
  async function apply(next: Mode, geometry: Geometry) {
    const display = await monitor(); current();
    const work = display?.workArea.size.toLogical(display.scaleFactor);
    const width = Math.min(geometry.width, work?.width ?? geometry.width);
    const height = Math.min(geometry.height, work ? Math.max(1, work.height - decorationHeightReserve) : geometry.height);
    await port.unmaximize(); current();
    await port.setMinSize(new LogicalSize(Math.min(minimums[next].width, width), Math.min(minimums[next].height, height))); current();
    await port.setSize(new LogicalSize(width, height)); current();
    if (geometry.maximized) { await port.maximize(); current(); }
  }
  return Object.freeze({
    async present(next: Mode): Promise<void> {
      current();
      if (next !== "welcome" && next !== "workspace") throw new Error("未知启动窗口模式");
      if (busy) throw new Error("窗口切换尚未完成");
      if (next === mode) return;
      busy = true;
      const previousMode = mode;
      let previous: Geometry | null = null;
      try {
        previous = await read(); current();
        // A maximized client size is not the user's restored size. Keep the last
        // nonmaximized geometry (or the mode default) alongside the actual flag.
        saved[mode] = previous.maximized ? { ...(saved[mode] ?? defaults[mode]), maximized: true } : previous;
        await apply(next, saved[next] ?? { ...defaults[next], maximized: false }); current();
        mode = next;
      } catch (error) {
        if (active && previous) {
          try { await apply(previousMode, saved[previousMode] ?? previous); }
          catch (rollbackError) { throw new AggregateError([error, rollbackError], "窗口调整和恢复均失败，请重新启动应用"); }
        }
        throw error;
      } finally { busy = false; }
    },
    dispose() { active = false; },
  });
}
