// Private frame input context. Payloads and plugin contexts cannot supply it.
// Event phase bounds its lifetime to synchronous dispatch, including portals.
export function createFramePointerPresentation(root) {
  let current = null, gesture = false, released = false;
  const phase = Object.getOwnPropertyDescriptor(Event.prototype, "eventPhase")?.get;
  const dispatched = event => !released && event?.isTrusted === true && (phase ? phase.call(event) : event.eventPhase) > 0;
  const validClick = event => dispatched(event) && event.type === "click" && event.detail > 0;
  const validGesture = event => dispatched(event) && ["pointermove", "pointerup"].includes(event.type)
    && Number.isFinite(event.pointerId) && root.contains(event.target);
  const valid = event => gesture ? validGesture(event) : validClick(event);
  const capture = event => { current = validClick(event) ? event : null; };
  root.addEventListener("click", capture, true);
  return Object.freeze({
    current: () => valid(current),
    // Only a trusted frame-owned portal callback receives this method.
    run(event, operation) {
      const old = current, prior = gesture; gesture = false; current = validClick(event) ? event : null;
      try { return operation(); } finally { current = old; gesture = prior; }
    },
    // Only the private captured handle gesture calls this synchronously.
    runGesture(event, operation) {
      const old = current, prior = gesture; gesture = true; current = validGesture(event) ? event : null;
      try { return operation(); } finally { current = old; gesture = prior; }
    },
    dispose() { if (released) return; released = true; current = null; root.removeEventListener("click", capture, true); },
  });
}
