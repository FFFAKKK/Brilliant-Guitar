import { timingStats } from "./capacity-statistics.js";

const finite = value => Number.isFinite(value) && value >= 0;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function guard(signal) { if (signal?.aborted) throw new DOMException("Capacity run cancelled", "AbortError"); }
function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { signal?.removeEventListener("abort", cancel); reject(new DOMException("Capacity run cancelled", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    Promise.resolve().then(() => { guard(signal); return operation(); }).then(value => {
      signal?.removeEventListener("abort", cancel); if (signal?.aborted) cancel(); else resolve(value);
    }, error => { signal?.removeEventListener("abort", cancel); reject(error); });
  });
}

export function validateNotationCapacityInputs(cases, policy) {
  if (!policy?.id || !Number.isSafeInteger(policy.warmups) || policy.warmups < 0 || policy.warmups > 10
    || !Number.isSafeInteger(policy.iterations) || policy.iterations < 1 || policy.iterations > 100
    || !finite(policy.engineFontInitializationMaxMs) || !finite(policy.maxLongTaskMs)
    || !Array.isArray(cases) || cases.length !== 4 || policy.cases?.length !== cases.length) throw new TypeError("Invalid capacity policy/input");
  const names = new Set();
  cases.forEach((item, index) => {
    const expected = policy.cases[index], measures = item.snapshot?.measures;
    const events = measures?.flatMap(measure => measure.events) ?? [];
    if (names.has(item.name) || item.name !== expected.name || measures?.length !== expected.measures
      || events.length !== expected.events || !finite(expected.renderToAdoptP95Ms)
      || !Number.isSafeInteger(expected.pages) || expected.pages < 1
      || new Set(measures.map(measure => measure.id)).size !== measures.length
      || new Set(events.map(event => event.id)).size !== events.length) throw new TypeError(`Invalid capacity case: ${item.name}`);
    names.add(item.name);
  });
}

/** Geometry and music must come from the exact drawing that will be adopted. */
export function assertCapacityDrawing(drawing, item, expected) {
  const eventIds = item.snapshot.measures.flatMap(measure => measure.events.map(event => event.id));
  if (!drawing?.svg || drawing.layout?.pages?.length !== expected.pages
    || !equal(drawing.interaction?.events?.map(event => event.eventId), eventIds)
    || !equal(drawing.interaction?.measures?.map(measure => measure.measureId), item.snapshot.measures.map(measure => measure.id))
    || drawing.interaction.events.some(event => ![event.x, event.y, event.width, event.height].every(finite)
      || event.y + event.height > drawing.layout.height)) throw new Error(`Drawing lost music/geometry: ${item.name}`);
}

/** This runner has no renderer implementation. The browser entry injects the existing one. */
export async function runNotationCapacity({ cases, policy, ports, signal, onProgress = () => {} }) {
  validateNotationCapacityInputs(cases, policy);
  const report = { at: new Date().toISOString(), status: "failed", assessment: "incomplete", qualificationG6: "pending",
    policyId: policy.id, minimumDeviceQualification: "pending", warmups: policy.warmups, iterations: policy.iterations,
    percentileMethod: "nearest-rank", scope: "Actual renderer + complete SVG adoption; two RAF callbacks are paint opportunities, not proof of compositor presentation",
    cases: [], failures: [], longTasksMs: [], blockingObservationAvailable: false };
  let observation;
  const collect = () => {
    const values = observation.take();
    if (!Array.isArray(values) || values.some(value => !finite(value))) throw new Error("Invalid blocking observation");
    report.longTasksMs.push(...values); return values;
  };
  try {
    guard(signal); observation = ports.observeBlocking(); report.blockingObservationAvailable = observation.available === true;
    const started = ports.now(); await abortable(() => ports.initialize(), signal); guard(signal);
    report.engineFontInitializationMs = ports.now() - started;
    if (!finite(report.engineFontInitializationMs)) throw new Error("Invalid initialization clock");
    collect();
    for (const [caseIndex, item] of cases.entries()) {
      const expected = policy.cases[caseIndex], result = { name: item.name, measures: expected.measures,
        events: expected.events, pages: expected.pages, samples: [] };
      report.cases.push(result);
      for (let index = -policy.warmups; index < policy.iterations; index++) {
        guard(signal); onProgress({ name: item.name, index, iterations: policy.iterations });
        try {
          collect();
          const start = ports.now(), drawing = await abortable(() => ports.render(item.snapshot, { signal }), signal); guard(signal);
          const rendered = ports.now(); assertCapacityDrawing(drawing, item, expected);
          const adopted = ports.adopt(drawing, item, expected); const adoptionEnd = ports.now();
          if (adopted.pageRoots !== expected.pages || adopted.fontsVerified !== true || !Number.isSafeInteger(adopted.nodes) || adopted.nodes < 1) {
            throw new Error(`Invalid adopted SVG/font verification: ${item.name}`);
          }
          await abortable(() => ports.paint(signal), signal); guard(signal);
          const paintEnd = ports.now(), longTasksMs = collect();
          const sample = { renderMs: rendered - start, validateAndAdoptMs: adoptionEnd - rendered,
            renderToAdoptMs: adoptionEnd - start, paintOpportunityMs: paintEnd - adoptionEnd, nodes: adopted.nodes, longTasksMs };
          if (![sample.renderMs, sample.validateAndAdoptMs, sample.renderToAdoptMs, sample.paintOpportunityMs].every(finite)) throw new Error("Invalid sample clock");
          if (index >= 0) result.samples.push(sample);
        } finally { ports.clear(); }
      }
      result.stats = Object.fromEntries(["renderMs", "validateAndAdoptMs", "renderToAdoptMs", "paintOpportunityMs", "nodes"]
        .map(key => [key, timingStats(result.samples.map(sample => sample[key]))]));
    }
    // Include the final DOM removal task; its observer entry may arrive after clear().
    await abortable(() => ports.paint(signal), signal); guard(signal); collect();
    report.status = "baseline-only";
    if (report.engineFontInitializationMs > policy.engineFontInitializationMaxMs) report.failures.push("engine-font-initialization");
    for (const [index, item] of report.cases.entries()) {
      if (item.stats.renderToAdoptMs.p95 > policy.cases[index].renderToAdoptP95Ms) report.failures.push(`${item.name}:render-to-adopt-p95`);
    }
    if (report.longTasksMs.some(duration => duration > policy.maxLongTaskMs)) report.failures.push("main-thread-long-task");
    report.assessment = report.failures.length ? "exceeded" : report.blockingObservationAvailable ? "within-engineering-limits" : "incomplete";
  } catch (error) {
    report.status = error?.name === "AbortError" ? "cancelled" : "failed";
    report.error = error?.message ?? String(error);
  } finally {
    for (const release of [() => ports.clear(), () => observation?.stop()]) {
      try { release(); }
      catch (error) { report.status = "failed"; report.assessment = "incomplete"; (report.cleanupErrors ??= []).push(error?.message ?? String(error)); }
    }
  }
  return report;
}
