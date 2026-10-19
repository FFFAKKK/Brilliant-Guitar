// Generated from shared/notation; run npm run notation:build.
export function throwIfRenderAborted(signal) {
    if (signal?.aborted)
        throw new DOMException("The notation render was superseded", "AbortError");
}
/** Cancellation stops waiting; late engine results/rejections are observed but never adopted. */
export function loadNotationEngine(load, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { cleanup(); reject(new DOMException("The notation render was superseded", "AbortError")); };
        const cleanup = () => signal?.removeEventListener("abort", abort);
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        Promise.resolve().then(() => {
            throwIfRenderAborted(signal);
            return load();
        }).then(engine => {
            cleanup();
            if (signal?.aborted)
                abort();
            else
                resolve(engine);
        }, error => { cleanup(); reject(error); });
    });
}
/** Fonts and their metrics stay on the complete SVG root. */
export function createEngravingSurface(engine, layout, theme) {
    const { Renderer, default: VexFlow } = engine;
    const staging = document.createElement("div");
    const renderer = new Renderer(staging, Renderer.Backends.SVG);
    renderer.resize(layout.width, layout.height);
    const context = renderer.getContext();
    context.setFillStyle(theme.ink).setStrokeStyle(theme.ink);
    const scale = (layout.staffSpace ?? VexFlow.STAVE_LINE_DISTANCE) / VexFlow.STAVE_LINE_DISTANCE;
    const drawing = context.openGroup("notation-engraving");
    if (!drawing)
        throw new Error("Notation renderer returned no SVG group");
    drawing.setAttribute("transform", `scale(${scale})`);
    return { staging, context, scale, drawing: drawing };
}
