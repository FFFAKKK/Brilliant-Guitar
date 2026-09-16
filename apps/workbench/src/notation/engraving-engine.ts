let pending: Promise<typeof import("vexflow/bravura")> | undefined;

/** The score and tools share bundled fonts, one loading lifecycle and retry behavior. */
export function loadEngravingEngine() {
  pending ??= import("vexflow/bravura").then(async (engine) => {
    const faces = await Promise.all([document.fonts.load("40px Bravura"), document.fonts.load("12px Academico")]);
    if (faces.some((group) => group.length === 0)) throw new Error("Notation fonts unavailable");
    return engine;
  }).catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}
