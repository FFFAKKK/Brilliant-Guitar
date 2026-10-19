import { readFile } from "node:fs/promises";
import { createStaffProjectionPort } from "../../src/score/staff-read-port.js";
import { STAFF_FIXTURE } from "../../src/fixtures/staff-snapshot.js";
import { scoreEditPoints } from "../../src/vendor/score-interaction.js";

export const settle = () => new Promise(resolve => setImmediate(resolve));
export function sourceFixture(snapshot = STAFF_FIXTURE) {
  const projection = createStaffProjectionPort({ snapshot });
  let status = { status: "ready", documentId: "document-one", documentVersion: 0 }, listeners = 0;
  return { read: { snapshot: projection.read.snapshot, status: () => status, subscribe(listener) {
    const stop = projection.read.subscribe(listener); listeners++;
    let active = true;
    return () => { if (active) { active = false; listeners--; stop(); } };
  } }, listeners: () => listeners,
  publish(value, next = {}) { status = { ...status, ...next }; projection.publish(value); },
  dispose: projection.dispose };
}

/** Deliberately synthetic drawing geometry; these tests do not qualify typography or browser pixels. */
export function renderSelectionFixture(snapshot) {
  // The minimal DOM double has no namespace API; keep SVG emulation local to this fixture.
  document.createElementNS ??= (namespaceURI, tag) => Object.assign(document.createElement(tag), { namespaceURI });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.defineProperty(svg.style, "removeProperty", { value: key => svg.style.values.delete(key) });
  svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
  const interaction = { anchors: [], events: [], measures: [] };
  snapshot.measures.forEach((measure, index) => {
    const offset = index * 200;
    const group = document.createElementNS(svg.namespaceURI, "svg"); group.setAttribute("data-test-page", String(index));
    const hit = document.createElementNS(svg.namespaceURI, "rect"); hit.setAttribute("data-measure-id", measure.id); group.append(hit);
    interaction.measures.push({ measureId: measure.id, x: 0, y: offset, width: 120, height: 60,
      staffBottom: offset + 40, lineSpacing: 5 });
    measure.events.forEach((event, eventIndex) => {
      const eventHit = document.createElementNS(svg.namespaceURI, "rect"); eventHit.setAttribute("data-event-id", event.id); group.append(eventHit);
      interaction.events.push({ measureId: measure.id, eventId: event.id, x: 20 + eventIndex * 20, y: offset + 10, width: 10, height: 10 });
    });
    for (const point of scoreEditPoints(snapshot).filter(item => item.measureId === measure.id)) {
      interaction.anchors.push({ measureId: measure.id, anchor: point.anchor, offsetUnits: point.offsetUnits,
        x: 10 + point.offsetUnits / 16 * 20, y: offset + 25, y1: offset + 10, y2: offset + 40 });
    }
    svg.append(group);
  });
  return { svg, interaction, layout: { width: 120, height: snapshot.measures.length * 200 } };
}

// Replace only the rendering provider in a test copy of the real core factory.
// Its declaration, commands, owner creation, permissions, mount and disposal are unchanged.
export async function loadCoreSelectionPluginForTest() {
  const entry = new URL("../../src/fixtures/core-score-plugin.js", import.meta.url);
  const view = new URL("../../src/score/core-score-view.js", import.meta.url);
  const shim = `import { createCoreScoreView as original } from ${JSON.stringify(view.href)};
    import { renderSelectionFixture } from ${JSON.stringify(import.meta.url)};
    export function createCoreScoreView(options) { return original({ ...options, renderSnapshot: renderSelectionFixture }); }`;
  const shimUrl = "data:text/javascript;base64," + Buffer.from(shim).toString("base64");
  let source = (await readFile(entry, "utf8")).replace(/from "(\.[^"]+)"/g,
    (_, dependency) => `from "${new URL(dependency, entry).href}"`);
  source = source.replace(view.href, shimUrl);
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}

export function clickAt(node, clientX, clientY, extra = {}) {
  const event = new Event("click", { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ button: 0, clientX, clientY, ...extra })) Object.defineProperty(event, key, { value });
  node.dispatchEvent(event); return event;
}
