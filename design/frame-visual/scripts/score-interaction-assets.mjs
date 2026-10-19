import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const result = await build({
  absWorkingDir: fileURLToPath(root),
  stdin: { contents: `
    export { initialEditorState, transitionEditor } from "./apps/workbench/src/editor/editor-machine.ts";
    export { eventEndPoint, eventStartPoint, normalizeScoreEditPoint, scoreEditPoints } from "./apps/workbench/src/editor/score-navigation.ts";
    export { resolveStaffNavigation } from "./apps/workbench/src/editor/staff-navigation-policy.ts";
    export { resolveScoreEventRange, selectScoreEventRange, singleEventRange } from "./apps/workbench/src/editor/range-selection.ts";
    export { ScoreClipboard } from "./apps/workbench/src/editor/score-clipboard.ts";
    export { createScoreClipboardFragment, isScoreClipboardFragmentV1, SCORE_CLIPBOARD_EVENT_LIMIT } from "./apps/workbench/src/contracts/score-clipboard.ts";
    export { resolveStaffEditKey } from "./apps/workbench/src/editor/staff-edit-key-policy.ts";
    export { resolveStaffPointerTarget } from "./apps/workbench/src/editor/staff-pointer-target.ts";
    export { rhythmCaretCenterY } from "./shared/notation/notation-renderer.ts";
    export { yForPitch } from "./apps/workbench/src/notation/input-position.ts";
    export { staffInputAdapter } from "./apps/workbench/src/editor/staff-input-adapter.ts";
    export { staffInteractionContribution } from "./shared/notation/interaction/staff-interaction-contribution.ts";
    export { tablatureInteractionContribution, TABLATURE_FRET_COMPOSITION } from "./shared/notation/interaction/tablature-interaction-contribution.ts";
    export { bindNotationInteraction, scopeNotationInteractions, staffInteractionBinding } from "./shared/notation/interaction/interaction-binding.ts";
    export { stepInputDuration } from "./apps/workbench/src/editor/input-duration.ts";
    export { inheritedAlterAtPoint, inheritedAlterBeforeEvent, accidentalForEvent, alterForAccidental, ACCIDENTAL_STATES } from "./apps/workbench/src/editor/accidental-state.ts";
    export { resolveNoteOverview, selectedNoteAction, stepNoteDuration, toggleNoteDot } from "./apps/workbench/src/editor/note-overview.ts";
    export { keySignatureAlterForStep, keySignatureFifthsAtMeasure } from "./apps/workbench/src/notation/key-signature.ts";
    export { keySignatureStateAtMeasure, keySignatureChangeIsNoOp } from "./shared/notation/key-signature.ts";
    export { KEY_SIGNATURE_FIFTHS, isKeySignatureChangeInput } from "./apps/workbench/src/contracts/note-input.ts";
    export { isDocumentMetadataInput, normalizeDocumentMetadata, documentMetadataKey, validateDocumentMetadataFields } from "./apps/workbench/src/contracts/document-metadata.ts";
    export { equalEventProperties, isEventProperties, PITCH_STEPS, STAFF_CLEFS } from "./shared/notation/note-properties.ts";
    export { isMeterInput, METER_DENOMINATORS } from "./shared/notation/note-properties.ts";
    export { equalMeter, measureMeterTargets } from "./shared/notation/measure-edit.ts";
    export { durationSymbol, noteheadSymbol, MUSIC_SYMBOLS, DURATION_NAMES } from "./apps/workbench/src/notation/music-symbols.ts";
    export { musicGlyphLayout } from "./apps/workbench/src/notation/music-glyph-layout.ts";
    export { scoreIntentToAction } from "./apps/workbench/src/application/edit/score-edit-intent.ts";
    export { reconcileScoreFocus } from "./apps/workbench/src/application/edit/score-focus-reconciler.ts";
  `, resolveDir: fileURLToPath(root), sourcefile: "backup-score-interaction-entry.ts" },
  bundle: true, format: "esm", target: "es2022", write: false, metafile: true,
  banner: { js: "// Generated from established pure score interaction sources; run notation:build. Do not edit." },
});
const sources = {};
for (const path of Object.keys(result.metafile.inputs).sort()) {
  if (path === "backup-score-interaction-entry.ts") continue;
  if (!path.startsWith("apps/workbench/src/editor/") && !path.startsWith("apps/workbench/src/notation/")
    && !path.startsWith("apps/workbench/src/contracts/") && !path.startsWith("apps/workbench/src/input/")
    && !path.startsWith("apps/workbench/src/application/edit/") && !path.startsWith("shared/notation/")) {
    throw new Error(`Unexpected score interaction dependency: ${path}`);
  }
  sources[path] = createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");
}
const assets = new Map([
  ["score-interaction.js", result.outputFiles[0].text],
  ["score-interaction-manifest.json", JSON.stringify({ format: 1, sources }, null, 2) + "\n"],
]);
for (const [name, value] of assets) {
  const path = new URL(`../src/vendor/${name}`, import.meta.url);
  if (process.argv.includes("--check")) {
    if (await readFile(path, "utf8") !== value) throw new Error(`Stale score interaction asset: ${name}`);
  } else await writeFile(path, value);
}
console.log(`Shared score interaction ${process.argv.includes("--check") ? "verified" : "built"}: ${Object.keys(sources).length} source modules`);
