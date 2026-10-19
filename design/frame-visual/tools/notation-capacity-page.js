import { renderStaff } from "../src/score/vexflow-staff-renderer.js";
import { loadVexFlow } from "../src/score/vexflow-runtime.js";
import { runNotationCapacity } from "./notation-capacity.js";

const data = JSON.parse(document.getElementById("capacity-inputs").textContent);
const stage = document.getElementById("drawing"), status = document.getElementById("status");
const run = document.getElementById("run"), stop = document.getElementById("stop"), download = document.getElementById("download");
let controller = null, result = null;
const urls = new Set();
function paint(signal) {
  return new Promise((resolve, reject) => {
    let first, second;
    const cancelled = () => { cancelAnimationFrame(first); cancelAnimationFrame(second); signal?.removeEventListener("abort", cancelled); reject(new DOMException("Capacity run cancelled", "AbortError")); };
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted || document.visibilityState !== "visible") { cancelled(); return; }
    first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { signal?.removeEventListener("abort", cancelled); resolve(); }); });
  });
}
function observeBlocking() {
  const values = [];
  const available = globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask") === true;
  const observer = available ? new PerformanceObserver(list => values.push(...list.getEntries().map(entry => entry.duration))) : null;
  observer?.observe({ type: "longtask", buffered: false });
  return { available, take() { values.push(...(observer?.takeRecords() ?? []).map(entry => entry.duration)); return values.splice(0); }, stop() { observer?.disconnect(); } };
}
function adopt(drawing, item, expected) {
  if (document.visibilityState !== "visible") throw new DOMException("Page hidden", "AbortError");
  stage.replaceChildren(drawing.svg); // Complete engine roots carry Bravura inheritance.
  const roots = [...drawing.svg.querySelectorAll("[data-score-page] > svg")];
  const texts = [...drawing.svg.querySelectorAll("text")].filter(text => /[\uE000-\uF8FF]/u.test(text.textContent));
  const actualIds = [...drawing.svg.querySelectorAll("[data-event-id]")].map(element => element.getAttribute("data-event-id"));
  const expectedIds = item.snapshot.measures.flatMap(measure => measure.events.map(event => event.id));
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error("Adopted SVG event identity changed");
  const fontsVerified = roots.length === expected.pages && roots.every(root => root.getAttribute("font-family")?.includes("Bravura"))
    && texts.length > 0 && texts.every(text => getComputedStyle(text).fontFamily.split(",")[0].replaceAll('"', "").trim() === "Bravura");
  return { pageRoots: roots.length, fontsVerified, nodes: drawing.svg.querySelectorAll("*").length + 1 };
}
run.addEventListener("click", async () => {
  if (controller || document.visibilityState !== "visible") return;
  const current = new AbortController(); controller = current; result = null;
  run.disabled = true; stop.disabled = false; download.disabled = true;
  // A synchronous renderer cannot be forcibly interrupted; late results are never adopted after cancellation.
  const timeout = setTimeout(() => current.abort(), 300000);
  try {
    result = await runNotationCapacity({ ...data, signal: current.signal,
      ports: { now: () => performance.now(), initialize: loadVexFlow, render: renderStaff, adopt, paint, observeBlocking,
        clear: () => stage.replaceChildren() },
      onProgress: ({ name, index, iterations }) => { status.textContent = `${name} · ${index < 0 ? "预热" : `${index + 1}/${iterations}`}`; } });
    result.candidate = data.candidate; result.policy = data.policy;
    result.environment = { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      approximateDeviceMemoryGiB: navigator.deviceMemory ?? null, dpr: devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight }, visibility: document.visibilityState,
      minimumReferenceDeviceVerified: false };
    status.textContent = `${result.status} · ${result.assessment} · G6 pending`;
    document.getElementById("summary").textContent = result.cases.map(item => `${item.name}: ${item.stats ? `${item.stats.renderToAdoptMs.p95.toFixed(1)} ms p95` : "未完成"}`).join("\n");
    download.disabled = false;
  } catch (error) {
    status.textContent = `failed · ${error?.message ?? String(error)} · G6 pending`;
  } finally { clearTimeout(timeout); controller = null; run.disabled = false; stop.disabled = true; }
});
stop.addEventListener("click", () => controller?.abort());
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") controller?.abort(); });
download.addEventListener("click", () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + "\n"], { type: "application/json" })); urls.add(url);
  const link = document.createElement("a"); link.href = url; link.download = `notation-capacity-${Date.now()}.json`; link.click();
  setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 1000);
});
addEventListener("pagehide", () => { controller?.abort(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); stage.replaceChildren(); });
